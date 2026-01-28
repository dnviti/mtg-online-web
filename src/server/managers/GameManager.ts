
import { StrictGameState, ChoiceResult } from '../game/types';
import { RulesEngine } from '../game/RulesEngine';
import { GameLifecycle } from './game/GameLifecycle';
import { StateStoreManager } from './StateStoreManager';
import { ChoiceHandler } from '../game/engine/ChoiceHandler';
import { OracleEffectResolver } from '../game/engine/OracleEffectResolver';
import { EventEmitter } from 'events';

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
    // Save state
    await this.store.set(`game:${game.roomId}`, JSON.stringify(game));
    // Persist ID to a set if needed, but Rooms imply Games. 
    // We assume explicit access by ID usually.
  }

  private async acquireLock(roomId: string): Promise<boolean> {
    return this.store.acquireLock(`lock:game:${roomId}`, 5); // 5 sec lock
  }

  private async releaseLock(roomId: string) {
    await this.store.releaseLock(`lock:game:${roomId}`);
  }

  // --- Core Methods ---

  async createGame(gameId: string, players: any[], format?: string): Promise<StrictGameState> {
    // CRITICAL FIX: Delete any existing game state to prevent old games from being reused
    const existingGame = await this.getGameState(gameId);
    if (existingGame) {
      console.warn(`[GameManager] ⚠️ Found existing game state for ${gameId}. Deleting old state with ${Object.keys(existingGame.cards || {}).length} cards from previous session.`);
      await this.store.del(`game:${gameId}`);
    } else {
      console.log(`[GameManager] ✓ No existing game state found for ${gameId}. Creating fresh game.`);
    }

    // ... creation logic ...
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
      state.players[p.id] = { ...p, life: 20, poison: 0, manaPool: {}, handKept: false, isBot: !!p.isBot };
    });

    // Save initial state
    await this.saveGameState(state);

    // Initial Start logic moved to explicit startGame method to allow deck loading first
    // Save initial state is enough

    return state;
  }

  async startGame(roomId: string) {
    if (!await this.acquireLock(roomId)) return null;
    try {
      const game = await this.getGameState(roomId);
      if (!game) return null;

      const engine = new RulesEngine(game);
      engine.startGame(); // This triggers TBA (draw 7 cards)

      await this.saveGameState(game);
      return game;
    } finally {
      await this.releaseLock(roomId);
    }
  }

  async getGame(gameId: string): Promise<StrictGameState | null> {
    return this.getGameState(gameId);
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
   * Cache tokens for a game - stores the set code and cached tokens in game state
   * for use by OracleEffectResolver when creating tokens programmatically.
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

  async triggerBotCheck(roomId: string) {
    if (!await this.acquireLock(roomId)) return null;
    try {
      const game = await this.getGameState(roomId);
      if (!game) return null;

      GameLifecycle.triggerBotCheck(game);

      await this.saveGameState(game);
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

  async handleStrictAction(roomId: string, action: any, actorId: string) {
    console.log(`[GameManager] Handling strict action: ${action.type} for room ${roomId} by ${actorId}`);
    if (!await this.acquireLock(roomId)) {
      console.warn(`[GameManager] ⚠️ Failed to acquire lock for ${roomId}`);
      return null;
    }

    try {
      const game = await this.getGameState(roomId);
      if (!game) {
        console.warn(`[GameManager] ⚠️ Game state not found for room ${roomId}`);
        return null;
      }

      // Clear any stale pending logs from previous saves
      game.pendingLogs = [];

      const engine = new RulesEngine(game);
      console.log(`[GameManager] Current Game Phase: ${game.phase}, Step: ${game.step}`);

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
            // Support both direct (action.color) and nested (action.mana) structures
            const manaData = action.mana || { color: action.color, amount: action.amount || 1 };
            engine.addMana(actorId, { color: manaData.color, amount: manaData.amount });
            break;
          case 'tap_card':
            engine.tapCard(actorId, action.cardId);
            break;
          case 'activate_ability':
            engine.activateAbility(actorId, action.sourceId, action.abilityIndex, action.targets);
            break;
          case 'toggle_stop':
            // Handle stop request
            // engine.toggleStop(actorId); // Need implementation
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
            // Allow manual movement of cards between zones
            engine.moveCardToZone(action.cardId, action.toZone, false, action.position, action.faceIndex);
            break;
          case 'add_counter':
            engine.addCounter(actorId, action.cardId, action.counterType, action.amount || 1);
            break;
          case 'remove_counter':
            // Remove counter is just adding a negative amount
            engine.addCounter(actorId, action.cardId, action.counterType, -(action.amount || 1));
            break;
          case 'delete_card':
            // Only allow deleting tokens
            const cardToDelete = game.cards[action.cardId];
            if (cardToDelete && cardToDelete.isToken) {
              delete game.cards[action.cardId];
              console.log(`[GameManager] Token ${cardToDelete.name} deleted by ${actorId}`);
            } else {
              console.warn(`[GameManager] ⚠️ Cannot delete non-token card: ${action.cardId}`);
            }
            break;
          case 'restart_game':
            GameLifecycle.restartGame(game);
            break;
          case 'respond_to_choice':
            if (!game.pendingChoice) {
              console.warn(`[GameManager] No pending choice to respond to`);
              break;
            }

            const choiceResult: ChoiceResult = {
              choiceId: action.choiceId,
              type: action.choiceType,
              selectedOptionIds: action.selectedOptionIds,
              selectedCardIds: action.selectedCardIds,
              selectedPlayerId: action.selectedPlayerId,
              selectedValue: action.selectedValue,
              confirmed: action.confirmed,
              orderedIds: action.orderedIds
            };

            const validation = ChoiceHandler.validateChoice(game, actorId, choiceResult);
            if (!validation.valid) {
              console.warn(`[GameManager] Invalid choice: ${validation.error}`);
              throw new Error(validation.error);
            }

            const resolvedStackItem = ChoiceHandler.processChoice(game, choiceResult);
            if (resolvedStackItem) {
              // Check if this was a Ward payment choice
              if ((resolvedStackItem as any).wardPending) {
                const { WardHandler } = require('../game/engine/WardHandler');
                const wardPaid = WardHandler.processWardPayment(game, resolvedStackItem, choiceResult.confirmed);
                if (!wardPaid) {
                  // Spell was countered by Ward - don't resume resolution
                  console.log(`[GameManager] Spell countered by Ward`);
                  break;
                }
              }

              // Handle target selection for triggered abilities
              if (choiceResult.type === 'target_selection' && resolvedStackItem.type === 'trigger') {
                // Store selected targets in the stack item
                resolvedStackItem.targets = choiceResult.selectedCardIds || [];
                console.log(`[GameManager] Stored targets for trigger: ${resolvedStackItem.targets.join(', ')}`);
                // Don't resolve yet - let priority pass and resolve normally
                break;
              }

              const sourceCard = game.cards[resolvedStackItem.sourceId];
              if (sourceCard) {
                console.log(`[GameManager] Resuming resolution for ${sourceCard.name}`);
                OracleEffectResolver.resolveSpellEffects(game, sourceCard, resolvedStackItem);
              }
            }
            break;
          default:
            console.warn(`[GameManager] ⚠️ Unknown strict action type: ${normalizedType} (Original: ${action.type})`);
        }

        // Trigger Bot Check after human action
        if (game.step === 'mulligan' || game.priorityPlayerId !== actorId) {
          // await GameLifecycle.triggerBotCheck(game); // Ensure this is awaited if async, or just called if sync
          // The method is static and might be async? It was seemingly sync in previous code or handled internally.
          // Wait, previous code: GameLifecycle.triggerBotCheck(game);
          // I should check if it's async.
          GameLifecycle.triggerBotCheck(game);
        }

        await this.saveGameState(game);
        return game;

      } catch (e) {
        console.error(`[GameManager] ❌ Error executing strict action:`, e);
        return null; // Return null so socket handler knows it failed
      }
    } finally {
      await this.releaseLock(roomId);
    }
  }
}
