
import { StrictGameState } from '../game/types';
import { RulesEngine } from '../game/RulesEngine';
import { GameLifecycle } from './game/GameLifecycle';
import { StateStoreManager } from './StateStoreManager';
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
      maxZ: 100
    };

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
          case 'resolve_mulligan':
          case 'mulligan_decision':
            console.log(`[GameManager] Resolving mulligan for ${actorId}. Keep: ${action.keep}`);
            engine.resolveMulligan(actorId, action.keep, action.cardsToBottom);
            break;
          case 'create_token':
            engine.createToken(actorId, action.definition, action.position);
            break;
          case 'add_mana':
            engine.addMana(actorId, { color: action.color, amount: 1 });
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
            engine.changeLife(actorId, action.amount);
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
