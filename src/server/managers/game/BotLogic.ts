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
    const activePlayerId = game.activePlayerId;
    const player = game.players[activePlayerId];

    if (!player || !player.isBot) return;
    if (game.priorityPlayerId !== activePlayerId) return; // Wait for priority

    // Simple AI:
    // 1. Play Land
    if (game.phase === 'main1' || game.phase === 'main2') {
      if (game.landsPlayedThisTurn === 0) {
        const land = Object.values(game.cards).find(c => c.zone === 'hand' && c.controllerId === player.id && c.types.includes('Land'));
        if (land) {
          console.log(`[Bot] Playing land ${land.name}`);
          new RulesEngine(game).playLand(player.id, land.instanceId);
          return;
        }
      }
    }

    // 2. Attack
    if (game.phase === 'combat' && game.step === 'declare_attackers') {
      // ... attack logic ...
      // Declaring 0 attackers for now to pass
      new RulesEngine(game).declareAttackers(player.id, []);
      return;
    }

    // 3. Pass Priority
    new RulesEngine(game).passPriority(player.id);
  }
}
