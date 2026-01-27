import { StrictGameState } from '../types';


/**
 * CombatManager
 * 
 * Manages the specific mechanics of the Combat Phase.
 * Handles the declaration of attackers and blockers, validation of combat legality
 * (vigilance, tapping, summoning sickness), and the resolution of combat damage.
 */
export class CombatManager {

  /**
   * Validates and registers declared attackers.
   * Enforces rules like Summoning Sickness and Tapping (unless Vigilance).
   */
  static declareAttackers(state: StrictGameState, playerId: string, attackers: { attackerId: string, targetId: string }[]) {
    if (state.phase !== 'combat' || state.step !== 'declare_attackers') throw new Error("Not Declare Attackers step.");
    if (state.activePlayerId !== playerId) throw new Error("Only Active Player can declare attackers.");

    // Explicitly clear 'attacking' status for ALL creatures checks
    Object.values(state.cards).forEach(c => {
      if (c.controllerId === playerId && c.zone === 'battlefield') {
        c.attacking = undefined;
      }
    });

    attackers.forEach(({ attackerId, targetId }) => {
      const card = state.cards[attackerId];
      if (!card || card.controllerId !== playerId || card.zone !== 'battlefield') throw new Error(`Invalid attacker ${attackerId}`);
      if (!card.types?.includes('Creature')) throw new Error(`${card.name} is not a creature.`);

      // Summoning Sickness
      const hasHaste = card.keywords.includes('Haste');
      if (card.controlledSinceTurn === state.turnCount && !hasHaste) {
        throw new Error(`${card.name} has Summoning Sickness.`);
      }

      // Tap if not Vigilance
      const hasVigilance = card.keywords.includes('Vigilance');
      if (card.tapped && !hasVigilance) throw new Error(`${card.name} is tapped.`);

      if (!hasVigilance) {
        card.tapped = true;
      }

      card.attacking = targetId;
    });

    const attackerNames = attackers.map(a => state.cards[a.attackerId]?.name || a.attackerId).join(", ");
    console.log(`[CombatManager] Player ${playerId} declared ${attackers.length} attackers: ${attackerNames}`);
    state.attackersDeclared = true;

    // Reset priority happens in ActionHandler calling this.
  }

  static declareBlockers(state: StrictGameState, playerId: string, blockers: { blockerId: string, attackerId: string }[]) {
    if (state.phase !== 'combat' || state.step !== 'declare_blockers') throw new Error("Not Declare Blockers step.");
    if (state.activePlayerId === playerId) throw new Error("Active Player cannot declare blockers.");

    const declaredBlockers = blockers || [];
    declaredBlockers.forEach(({ blockerId, attackerId }) => {
      const blocker = state.cards[blockerId];
      const attacker = state.cards[attackerId];

      if (!blocker || blocker.controllerId !== playerId || blocker.zone !== 'battlefield') throw new Error(`Invalid blocker ${blockerId}`);
      if (blocker.tapped) throw new Error(`${blocker.name} is tapped.`);

      if (!attacker || !attacker.attacking) throw new Error(`Invalid attacker target ${attackerId}`);

      if (!blocker.blocking) blocker.blocking = [];
      blocker.blocking.push(attackerId);
    });

    const blockerDetails = declaredBlockers.map(b => {
      const blockerName = state.cards[b.blockerId]?.name || b.blockerId;
      const attackerName = state.cards[b.attackerId]?.name || b.attackerId;
      return `${blockerName} blocking ${attackerName}`;
    }).join(", ");
    console.log(`[CombatManager] Player ${playerId} declared ${declaredBlockers.length} blockers: ${blockerDetails}`);
    state.blockersDeclared = true;
  }

  static resolveCombatDamage(state: StrictGameState) {
    console.log("Resolving Combat Damage...");
    const attackers = Object.values(state.cards).filter(c => !!c.attacking);

    for (const attacker of attackers) {
      const blockers = Object.values(state.cards).filter(c => c.blocking?.includes(attacker.instanceId));

      if (blockers.length > 0) {
        // Blocked - 1v1 simple
        const blocker = blockers[0];

        // Attacker -> Blocker
        console.log(`${attacker.name} deals ${attacker.power} damage to ${blocker.name}`);
        blocker.damageMarked = (blocker.damageMarked || 0) + attacker.power;

        // Blocker -> Attacker
        console.log(`${blocker.name} deals ${blocker.power} damage to ${attacker.name}`);
        attacker.damageMarked = (attacker.damageMarked || 0) + blocker.power;

      } else {
        // Unblocked
        const targetId = attacker.attacking!;
        const targetPlayer = state.players[targetId];
        if (targetPlayer) {
          console.log(`${attacker.name} deals ${attacker.power} damage to Player ${targetPlayer.name}`);
          targetPlayer.life -= attacker.power;
        }
      }
    }
  }
}
