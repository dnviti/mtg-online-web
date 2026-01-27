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
        const land = Object.values(game.cards).find(c => c.zone === 'hand' && c.controllerId === player.id && (c.types?.includes('Land') || c.typeLine?.includes('Land')));
        // Basic check for typeLine if types array is missing or empty from quick parsing
        // Safety check for card
        if (land) {
          console.log(`[Bot] Playing land ${land.name}`);
          new RulesEngine(game).playLand(player.id, land.instanceId);
          return;
        }
      }
    }

    // 2. Declare Attackers (only if active player and not yet declared)
    if (game.phase === 'combat' && game.step === 'declare_attackers' && game.activePlayerId === player.id && !game.attackersDeclared) {
      // Declaring 0 attackers for now to pass
      console.log(`[Bot] ${player.name} declaring attackers (none)`);
      new RulesEngine(game).declareAttackers(player.id, []);
      return;
    }

    // 3. Declare Blockers (only if defending player and not yet declared)
    if (game.phase === 'combat' && game.step === 'declare_blockers' && game.activePlayerId !== player.id && !game.blockersDeclared) {
      const blockers = this.chooseBlockers(game, player.id);
      console.log(`[Bot] ${player.name} declaring ${blockers.length} blocker(s)`);
      new RulesEngine(game).declareBlockers(player.id, blockers);
      return;
    }

    // 4. Pass Priority
    new RulesEngine(game).passPriority(player.id);
  }

  /**
   * Bot logic for choosing blockers.
   * Simple strategy: Block the largest attacker if we have a creature that can survive or trade favorably.
   */
  static chooseBlockers(game: StrictGameState, defenderId: string): { blockerId: string, attackerId: string }[] {
    const blockers: { blockerId: string, attackerId: string }[] = [];

    // Get all attackers
    const attackers = Object.values(game.cards).filter(c => !!c.attacking);

    if (attackers.length === 0) {
      return blockers; // No attackers to block
    }

    // Get all potential blockers (untapped creatures controlled by defender)
    const potentialBlockers = Object.values(game.cards).filter(c =>
      c.controllerId === defenderId &&
      c.zone === 'battlefield' &&
      !c.tapped &&
      (c.types?.includes('Creature') || c.typeLine?.includes('Creature'))
    );

    if (potentialBlockers.length === 0) {
      console.log(`[Bot] ${game.players[defenderId].name} has no untapped creatures to block with`);
      return blockers; // No creatures available to block
    }

    // Simple blocking strategy: Block lethal damage first, then largest threats
    // Sort attackers by power (descending) - block biggest threats
    const sortedAttackers = [...attackers].sort((a, b) => (b.power || 0) - (a.power || 0));

    // Check if we're in lethal range
    const defender = game.players[defenderId];
    const totalAttackPower = attackers.reduce((sum, atk) => sum + (atk.power || 0), 0);
    const isLethal = totalAttackPower >= defender.life;

    if (isLethal) {
      // We must block to survive - block as many as possible
      console.log(`[Bot] ${defender.name} is facing lethal damage (${totalAttackPower} damage, ${defender.life} life) - blocking aggressively`);

      for (const attacker of sortedAttackers) {
        const blocker = potentialBlockers.find(b =>
          !blockers.some(block => block.blockerId === b.instanceId)
        );

        if (blocker) {
          blockers.push({ blockerId: blocker.instanceId, attackerId: attacker.instanceId });
          console.log(`[Bot] Blocking ${attacker.name} (${attacker.power}/${attacker.toughness}) with ${blocker.name} (${blocker.power}/${blocker.toughness})`);
        }
      }
    } else {
      // Not lethal - only block if we can trade favorably or survive
      for (const attacker of sortedAttackers) {
        const blocker = potentialBlockers.find(b => {
          // Don't reuse blockers
          if (blockers.some(block => block.blockerId === b.instanceId)) return false;

          const blockerPower = b.power || 0;
          const blockerToughness = b.toughness || 0;
          const attackerPower = attacker.power || 0;
          const attackerToughness = attacker.toughness || 0;

          // Good block scenarios:
          // 1. We kill the attacker and survive
          const weKill = blockerPower >= attackerToughness;
          const weSurvive = blockerToughness > attackerPower;

          // 2. We trade (both die)
          const weTrade = blockerPower >= attackerToughness && attackerPower >= blockerToughness;

          // 3. Blocker is bigger/better (higher combined power+toughness)
          const ourValue = blockerPower + blockerToughness;
          const theirValue = attackerPower + attackerToughness;

          // Block if: we survive, or it's a favorable trade
          return (weKill && weSurvive) || (weTrade && theirValue >= ourValue);
        });

        if (blocker) {
          blockers.push({ blockerId: blocker.instanceId, attackerId: attacker.instanceId });
          console.log(`[Bot] Blocking ${attacker.name} (${attacker.power}/${attacker.toughness}) with ${blocker.name} (${blocker.power}/${blocker.toughness})`);
        }
      }
    }

    return blockers;
  }
}
