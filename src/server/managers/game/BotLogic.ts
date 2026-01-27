import { StrictGameState } from '../../game/types';
import { RulesEngine } from '../../game/RulesEngine';

/**
 * BotLogic
 *
 * Implements AI behavior for automated players.
 * Bots can play lands, cast creatures, declare attacks/blocks, and pass priority.
 */
export class BotLogic {

  // Maximum iterations to prevent infinite loops
  private static MAX_ITERATIONS = 50;

  /**
   * Processes bot actions in a loop until a human player has priority.
   * Returns true if any action was taken.
   */
  static processActionsLoop(game: StrictGameState): boolean {
    let iterations = 0;
    let actionTaken = false;

    while (iterations < this.MAX_ITERATIONS) {
      iterations++;

      const priorityPlayer = game.players[game.priorityPlayerId];

      // Stop if human has priority
      if (!priorityPlayer?.isBot) {
        break;
      }

      // Process single action
      const result = this.processSingleAction(game);
      if (result) {
        actionTaken = true;
      }

      // Safety: if no action was taken, break to avoid stuck loops
      if (!result) {
        break;
      }
    }

    if (iterations >= this.MAX_ITERATIONS) {
      console.warn(`[BotLogic] ⚠️ Max iterations reached (${this.MAX_ITERATIONS})`);
    }

    return actionTaken;
  }

  /**
   * Evaluates the game state and performs a single action for the current priority bot.
   * Returns true if an action was taken.
   */
  static processSingleAction(game: StrictGameState): boolean {
    // 0. Mulligan Phase - all bots keep immediately
    if (game.step === 'mulligan') {
      let actionTaken = false;
      Object.values(game.players).forEach(p => {
        if (p.isBot && !p.handKept) {
          console.log(`[Bot] ${p.name} keeps hand.`);
          new RulesEngine(game).resolveMulligan(p.id, true);
          actionTaken = true;
        }
      });
      return actionTaken;
    }

    const priorityPlayerId = game.priorityPlayerId;
    const player = game.players[priorityPlayerId];

    if (!player || !player.isBot) return false;

    const engine = new RulesEngine(game);

    // 1. Draw step - bot draws automatically
    if (game.step === 'draw' && game.activePlayerId === player.id) {
      if (game.turnCount > 1 || game.turnOrder.length > 2) {
        console.log(`[Bot] ${player.name} draws a card.`);
        engine.drawCard(player.id);
      }
      engine.passPriority(player.id);
      return true;
    }

    // 2. Play Land (main phases only)
    if ((game.phase === 'main1' || game.phase === 'main2') && game.landsPlayedThisTurn === 0) {
      const land = Object.values(game.cards).find(c =>
        c.zone === 'hand' &&
        c.controllerId === player.id &&
        (c.types?.includes('Land') || c.typeLine?.includes('Land'))
      );

      if (land) {
        console.log(`[Bot] ${player.name} plays land: ${land.name}`);
        engine.playLand(player.id, land.instanceId);
        return true;
      }
    }

    // 3. Declare Attackers
    if (game.phase === 'combat' && game.step === 'declare_attackers' && game.activePlayerId === player.id && !game.attackersDeclared) {
      const attackers = this.chooseAttackers(game, player.id);
      console.log(`[Bot] ${player.name} declares ${attackers.length} attacker(s)`);
      engine.declareAttackers(player.id, attackers);
      return true;
    }

    // 4. Declare Blockers
    if (game.phase === 'combat' && game.step === 'declare_blockers' && game.activePlayerId !== player.id && !game.blockersDeclared) {
      const blockers = this.chooseBlockers(game, player.id);
      console.log(`[Bot] ${player.name} declares ${blockers.length} blocker(s)`);
      engine.declareBlockers(player.id, blockers);
      return true;
    }

    // 5. Default: Pass Priority
    console.log(`[Bot] ${player.name} passes priority (Phase: ${game.phase}, Step: ${game.step})`);
    engine.passPriority(player.id);
    return true;
  }

  /**
   * Legacy method - calls processActionsLoop for backwards compatibility
   */
  static processActions(game: StrictGameState) {
    this.processActionsLoop(game);
  }

  /**
   * Bot logic for choosing attackers.
   * Strategy: Attack with creatures that won't die to obvious blocks, or attack all if lethal.
   */
  static chooseAttackers(game: StrictGameState, attackerId: string): { attackerId: string, targetId: string }[] {
    const attackers: { attackerId: string, targetId: string }[] = [];
    const player = game.players[attackerId];

    // Find the opponent (target for attacks)
    const opponentId = game.turnOrder.find(id => id !== attackerId);
    if (!opponentId) return attackers;

    const opponent = game.players[opponentId];

    // Get all eligible attackers (untapped creatures controlled since last turn or with haste)
    const eligibleCreatures = Object.values(game.cards).filter(c => {
      if (c.controllerId !== attackerId) return false;
      if (c.zone !== 'battlefield') return false;
      if (!c.types?.includes('Creature') && !c.typeLine?.includes('Creature')) return false;
      if (c.tapped) return false;

      // Check summoning sickness
      const hasHaste = c.keywords?.includes('Haste') ||
                       c.oracleText?.toLowerCase().includes('haste');
      if (c.controlledSinceTurn === game.turnCount && !hasHaste) return false;

      return true;
    });

    if (eligibleCreatures.length === 0) return attackers;

    // Get opponent's potential blockers
    const potentialBlockers = Object.values(game.cards).filter(c =>
      c.controllerId === opponentId &&
      c.zone === 'battlefield' &&
      !c.tapped &&
      (c.types?.includes('Creature') || c.typeLine?.includes('Creature'))
    );

    // Calculate total attack power
    const totalAttackPower = eligibleCreatures.reduce((sum, c) => sum + (c.power || 0), 0);
    const isLethal = totalAttackPower >= opponent.life;

    // Strategy: If lethal, attack with everything
    if (isLethal && potentialBlockers.length === 0) {
      console.log(`[Bot] ${player.name} going for lethal! (${totalAttackPower} damage, opponent at ${opponent.life} life)`);
      eligibleCreatures.forEach(c => {
        attackers.push({ attackerId: c.instanceId, targetId: opponentId });
      });
      return attackers;
    }

    // Non-lethal: Be more conservative
    // Attack with creatures that:
    // 1. Have evasion (flying, trample, unblockable)
    // 2. Are bigger than all potential blockers
    // 3. Won't trade unfavorably

    for (const creature of eligibleCreatures) {
      const creaturePower = creature.power || 0;
      const creatureToughness = creature.toughness || 0;

      // Check for evasion abilities
      const hasFlying = creature.keywords?.includes('Flying') ||
                        creature.oracleText?.toLowerCase().includes('flying');
      const hasTrample = creature.keywords?.includes('Trample') ||
                         creature.oracleText?.toLowerCase().includes('trample');
      const hasUnblockable = creature.oracleText?.toLowerCase().includes("can't be blocked");
      const hasMenace = creature.keywords?.includes('Menace') ||
                        creature.oracleText?.toLowerCase().includes('menace');

      // Flying blockers check
      const flyingBlockers = potentialBlockers.filter(b =>
        b.keywords?.includes('Flying') ||
        b.keywords?.includes('Reach') ||
        b.oracleText?.toLowerCase().includes('flying') ||
        b.oracleText?.toLowerCase().includes('reach')
      );

      // Evaluate if safe to attack
      let shouldAttack = false;

      if (hasUnblockable) {
        shouldAttack = true;
      } else if (hasFlying && flyingBlockers.length === 0) {
        shouldAttack = true;
      } else if (potentialBlockers.length === 0) {
        shouldAttack = true;
      } else {
        // Check if we can survive or trade favorably
        const bestBlocker = potentialBlockers.reduce((best, b) => {
          const bPower = b.power || 0;
          const bToughness = b.toughness || 0;
          if (!best) return b;
          // Prefer blocker that would kill our creature
          if (bPower >= creatureToughness && (best.power || 0) < creatureToughness) return b;
          // Otherwise prefer largest
          if (bPower + bToughness > (best.power || 0) + (best.toughness || 0)) return b;
          return best;
        }, null as any);

        if (bestBlocker) {
          const blockerPower = bestBlocker.power || 0;
          const blockerToughness = bestBlocker.toughness || 0;

          // We survive the block
          if (creatureToughness > blockerPower) {
            shouldAttack = true;
          }
          // We kill the blocker and have trample
          else if (creaturePower >= blockerToughness && hasTrample) {
            shouldAttack = true;
          }
          // We're significantly bigger (attack anyway for pressure)
          else if (creaturePower >= blockerToughness + 2 && creatureToughness >= blockerPower) {
            shouldAttack = true;
          }
          // Menace requires 2 blockers
          else if (hasMenace && potentialBlockers.length < 2) {
            shouldAttack = true;
          }
        }
      }

      if (shouldAttack) {
        attackers.push({ attackerId: creature.instanceId, targetId: opponentId });
      }
    }

    return attackers;
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
