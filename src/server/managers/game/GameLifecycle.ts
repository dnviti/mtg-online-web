import { StrictGameState } from '../../game/types';
import { RulesEngine } from '../../game/RulesEngine';
import { BotLogic } from './BotLogic';

/**
 * GameLifecycle
 * 
 * Manages high-level game session operations that are outside the normal rules loop.
 * This includes starting/restarting games, injecting debug cards, and triggering
 * Bot actions.
 */
export class GameLifecycle {

  /**
   * Adds a card directly to the game (usually for debug or setup purposes).
   */
  static addCardToGame(game: StrictGameState, cardData: any) {
    // Helper to add card to game externally (e.g. from debug or setup)
    // This replicates the old logic
    const cardId = Math.random().toString(36).substring(7);
    const card = {
      instanceId: cardId,
      controllerId: game.activePlayerId, // Default to AP
      ownerId: game.activePlayerId,
      zone: 'hand', // Default to hand
      ...cardData
    };
    game.cards[cardId] = card;
    console.log(`[GameLifecycle] Added card ${card.name} to ${card.zone}`);
    return card;
  }

  static restartGame(game: StrictGameState) {
    console.log(`[GameLifecycle] Restarting game ${game.id}`);
    game.turnCount = 1;
    game.phase = 'setup';
    game.step = 'mulligan';
    game.stack = [];
    game.passedPriorityCount = 0;

    // Reset players
    Object.values(game.players).forEach(p => {
      p.life = 20;
      p.poison = 0;
      p.manaPool = {};
      p.handKept = false;
      p.mulliganCount = 0;
    });

    // Reset cards to library? 
    // Simplified: Just shuffle all owned cards back.
    Object.values(game.cards).forEach(c => {
      c.zone = 'library';
      c.tapped = false;
      c.counters = [];
      c.attachedTo = undefined;
    });

    // Start
    const engine = new RulesEngine(game);
    engine.startGame();
  }

  /**
   * Triggers bot processing loop - bots will continue taking actions
   * until a human player has priority.
   */
  static triggerBotCheck(game: StrictGameState) {
    BotLogic.processActionsLoop(game);
  }
}
