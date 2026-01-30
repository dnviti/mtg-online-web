import { StrictGameState } from '../game/types';
import { RulesEngine } from '../game/RulesEngine';
import { GameLifecycle } from './game/GameLifecycle';
import { StateStoreManager } from './StateStoreManager';
import { DebugManager } from '../game/engine/DebugManager';
import { DebugPauseEvent, DebugStateEvent } from '../game/types/debug';
import { EventEmitter } from 'events';

/**
 * GameManager - Manual Play Mode
 *
 * Manages game state and actions.
 * All players handle their own actions manually.
 */
export class GameManager extends EventEmitter {

  private get store() {
    const client = StateStoreManager.getInstance().store;
    if (!client) throw new Error("State Store not initialized");
    return client;
  }

  // --- Redis Helpers ---

  private async getGameState(roomId: string): Promise<StrictGameState | null> {
    const data = await this.store.get(`game:${roomId}`);
    return data ? JSON.parse(data) : null;
  }

  private async saveGameState(game: StrictGameState) {
    await this.store.set(`game:${game.roomId}`, JSON.stringify(game));
  }

  private async acquireLock(roomId: string): Promise<boolean> {
    return this.store.acquireLock(`lock:game:${roomId}`, 5);
  }

  private async releaseLock(roomId: string) {
    await this.store.releaseLock(`lock:game:${roomId}`);
  }

  // --- Core Methods ---

  async createGame(gameId: string, players: any[], format?: string): Promise<StrictGameState> {
    const existingGame = await this.getGameState(gameId);
    if (existingGame) {
      console.warn(`[GameManager] Found existing game state for ${gameId}. Deleting old state.`);
      await this.store.del(`game:${gameId}`);
    }

    const state: StrictGameState = {
      id: gameId,
      roomId: gameId,
      format,
      players: {},
      cards: {},
      turnOrder: players.map(p => p.id),
      activePlayerId: players[0].id,
      priorityPlayerId: players[0].id,
      phase: 'setup',
      step: 'mulligan',
      turnCount: 1,
      stack: [],
      passedPriorityCount: 0,
      landsPlayedThisTurn: 0,
      attackersDeclared: false,
      blockersDeclared: false,
      maxZ: 100,
      logs: []
    };

    console.log(`[GameManager] Creating game ${gameId} with players: ${players.map(p => `${p.name} (${p.id})`).join(', ')}`);

    players.forEach(p => {
      state.players[p.id] = { ...p, life: 20, poison: 0, manaPool: {}, handKept: false };
    });

    // Initialize debug session if DEV_MODE is enabled
    DebugManager.initializeGameDebugSession(state);

    await this.saveGameState(state);
    return state;
  }

  async startGame(roomId: string) {
    if (!await this.acquireLock(roomId)) return null;
    try {
      const game = await this.getGameState(roomId);
      if (!game) return null;

      const engine = new RulesEngine(game);
      engine.startGame();

      await this.saveGameState(game);
      return game;
    } finally {
      await this.releaseLock(roomId);
    }
  }

  async getGame(gameId: string): Promise<StrictGameState | null> {
    return this.getGameState(gameId);
  }

  /**
   * Delete game state from Redis
   */
  async deleteGame(gameId: string): Promise<boolean> {
    console.log(`[GameManager] Deleting game state for ${gameId}`);
    await this.store.del(`game:${gameId}`);
    return true;
  }

  // --- Facade Methods ---

  async addCardToGame(roomId: string, cardData: any) {
    if (!await this.acquireLock(roomId)) return null;
    try {
      const game = await this.getGameState(roomId);
      if (!game) return null;

      const card = GameLifecycle.addCardToGame(game, cardData);

      await this.saveGameState(game);
      return card;
    } finally {
      await this.releaseLock(roomId);
    }
  }

  /**
   * Cache tokens for a game
   */
  async cacheTokensForGame(roomId: string, setCode: string, tokens: any[]) {
    if (!await this.acquireLock(roomId)) return null;
    try {
      const game = await this.getGameState(roomId);
      if (!game) return null;

      game.setCode = setCode;
      game.cachedTokens = tokens;

      await this.saveGameState(game);
      console.log(`[GameManager] Cached ${tokens.length} tokens for game ${roomId} (set: ${setCode})`);
      return game;
    } finally {
      await this.releaseLock(roomId);
    }
  }

  async restartGame(roomId: string) {
    if (!await this.acquireLock(roomId)) return null;
    try {
      const game = await this.getGameState(roomId);
      if (!game) return null;

      GameLifecycle.restartGame(game);

      await this.saveGameState(game);
      return game;
    } finally {
      await this.releaseLock(roomId);
    }
  }

  async handleAction(roomId: string, action: any, actorId: string) {
    return this.handleStrictAction(roomId, action, actorId);
  }

  /**
   * Handle player action.
   */
  async handleStrictAction(
    roomId: string,
    action: any,
    actorId: string,
    skipDebugPause: boolean = false
  ): Promise<StrictGameState | { debugPause: DebugPauseEvent } | null> {
    console.log(`[GameManager] Handling action: ${action.type} for room ${roomId} by ${actorId}`);
    if (!await this.acquireLock(roomId)) {
      console.warn(`[GameManager] Failed to acquire lock for ${roomId}`);
      return null;
    }

    try {
      const game = await this.getGameState(roomId);
      if (!game) {
        console.warn(`[GameManager] Game state not found for room ${roomId}`);
        return null;
      }

      // Check for debug mode pause
      if (!skipDebugPause && DebugManager.isEnabled(roomId)) {
        const pauseEvent = DebugManager.createSnapshot(game, action, actorId);
        if (pauseEvent) {
          console.log(`[GameManager] Debug pause: ${pauseEvent.description}`);
          return { debugPause: pauseEvent };
        }
      }

      game.pendingLogs = [];

      const engine = new RulesEngine(game);
      console.log(`[GameManager] Current Phase: ${game.phase}, Step: ${game.step}`);

      try {
        const normalizedType = action.type.toLowerCase();
        switch (normalizedType) {
          case 'pass_priority':
            engine.passPriority(actorId);
            break;
          case 'play_land':
            engine.playLand(actorId, action.cardId);
            break;
          case 'cast_spell':
            engine.castSpell(actorId, action.cardId, action.targets);
            break;
          case 'declare_attackers':
            engine.declareAttackers(actorId, action.attackers);
            break;
          case 'declare_blockers':
            engine.declareBlockers(actorId, action.blockers);
            break;
          case 'shuffle_library':
            engine.shuffleLibrary(actorId);
            break;
          case 'resolve_mulligan':
          case 'mulligan_decision':
            console.log(`[GameManager] Resolving mulligan for ${actorId}. Keep: ${action.keep}`);
            engine.resolveMulligan(actorId, action.keep, action.cardsToBottom);
            break;
          case 'create_token':
            engine.createToken(actorId, action.definition, action.position);
            break;
          case 'add_mana':
            const manaData = action.mana || { color: action.color, amount: action.amount || 1 };
            engine.addMana(actorId, { color: manaData.color, amount: manaData.amount });
            break;
          case 'tap_card':
            engine.tapCard(actorId, action.cardId);
            break;
          case 'activate_ability':
            engine.activateAbility(actorId, action.sourceId, action.abilityIndex, action.targets);
            break;
          case 'add_trigger':
            // Manual trigger placement for manual play mode
            engine.addTriggerToStack(actorId, action.sourceId, action.triggerName, action.triggerText, action.targets);
            break;
          case 'toggle_stop':
            if (game.players[actorId]) {
              game.players[actorId].stopRequested = !game.players[actorId].stopRequested;
              console.log(`[GameManager] Player ${actorId} stopRequested: ${game.players[actorId].stopRequested}`);
            }
            break;
          case 'draw_card':
            engine.drawCard(actorId);
            break;
          case 'change_life':
          case 'life_change':
          case 'update_life':
            engine.changeLife(actorId, action.amount);
            break;
          case 'move_card':
            engine.moveCardToZone(action.cardId, action.toZone, false, action.position, action.faceIndex);
            break;
          case 'add_counter':
            engine.addCounter(actorId, action.cardId, action.counterType, action.amount || 1);
            break;
          case 'remove_counter':
            engine.addCounter(actorId, action.cardId, action.counterType, -(action.amount || 1));
            break;
          case 'delete_card':
            const cardToDelete = game.cards[action.cardId];
            if (cardToDelete && cardToDelete.isToken) {
              delete game.cards[action.cardId];
              console.log(`[GameManager] Token ${cardToDelete.name} deleted by ${actorId}`);
            } else {
              console.warn(`[GameManager] Cannot delete non-token card: ${action.cardId}`);
            }
            break;
          case 'restart_game':
            GameLifecycle.restartGame(game);
            break;
          case 'surrender':
            const surrenderingPlayer = game.players[actorId];
            if (surrenderingPlayer) {
              surrenderingPlayer.life = 0;
              console.log(`[GameManager] Player ${actorId} (${surrenderingPlayer.name}) surrendered`);

              const remainingPlayersAfterSurrender = Object.values(game.players).filter(p => p.life > 0);
              if (remainingPlayersAfterSurrender.length <= 1) {
                game.gameOver = true;
                game.winnerId = remainingPlayersAfterSurrender[0]?.id;
                game.winnerName = remainingPlayersAfterSurrender[0]?.name;
                game.endReason = 'surrender';
                game.gameEndedAt = Date.now();
                console.log(`[GameManager] Game over! Winner: ${game.winnerName}`);
              }
            }
            break;
          case 'declare_loss':
            const losingPlayer = game.players[actorId];
            if (losingPlayer) {
              console.log(`[GameManager] Player ${actorId} (${losingPlayer.name}) declared loss`);

              const remainingPlayersAfterLoss = Object.values(game.players).filter(p => p.id !== actorId && p.life > 0);
              game.gameOver = true;
              if (remainingPlayersAfterLoss.length === 1) {
                game.winnerId = remainingPlayersAfterLoss[0].id;
                game.winnerName = remainingPlayersAfterLoss[0].name;
              } else if (remainingPlayersAfterLoss.length === 0) {
                // Draw scenario - no winner
                game.endReason = 'draw';
              }
              game.endReason = game.endReason || 'life_loss';
              game.gameEndedAt = Date.now();
              console.log(`[GameManager] Game over! Winner: ${game.winnerName || 'Draw'}`);
            }
            break;
          case 'modify_card':
            const cardToModify = game.cards[action.cardId];
            if (!cardToModify || cardToModify.zone !== 'battlefield') {
              console.warn(`[GameManager] Cannot modify card: ${action.cardId}`);
              break;
            }

            if (!cardToModify.modifiers) cardToModify.modifiers = [];
            const mod = action.modification;

            if (mod.type === 'clear_all') {
              cardToModify.modifiers = [];
              cardToModify.power = cardToModify.basePower;
              cardToModify.toughness = cardToModify.baseToughness;
              cardToModify.keywords = cardToModify.definition?.keywords || [];
              console.log(`[GameManager] Cleared all modifications from ${cardToModify.name}`);
            } else if (mod.type === 'pt_boost') {
              cardToModify.modifiers.push({
                sourceId: 'manual',
                type: 'pt_boost',
                value: mod.value,
                untilEndOfTurn: action.untilEndOfTurn ?? true
              });
              cardToModify.power = (cardToModify.power ?? 0) + mod.value.power;
              cardToModify.toughness = (cardToModify.toughness ?? 0) + mod.value.toughness;
              console.log(`[GameManager] ${cardToModify.name} got ${mod.value.power >= 0 ? '+' : ''}${mod.value.power}/${mod.value.toughness >= 0 ? '+' : ''}${mod.value.toughness}`);
            } else if (mod.type === 'ability_grant') {
              cardToModify.modifiers.push({
                sourceId: 'manual',
                type: 'ability_grant',
                value: mod.value,
                untilEndOfTurn: action.untilEndOfTurn ?? true
              });
              if (!cardToModify.keywords) cardToModify.keywords = [];
              if (!cardToModify.keywords.includes(mod.value)) {
                cardToModify.keywords.push(mod.value);
              }
              console.log(`[GameManager] ${cardToModify.name} gained ${mod.value}`);
            } else if (mod.type === 'type_change') {
              cardToModify.modifiers.push({
                sourceId: 'manual',
                type: 'type_change',
                value: mod.value,
                untilEndOfTurn: action.untilEndOfTurn ?? true
              });
              if (mod.value.addTypes) {
                cardToModify.types = [...new Set([...(cardToModify.types || []), ...mod.value.addTypes])];
              }
              if (mod.value.basePT) {
                cardToModify.basePower = mod.value.basePT.power;
                cardToModify.baseToughness = mod.value.basePT.toughness;
                cardToModify.power = mod.value.basePT.power;
                cardToModify.toughness = mod.value.basePT.toughness;
              }
              console.log(`[GameManager] ${cardToModify.name} type changed to: ${cardToModify.types?.join(', ')}`);
            }
            break;
          default:
            console.warn(`[GameManager] Unknown action type: ${normalizedType}`);
        }

        await this.saveGameState(game);
        return game;

      } catch (e) {
        console.error(`[GameManager] Error executing action:`, e);
        return null;
      }
    } finally {
      await this.releaseLock(roomId);
    }
  }

  // ============================================
  // DEBUG MODE METHODS
  // ============================================

  /**
   * Continue execution after a debug pause.
   */
  async handleDebugContinue(roomId: string, snapshotId: string): Promise<{
    state: StrictGameState;
  } | null> {
    const pendingAction = DebugManager.continueExecution(roomId, snapshotId);
    if (!pendingAction) {
      console.warn(`[GameManager] No pending action to continue for snapshot ${snapshotId}`);
      return null;
    }

    const result = await this.handleStrictAction(roomId, pendingAction.action, pendingAction.actorId, true);

    if (!result) {
      console.warn(`[GameManager] Action execution failed for snapshot ${snapshotId}`);
      return null;
    }

    if ('debugPause' in result) {
      const currentState = await this.getGame(roomId);
      if (currentState) {
        DebugManager.commitSnapshot(roomId, snapshotId, currentState);
        return { state: currentState };
      }
      return null;
    }

    DebugManager.commitSnapshot(roomId, snapshotId, result);
    return { state: result };
  }

  /**
   * Cancel a pending debug action.
   */
  async handleDebugCancel(roomId: string, snapshotId: string): Promise<{ state: StrictGameState; debugState: DebugStateEvent } | null> {
    if (!await this.acquireLock(roomId)) {
      return null;
    }

    try {
      const game = await this.getGameState(roomId);
      if (!game) {
        return null;
      }

      const debugState = DebugManager.cancelAction(roomId, snapshotId, game);
      if (!debugState) {
        return null;
      }

      await this.saveGameState(game);
      return { state: game, debugState };
    } finally {
      await this.releaseLock(roomId);
    }
  }

  /**
   * Undo the last executed action.
   */
  async handleDebugUndo(roomId: string): Promise<{ state: StrictGameState; debugState: DebugStateEvent } | null> {
    const undoResult = DebugManager.undo(roomId);
    if (!undoResult) {
      return null;
    }

    if (!await this.acquireLock(roomId)) {
      return null;
    }

    try {
      await this.saveGameState(undoResult.restoredState);
      return { state: undoResult.restoredState, debugState: undoResult.event };
    } finally {
      await this.releaseLock(roomId);
    }
  }

  /**
   * Redo an undone action.
   */
  async handleDebugRedo(roomId: string): Promise<{ state: StrictGameState; debugState: DebugStateEvent } | null> {
    const redoResult = DebugManager.redo(roomId);
    if (!redoResult) {
      return null;
    }

    if (!await this.acquireLock(roomId)) {
      return null;
    }

    try {
      await this.saveGameState(redoResult.restoredState);
      return { state: redoResult.restoredState, debugState: redoResult.event };
    } finally {
      await this.releaseLock(roomId);
    }
  }

  /**
   * Toggle debug mode for a game.
   */
  async handleDebugToggle(roomId: string, enabled: boolean): Promise<DebugStateEvent> {
    if (!await this.acquireLock(roomId)) {
      return DebugManager.toggleDebugMode(roomId, enabled);
    }

    try {
      const game = await this.getGameState(roomId);
      const debugState = DebugManager.toggleDebugMode(roomId, enabled, game || undefined);

      if (game) {
        await this.saveGameState(game);
      }

      return debugState;
    } finally {
      await this.releaseLock(roomId);
    }
  }

  /**
   * Clear debug history for a game.
   */
  async handleDebugClearHistory(roomId: string): Promise<DebugStateEvent> {
    if (!await this.acquireLock(roomId)) {
      return DebugManager.clearHistory(roomId);
    }

    try {
      const game = await this.getGameState(roomId);
      const debugState = DebugManager.clearHistory(roomId, game || undefined);

      if (game) {
        await this.saveGameState(game);
      }

      return debugState;
    } finally {
      await this.releaseLock(roomId);
    }
  }

  /**
   * Get current debug state for a game.
   */
  getDebugState(roomId: string): DebugStateEvent {
    return DebugManager.getDebugState(roomId);
  }

  /**
   * Check if debug mode is paused for a game.
   */
  isDebugPaused(roomId: string): boolean {
    return DebugManager.isPaused(roomId);
  }
}
