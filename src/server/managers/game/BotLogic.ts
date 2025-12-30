import { StrictGameState } from '../../game/types';
import { RulesEngine } from '../../game/RulesEngine';

/**
 * BotLogic
 * 
 * Implements simple AI behavior for automated players.
 * Bots can play lands, declare attacks, and pass priority when appropriate.
 */
export class BotLogic {
  /**
   * Evaluates the game state and performs an action for the active bot player if possible.
   */
  static processActions(game: StrictGameState) {
    // 0. Mulligan Phase
    if (game.step === 'mulligan') {
      Object.values(game.players).forEach(p => {
        if (p.isBot && !p.handKept) {
          console.log(`[Bot] ${p.name} keeps hand.`);
          new RulesEngine(game).resolveMulligan(p.id, true);
        }
      });
      return;
    }

    const priorityPlayerId = game.priorityPlayerId;
    const player = game.players[priorityPlayerId];

    if (!player || !player.isBot) return;
    // if (game.priorityPlayerId !== activePlayerId) return; // Wait for priority -> Redundant now


    // Simple AI:
    // 1. Play Land
    if (game.phase === 'main1' || game.phase === 'main2') {
      if (game.landsPlayedThisTurn === 0) {
        // Find land
        const land = Object.values(game.cards).find(c => c.zone === 'hand' && c.controllerId === player.id && (c.types || c.typeLine).includes('Land'));
        // Basic check for typeLine if types array is missing or empty from quick parsing
        // Safety check for card
        if (land) {
          console.log(`[Bot] Playing land ${land.name}`);
          new RulesEngine(game).playLand(player.id, land.instanceId);
          return;
        }
      }
    }

    // 2. Attack
    if (game.phase === 'combat' && game.step === 'declare_attackers') {
      // Declaring 0 attackers for now to pass
      new RulesEngine(game).declareAttackers(player.id, []);
      return;
    }

    // 3. Pass Priority
    new RulesEngine(game).passPriority(player.id);
  }
}
