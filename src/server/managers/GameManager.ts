
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

    // Run Logic (Locking not strictly needed for Create if unique, but good practice if reuse ID)
    if (await this.acquireLock(gameId)) {
      try {
        // Initial Start
        const engine = new RulesEngine(state);
        engine.startGame();
        await this.saveGameState(state);
      } finally {
        await this.releaseLock(gameId);
      }
    }

    return state;
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
    if (!await this.acquireLock(roomId)) {
      // console.warn(`[GameManager] Failed to acquire lock for ${roomId}`);
      return null;
    }

    try {
      const game = await this.getGameState(roomId);
      if (!game) return null;

      const engine = new RulesEngine(game);

      try {
        switch (action.type) {
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
            engine.resolveMulligan(actorId, action.keep, action.cardsToBottom);
            break;
          // ... other actions
        }

        // Trigger Bot Check after human action
        if (game.priorityPlayerId !== actorId) {
          GameLifecycle.triggerBotCheck(game);
        }

        await this.saveGameState(game);
        return game;

      } catch (e) {
        console.error(e);
        return null;
      }
    } finally {
      await this.releaseLock(roomId);
    }
  }
}
