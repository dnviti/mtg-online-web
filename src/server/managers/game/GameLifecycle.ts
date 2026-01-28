import { StrictGameState } from '../../game/types';
import { RulesEngine } from '../../game/RulesEngine';
import { BotLogic } from './BotLogic';
import { DebugManager } from '../../game/engine/DebugManager';
import { DebugPauseEvent } from '../../game/types/debug';

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

    // Reset game-level state
    game.turnCount = 1;
    game.phase = 'setup';
    game.step = 'mulligan';
    game.stack = [];
    game.passedPriorityCount = 0;
    game.landsPlayedThisTurn = 0;
    game.attackersDeclared = false;
    game.blockersDeclared = false;
    game.activePlayerId = game.turnOrder[0];
    game.priorityPlayerId = game.turnOrder[0];
    game.logs = [];
    game.pendingLogs = [];
    game.maxZ = 100;

    // Reset players
    Object.values(game.players).forEach((p, index) => {
      p.life = 20;
      p.poison = 0;
      p.energy = 0;
      p.manaPool = {};
      p.handKept = false;
      p.mulliganCount = 0;
      p.isActive = index === 0;
      p.hasPassed = false;
      p.stopRequested = false;
    });

    // Reset cards to library, but remove tokens entirely
    // Tokens cease to exist when they leave the battlefield
    Object.entries(game.cards).forEach(([cardId, card]) => {
      if (card.isToken) {
        delete game.cards[cardId];
      } else {
        // Reset card state
        card.zone = 'library';
        card.tapped = false;
        card.faceDown = false;
        card.activeFaceIndex = 0;
        card.counters = [];
        card.attachedTo = undefined;
        card.attacking = undefined;
        card.blocking = undefined;
        card.damageAssignment = undefined;
        card.damageMarked = 0;
        card.modifiers = [];
        card.controlledSinceTurn = 0;
        // Reset P/T to base values
        card.power = card.basePower;
        card.toughness = card.baseToughness;
        if (card.baseDefense !== undefined) {
          card.defense = card.baseDefense;
        }
      }
    });

    // Start the game (shuffles libraries, draws opening hands)
    const engine = new RulesEngine(game);
    engine.startGame();
  }

  /**
   * Triggers bot processing loop - bots will continue taking actions
   * until a human player has priority.
   * Returns any pending debug pause event if a bot action triggered a pause.
   */
  static triggerBotCheck(game: StrictGameState): DebugPauseEvent | null {
    BotLogic.processActionsLoop(game);

    // Check if bot action created a debug pause
    if (DebugManager.isPaused(game.roomId)) {
      return DebugManager.getPendingPauseEvent(game.roomId);
    }

    return null;
  }
}
