import { StrictGameState } from '../game/types';
import { RulesEngine } from '../game/RulesEngine';
import { GameLifecycle } from './game/GameLifecycle';
import { EventEmitter } from 'events';

export class GameManager extends EventEmitter {
  public games: Map<string, StrictGameState> = new Map();

  createGame(gameId: string, players: any[], format?: string): StrictGameState {
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

    this.games.set(gameId, state);

    // Initial Start
    const engine = new RulesEngine(state);
    engine.startGame();

    return state;
  }

  getGame(gameId: string) {
    return this.games.get(gameId);
  }

  // --- Facade Methods ---

  addCardToGame(roomId: string, cardData: any) {
    const game = this.games.get(roomId);
    if (!game) return;
    // We need to import GameLifecycle.
    // Cyclic/late import? Or just import at top?
    // Added import at top.
    // const { GameLifecycle } = require('./game/GameLifecycle'); // Dynamic require to ensure module is loaded?
    // Or plain import if circular dep handled.
    // GameLifecycle doesn't import GameManager. Secure.
    return GameLifecycle.addCardToGame(game, cardData);
  }

  triggerBotCheck(roomId: string) {
    const game = this.games.get(roomId);
    if (!game) return;
    // const { GameLifecycle } = require('./game/GameLifecycle');
    GameLifecycle.triggerBotCheck(game);
    return game;
  }

  restartGame(roomId: string) {
    const game = this.games.get(roomId);
    if (!game) return;
    // const { GameLifecycle } = require('./game/GameLifecycle');
    GameLifecycle.restartGame(game);
  }

  handleAction(roomId: string, action: any, actorId: string) {
    // Legacy alias to Strict Action
    return this.handleStrictAction(roomId, action, actorId);
  }

  handleStrictAction(roomId: string, action: any, actorId: string) {
    const game = this.games.get(roomId);
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

      return game;
    } catch (e) {
      console.error(e);
      return null;
    }
  }
}
