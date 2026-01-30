import { StrictGameState } from '../../game/types';
import { RulesEngine } from '../../game/RulesEngine';

/**
 * GameLifecycle - Manual Play Mode
 *
 * Manages high-level game session operations.
 * Bot logic has been removed - all players are human.
 */
export class GameLifecycle {

  /**
   * Adds a card directly to the game (usually for debug or setup purposes).
   */
  static addCardToGame(game: StrictGameState, cardData: any) {
    const cardId = Math.random().toString(36).substring(7);
    const card = {
      instanceId: cardId,
      controllerId: game.activePlayerId,
      ownerId: game.activePlayerId,
      zone: 'hand',
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
    Object.entries(game.cards).forEach(([cardId, card]) => {
      if (card.isToken) {
        delete game.cards[cardId];
      } else {
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
}
