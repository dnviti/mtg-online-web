import { StrictGameState, CardObject } from '../types';
import { GameLogger } from './GameLogger';

// DamageEvent interface for tracking damage (triggers are manual in manual play mode)
interface DamageEvent {
  sourceId: string;
  targetId: string;
  amount: number;
  isCombatDamage: boolean;
  isToPlayer: boolean;
}

/**
 * CombatManager
 *
 * Manages the specific mechanics of the Combat Phase.
 * Handles the declaration of attackers and blockers, validation of combat legality
 * (vigilance, tapping, summoning sickness), and the resolution of combat damage.
 *
 * Keyword Abilities Implemented:
 * - Lifelink: Controller gains life equal to damage dealt
 * - Deathtouch: Any damage dealt to a creature is lethal
 * - Trample: Excess damage dealt to defending player/planeswalker
 * - First Strike: Deals damage in the first combat damage step
 * - Double Strike: Deals damage in both combat damage steps
 * - Flying: Can only be blocked by creatures with Flying or Reach
 * - Reach: Can block creatures with Flying
 * - Menace: Must be blocked by two or more creatures
 */
export class CombatManager {

  /**
   * Helper to check if a creature has a keyword ability
   */
  static hasKeyword(card: CardObject, keyword: string): boolean {
    const keywords = card.keywords || [];
    const oracleText = (card.oracleText || '').toLowerCase();
    const keywordLower = keyword.toLowerCase();

    return keywords.some(k => k.toLowerCase() === keywordLower) ||
           keywords.some(k => k.toLowerCase().startsWith(keywordLower)) ||
           new RegExp(`\\b${keywordLower}\\b`).test(oracleText);
  }

  /**
   * Helper to check if creature can block another (Flying/Reach interaction)
   */
  static canBlock(blocker: CardObject, attacker: CardObject): boolean {
    // Flying creatures can only be blocked by creatures with Flying or Reach
    if (this.hasKeyword(attacker, 'Flying')) {
      if (!this.hasKeyword(blocker, 'Flying') && !this.hasKeyword(blocker, 'Reach')) {
        return false;
      }
    }
    return true;
  }

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

      // Check for "can't attack" modifier (e.g., from Pacifism-style auras)
      const cantAttack = card.modifiers?.some(m =>
        m.type === 'ability_grant' && m.value === 'cant_attack'
      );
      if (cantAttack) {
        throw new Error(`${card.name} can't attack.`);
      }

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

      // Log attacker declaration
      const playerName = state.players[playerId]?.name || 'Unknown';
      GameLogger.logDeclareAttacker(state, card, playerName);
    });

    const attackerNames = attackers.map(a => state.cards[a.attackerId]?.name || a.attackerId).join(", ");
    console.log(`[CombatManager] Player ${playerId} declared ${attackers.length} attackers: ${attackerNames}`);
    state.attackersDeclared = true;

    // Manual play mode: Players are responsible for adding attack triggers manually
    // Reset priority happens in ActionHandler calling this.
  }

  static declareBlockers(state: StrictGameState, playerId: string, blockers: { blockerId: string, attackerId: string }[]) {
    if (state.phase !== 'combat' || state.step !== 'declare_blockers') throw new Error("Not Declare Blockers step.");
    if (state.activePlayerId === playerId) throw new Error("Active Player cannot declare blockers.");

    const declaredBlockers = blockers || [];

    // Group blockers by attacker to check Menace
    const blockersByAttacker: Record<string, string[]> = {};

    declaredBlockers.forEach(({ blockerId, attackerId }) => {
      const blocker = state.cards[blockerId];
      const attacker = state.cards[attackerId];

      if (!blocker || blocker.controllerId !== playerId || blocker.zone !== 'battlefield') throw new Error(`Invalid blocker ${blockerId}`);
      if (blocker.tapped) throw new Error(`${blocker.name} is tapped.`);

      // Check for "can't block" modifier
      const cantBlock = blocker.modifiers?.some(m =>
        m.type === 'ability_grant' && m.value === 'cant_block'
      );
      if (cantBlock) {
        throw new Error(`${blocker.name} can't block.`);
      }

      if (!attacker || !attacker.attacking) throw new Error(`Invalid attacker target ${attackerId}`);

      // Check for "can't be blocked" modifier on the attacker
      const cantBeBlocked = attacker.modifiers?.some(m =>
        m.type === 'ability_grant' && m.value === 'cant_be_blocked'
      );
      if (cantBeBlocked) {
        throw new Error(`${attacker.name} can't be blocked.`);
      }

      // Flying/Reach interaction
      if (!this.canBlock(blocker, attacker)) {
        throw new Error(`${blocker.name} cannot block ${attacker.name} (Flying).`);
      }

      if (!blocker.blocking) blocker.blocking = [];
      blocker.blocking.push(attackerId);

      // Track for Menace check
      if (!blockersByAttacker[attackerId]) blockersByAttacker[attackerId] = [];
      blockersByAttacker[attackerId].push(blockerId);

      // Log blocker declaration
      const playerName = state.players[playerId]?.name || 'Unknown';
      GameLogger.logDeclareBlocker(state, blocker, attacker, playerName);
    });

    // Menace check: creatures with Menace must be blocked by 2+ creatures or not at all
    for (const [attackerId, blockerIds] of Object.entries(blockersByAttacker)) {
      const attacker = state.cards[attackerId];
      if (attacker && this.hasKeyword(attacker, 'Menace')) {
        if (blockerIds.length === 1) {
          // Remove the illegal block
          const blocker = state.cards[blockerIds[0]];
          if (blocker) {
            blocker.blocking = blocker.blocking?.filter(id => id !== attackerId) || [];
            throw new Error(`${attacker.name} has Menace and must be blocked by two or more creatures.`);
          }
        }
      }
    }

    const blockerDetails = declaredBlockers.map(b => {
      const blockerName = state.cards[b.blockerId]?.name || b.blockerId;
      const attackerName = state.cards[b.attackerId]?.name || b.attackerId;
      return `${blockerName} blocking ${attackerName}`;
    }).join(", ");
    console.log(`[CombatManager] Player ${playerId} declared ${declaredBlockers.length} blockers: ${blockerDetails}`);
    state.blockersDeclared = true;

    // Manual play mode: Players are responsible for adding block triggers manually
  }

  /**
   * Resolves combat damage with full keyword support.
   * @param isFirstStrikeDamage - If true, only first strike/double strike creatures deal damage
   */
  static resolveCombatDamage(state: StrictGameState, isFirstStrikeDamage: boolean = false) {
    console.log(`Resolving Combat Damage (${isFirstStrikeDamage ? 'First Strike' : 'Normal'})...`);
    const attackers = Object.values(state.cards).filter(c => !!c.attacking && c.zone === 'battlefield');

    // Track lifelink life gain to apply after all damage
    const lifelinkGains: { playerId: string; amount: number }[] = [];
    // Track damage events for triggers
    const damageEvents: DamageEvent[] = [];

    for (const attacker of attackers) {
      // Check if this creature should deal damage in this step
      const hasFirstStrike = this.hasKeyword(attacker, 'First Strike');
      const hasDoubleStrike = this.hasKeyword(attacker, 'Double Strike');

      if (isFirstStrikeDamage) {
        // First strike damage step: only first strike/double strike deal damage
        if (!hasFirstStrike && !hasDoubleStrike) continue;
      } else {
        // Normal damage step: first strike creatures don't deal damage again
        // (unless they have double strike)
        if (hasFirstStrike && !hasDoubleStrike) continue;
      }

      const blockers = Object.values(state.cards).filter(c =>
        c.blocking?.includes(attacker.instanceId) && c.zone === 'battlefield'
      );

      if (blockers.length > 0) {
        // === BLOCKED ===
        this.resolveBlockedCombat(state, attacker, blockers, lifelinkGains, damageEvents, isFirstStrikeDamage);
      } else {
        // === UNBLOCKED ===
        this.resolveUnblockedCombat(state, attacker, lifelinkGains, damageEvents);
      }
    }

    // Process blockers dealing damage to attackers
    this.resolveBlockerDamage(state, lifelinkGains, damageEvents, isFirstStrikeDamage);

    // Apply lifelink gains
    for (const gain of lifelinkGains) {
      const player = state.players[gain.playerId];
      if (player) {
        player.life += gain.amount;
        console.log(`[Lifelink] ${player.name} gains ${gain.amount} life`);
        GameLogger.log(state, `${player.name} gains ${gain.amount} life (Lifelink)`, 'combat', 'Combat');
      }
    }

    // Manual play mode: Players are responsible for adding damage triggers manually
    // damageEvents tracked for reference but not auto-triggered
  }

  /**
   * Resolves combat when an attacker is blocked
   */
  private static resolveBlockedCombat(
    state: StrictGameState,
    attacker: CardObject,
    blockers: CardObject[],
    lifelinkGains: { playerId: string; amount: number }[],
    damageEvents: DamageEvent[],
    _isFirstStrikeDamage: boolean
  ) {
    const hasDeathtouch = this.hasKeyword(attacker, 'Deathtouch');
    const hasTrample = this.hasKeyword(attacker, 'Trample');
    const hasLifelink = this.hasKeyword(attacker, 'Lifelink');

    let remainingDamage = attacker.power;
    let totalDamageDealt = 0;

    // Sort blockers by toughness (assign lethal to each before moving on)
    const sortedBlockers = [...blockers].sort((a, b) => a.toughness - b.toughness);

    for (const blocker of sortedBlockers) {
      if (remainingDamage <= 0) break;

      // Calculate lethal damage needed for this blocker
      let lethalDamage: number;
      if (hasDeathtouch) {
        // Deathtouch: 1 damage is lethal
        lethalDamage = 1;
      } else {
        // Normal: damage >= toughness - damageAlreadyMarked
        lethalDamage = blocker.toughness - (blocker.damageMarked || 0);
      }

      // Assign damage to blocker
      const damageToAssign = Math.min(remainingDamage, lethalDamage);
      blocker.damageMarked = (blocker.damageMarked || 0) + damageToAssign;

      // Record damage event
      if (damageToAssign > 0) {
        damageEvents.push({
          sourceId: attacker.instanceId,
          targetId: blocker.instanceId,
          amount: damageToAssign,
          isCombatDamage: true,
          isToPlayer: false
        });
      }

      // Mark deathtouch damage
      if (hasDeathtouch && damageToAssign > 0) {
        if (!blocker.modifiers) blocker.modifiers = [];
        blocker.modifiers.push({
          sourceId: attacker.instanceId,
          type: 'ability_grant',
          value: 'deathtouch_damage_received',
          untilEndOfTurn: true
        });
      }

      console.log(`${attacker.name} deals ${damageToAssign} damage to ${blocker.name}${hasDeathtouch ? ' (Deathtouch)' : ''}`);
      GameLogger.logCombatDamage(state, attacker, blocker, damageToAssign);

      remainingDamage -= damageToAssign;
      totalDamageDealt += damageToAssign;
    }

    // Trample: excess damage goes to defending player/planeswalker
    if (hasTrample && remainingDamage > 0) {
      const targetId = attacker.attacking!;
      const targetPlayer = state.players[targetId];
      const targetPlaneswalker = state.cards[targetId];

      if (targetPlayer) {
        console.log(`${attacker.name} tramples ${remainingDamage} damage to ${targetPlayer.name}`);
        targetPlayer.life -= remainingDamage;
        totalDamageDealt += remainingDamage;
        // Record trample damage to player
        damageEvents.push({
          sourceId: attacker.instanceId,
          targetId: targetPlayer.id,
          amount: remainingDamage,
          isCombatDamage: true,
          isToPlayer: true
        });
        GameLogger.log(state, `${attacker.name} tramples ${remainingDamage} damage to ${targetPlayer.name}`, 'combat', 'Combat', [attacker]);
      } else if (targetPlaneswalker && targetPlaneswalker.types?.includes('Planeswalker')) {
        // Damage to planeswalker removes loyalty counters
        const loyaltyCounter = targetPlaneswalker.counters?.find(c => c.type === 'loyalty');
        if (loyaltyCounter) {
          loyaltyCounter.count -= remainingDamage;
          totalDamageDealt += remainingDamage;
          // Record trample damage to planeswalker
          damageEvents.push({
            sourceId: attacker.instanceId,
            targetId: targetPlaneswalker.instanceId,
            amount: remainingDamage,
            isCombatDamage: true,
            isToPlayer: false
          });
          console.log(`${attacker.name} tramples ${remainingDamage} damage to ${targetPlaneswalker.name}`);
        }
      }
    }

    // Lifelink: controller gains life equal to damage dealt
    if (hasLifelink && totalDamageDealt > 0) {
      lifelinkGains.push({ playerId: attacker.controllerId, amount: totalDamageDealt });
    }
  }

  /**
   * Resolves combat when an attacker is unblocked
   */
  private static resolveUnblockedCombat(
    state: StrictGameState,
    attacker: CardObject,
    lifelinkGains: { playerId: string; amount: number }[],
    damageEvents: DamageEvent[]
  ) {
    const hasLifelink = this.hasKeyword(attacker, 'Lifelink');
    const targetId = attacker.attacking!;
    const targetPlayer = state.players[targetId];
    const targetPlaneswalker = state.cards[targetId];

    let damageDealt = 0;

    if (targetPlayer) {
      console.log(`${attacker.name} deals ${attacker.power} damage to Player ${targetPlayer.name}`);
      targetPlayer.life -= attacker.power;
      damageDealt = attacker.power;
      // Record damage event to player
      damageEvents.push({
        sourceId: attacker.instanceId,
        targetId: targetPlayer.id,
        amount: attacker.power,
        isCombatDamage: true,
        isToPlayer: true
      });
      GameLogger.logCombatDamage(state, attacker, targetId, attacker.power);
    } else if (targetPlaneswalker && targetPlaneswalker.types?.includes('Planeswalker')) {
      // Damage to planeswalker removes loyalty counters
      const loyaltyCounter = targetPlaneswalker.counters?.find(c => c.type === 'loyalty');
      if (loyaltyCounter) {
        loyaltyCounter.count -= attacker.power;
        damageDealt = attacker.power;
        // Record damage event to planeswalker
        damageEvents.push({
          sourceId: attacker.instanceId,
          targetId: targetPlaneswalker.instanceId,
          amount: attacker.power,
          isCombatDamage: true,
          isToPlayer: false
        });
        console.log(`${attacker.name} deals ${attacker.power} damage to ${targetPlaneswalker.name}`);
        GameLogger.logCombatDamage(state, attacker, targetPlaneswalker, attacker.power);
      }
    }

    // Lifelink
    if (hasLifelink && damageDealt > 0) {
      lifelinkGains.push({ playerId: attacker.controllerId, amount: damageDealt });
    }
  }

  /**
   * Resolves damage from blockers to attackers
   */
  private static resolveBlockerDamage(
    state: StrictGameState,
    lifelinkGains: { playerId: string; amount: number }[],
    damageEvents: DamageEvent[],
    isFirstStrikeDamage: boolean
  ) {
    const blockers = Object.values(state.cards).filter(c =>
      c.blocking && c.blocking.length > 0 && c.zone === 'battlefield'
    );

    for (const blocker of blockers) {
      const hasFirstStrike = this.hasKeyword(blocker, 'First Strike');
      const hasDoubleStrike = this.hasKeyword(blocker, 'Double Strike');

      // Check if this blocker should deal damage in this step
      if (isFirstStrikeDamage) {
        if (!hasFirstStrike && !hasDoubleStrike) continue;
      } else {
        if (hasFirstStrike && !hasDoubleStrike) continue;
      }

      const hasDeathtouch = this.hasKeyword(blocker, 'Deathtouch');
      const hasLifelink = this.hasKeyword(blocker, 'Lifelink');

      // Deal damage to each attacker being blocked
      for (const attackerId of blocker.blocking!) {
        const attacker = state.cards[attackerId];
        if (!attacker || attacker.zone !== 'battlefield') continue;

        // In a multi-blocker scenario, distribute damage among attackers
        // For simplicity, deal full power to first attacker
        const damageToAssign = blocker.power;

        attacker.damageMarked = (attacker.damageMarked || 0) + damageToAssign;

        // Record damage event
        if (damageToAssign > 0) {
          damageEvents.push({
            sourceId: blocker.instanceId,
            targetId: attacker.instanceId,
            amount: damageToAssign,
            isCombatDamage: true,
            isToPlayer: false
          });
        }

        // Mark deathtouch damage
        if (hasDeathtouch && damageToAssign > 0) {
          if (!attacker.modifiers) attacker.modifiers = [];
          attacker.modifiers.push({
            sourceId: blocker.instanceId,
            type: 'ability_grant',
            value: 'deathtouch_damage_received',
            untilEndOfTurn: true
          });
        }

        console.log(`${blocker.name} deals ${damageToAssign} damage to ${attacker.name}${hasDeathtouch ? ' (Deathtouch)' : ''}`);
        GameLogger.logCombatDamage(state, blocker, attacker, damageToAssign);

        // Lifelink
        if (hasLifelink && damageToAssign > 0) {
          lifelinkGains.push({ playerId: blocker.controllerId, amount: damageToAssign });
        }
      }
    }
  }

  /**
   * Checks if any creatures in combat have First Strike or Double Strike
   */
  static hasFirstStrikeCreatures(state: StrictGameState): boolean {
    const combatants = Object.values(state.cards).filter(c =>
      c.zone === 'battlefield' && (c.attacking || (c.blocking && c.blocking.length > 0))
    );

    return combatants.some(c =>
      this.hasKeyword(c, 'First Strike') || this.hasKeyword(c, 'Double Strike')
    );
  }
}
