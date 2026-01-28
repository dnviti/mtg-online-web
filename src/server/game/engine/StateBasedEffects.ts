import { StrictGameState, CardObject, StackObject } from '../types';
import { Layers } from './Layers';
import { GameLogger } from './GameLogger';
import { LorwynMechanics } from './LorwynMechanics';
import { TriggeredAbilityHandler } from './TriggeredAbilityHandler';

/**
 * StateBasedEffects (SBA)
 *
 * responsible for checking and applying automatic game rules that happen continuously.
 * This includes:
 * - A player losing the game (0 life).
 * - Creatures dying from lethal damage or 0 toughness.
 * - Auras/Equipment falling off invalid targets.
 * - Counter annihilation (+1/+1 and -1/-1 counters cancel out).
 * - Persist triggers (creatures return with -1/-1 counter).
 *
 * This module runs in a loop until no more effects occur (StateBasedEffects.process).
 */
export class StateBasedEffects {
  // Track creatures that died this SBA check cycle for persist processing
  private static pendingPersistCreatures: CardObject[] = [];
  // Track death triggers to be put on stack after SBA loop completes
  private static pendingDeathTriggers: StackObject[] = [];

  /**
   * Checks for any applicable SBAs and applies them. 
   * Returns true if any change was made to the state.
   */
  static check(state: StrictGameState): boolean {
    let sbaPerformed = false;
    const { players, cards } = state;

    // 1. Player Loss
    for (const pid of Object.keys(players)) {
      const p = players[pid];
      if (p.life <= 0 || p.poison >= 10) {
        // Player loses
        if (p.isActive) { // only process once
          console.log(`Player ${p.name} loses the game.`);
          // TODO: Remove all their cards, etc.
          // For now just log.
        }
      }
    }

    // 2. Counter Annihilation (Rule 122.3)
    // If a permanent has both +1/+1 and -1/-1 counters, they are removed in pairs
    if (LorwynMechanics.processAllCounterAnnihilation(state)) {
      sbaPerformed = true;
    }

    // 3. Creature Death (Zero Toughness or Lethal Damage)
    const creatures = Object.values(cards).filter(c => c.zone === 'battlefield' && c.types?.includes('Creature'));

    for (const c of creatures) {
      // 704.5f Toughness 0 or less
      if (c.toughness <= 0) {
        console.log(`SBA: ${c.name} put to GY (Zero Toughness).`);
        GameLogger.logCreatureDied(state, c, 'zero toughness');

        // Capture card snapshot for death triggers (look-back-in-time)
        const cardSnapshot = { ...c };

        // Check for persist before moving to graveyard
        if (LorwynMechanics.canPersist(c)) {
          StateBasedEffects.pendingPersistCreatures.push({ ...c }); // Clone to preserve state
        }

        c.zone = 'graveyard';

        // Check for death triggers using the snapshot
        const deathTriggers = TriggeredAbilityHandler.checkDeathTriggers(state, cardSnapshot);
        StateBasedEffects.pendingDeathTriggers.push(...deathTriggers);

        sbaPerformed = true;
        continue;
      }

      // Check for Indestructible (from keywords or supertypes)
      const isIndestructible = c.supertypes?.includes('Indestructible') ||
                               c.keywords?.some(k => k.toLowerCase() === 'indestructible');

      // 704.5h Deathtouch: Any damage from a source with deathtouch is lethal
      const hasDeathouchDamage = c.modifiers?.some(m =>
        m.type === 'ability_grant' && m.value === 'deathtouch_damage_received'
      );

      if (hasDeathouchDamage && c.damageMarked > 0 && !isIndestructible) {
        console.log(`SBA: ${c.name} destroyed (Deathtouch damage: ${c.damageMarked}).`);
        GameLogger.logCreatureDied(state, c, 'deathtouch');

        // Capture card snapshot for death triggers (look-back-in-time)
        const cardSnapshot = { ...c };

        // Check for persist before moving to graveyard
        if (LorwynMechanics.canPersist(c)) {
          StateBasedEffects.pendingPersistCreatures.push({ ...c });
        }

        c.zone = 'graveyard';

        // Check for death triggers using the snapshot
        const deathTriggers = TriggeredAbilityHandler.checkDeathTriggers(state, cardSnapshot);
        StateBasedEffects.pendingDeathTriggers.push(...deathTriggers);

        sbaPerformed = true;
        continue;
      }

      // 704.5g Lethal Damage (normal case)
      if (c.damageMarked >= c.toughness && !isIndestructible) {
        console.log(`SBA: ${c.name} destroyed (Lethal Damage: ${c.damageMarked}/${c.toughness}).`);
        GameLogger.logCreatureDied(state, c, 'lethal damage');

        // Capture card snapshot for death triggers (look-back-in-time)
        const cardSnapshot = { ...c };

        // Check for persist before moving to graveyard
        if (LorwynMechanics.canPersist(c)) {
          StateBasedEffects.pendingPersistCreatures.push({ ...c });
        }

        c.zone = 'graveyard';

        // Check for death triggers using the snapshot
        const deathTriggers = TriggeredAbilityHandler.checkDeathTriggers(state, cardSnapshot);
        StateBasedEffects.pendingDeathTriggers.push(...deathTriggers);

        sbaPerformed = true;
      }
    }

    // 4. Planeswalker Loyalty Death (Rule 704.5i)
    // If a planeswalker has 0 or less loyalty counters, it's put into its owner's graveyard
    const planeswalkers = Object.values(cards).filter(c =>
      c.zone === 'battlefield' && c.types?.includes('Planeswalker')
    );

    for (const pw of planeswalkers) {
      const loyaltyCounter = pw.counters?.find(c => c.type === 'loyalty');
      const currentLoyalty = loyaltyCounter?.count ?? 0;

      if (currentLoyalty <= 0) {
        console.log(`SBA: ${pw.name} put to GY (Zero Loyalty).`);
        GameLogger.log(state, `{${pw.name}} is put into graveyard (0 loyalty)`, 'zone', 'Game', [pw]);
        pw.zone = 'graveyard';
        sbaPerformed = true;
      }
    }

    // 5. Legend Rule (704.5j) - Skipped for now (Placeholder from original)

    // 6. Aura Validity (704.5n)
    Object.values(cards).forEach(c => {
      if (c.zone === 'battlefield' && c.types?.includes('Enchantment') && c.subtypes?.includes('Aura')) {
        if (!c.attachedTo) {
          console.log(`SBA: ${c.name} (Aura) unattached. Destroyed.`);
          GameLogger.logLeavesBattlefield(state, c, 'graveyard', 'unattached');
          c.zone = 'graveyard';
          sbaPerformed = true;
        } else {
          const target = cards[c.attachedTo];
          if (!target || target.zone !== 'battlefield') {
            console.log(`SBA: ${c.name} (Aura) target invalid. Destroyed.`);
            GameLogger.logLeavesBattlefield(state, c, 'graveyard', 'target invalid');
            c.zone = 'graveyard';
            sbaPerformed = true;
          }
        }
      }
    });

    // 7. Equipment Validity
    Object.values(cards).forEach(c => {
      if (c.zone === 'battlefield' && c.types?.includes('Artifact') && c.subtypes?.includes('Equipment') && c.attachedTo) {
        const target = cards[c.attachedTo];
        if (!target || target.zone !== 'battlefield') {
          console.log(`SBA: ${c.name} (Equipment) detached (Host invalid).`);
          c.attachedTo = undefined;
          sbaPerformed = true;
        }
      }
    });

    // 8. Token Ceasing to Exist (704.5d)
    // Tokens that are in a zone other than the battlefield cease to exist
    const tokensToRemove: string[] = [];
    Object.entries(cards).forEach(([id, c]) => {
      if (c.isToken && c.zone !== 'battlefield') {
        console.log(`SBA: Token ${c.name} ceased to exist (left battlefield to ${c.zone}).`);
        GameLogger.log(state, `{${c.name}} token ceased to exist`, 'zone', 'Game', [c]);
        tokensToRemove.push(id);
        sbaPerformed = true;
      }
    });
    tokensToRemove.forEach(id => delete state.cards[id]);

    return sbaPerformed;
  }

  // This method encapsulates the SBA loop and recalculation of layers
  static process(state: StrictGameState) {
    // Reset pending lists at start of SBA processing
    StateBasedEffects.pendingPersistCreatures = [];
    StateBasedEffects.pendingDeathTriggers = [];

    Layers.recalculate(state);

    let loops = 0;
    while (this.check(state)) {
      loops++;
      if (loops > 100) {
        console.error("Infinite SBA Loop Detected");
        break;
      }
      Layers.recalculate(state);
    }

    // Process death triggers after SBA loop completes (before persist)
    // Death triggers go on the stack with APNAP ordering
    if (StateBasedEffects.pendingDeathTriggers.length > 0) {
      console.log(`[StateBasedEffects] Processing ${StateBasedEffects.pendingDeathTriggers.length} death trigger(s)`);

      // Order triggers by APNAP (Active Player, Non-Active Player)
      const orderedTriggers = TriggeredAbilityHandler.orderTriggersAPNAP(state, StateBasedEffects.pendingDeathTriggers);
      TriggeredAbilityHandler.putTriggersOnStack(state, orderedTriggers);

      // Clear the pending list
      StateBasedEffects.pendingDeathTriggers = [];
    }

    // Process persist triggers after SBA loop completes
    // Persist creatures return to battlefield with a -1/-1 counter
    if (StateBasedEffects.pendingPersistCreatures.length > 0) {
      console.log(`[StateBasedEffects] Processing ${StateBasedEffects.pendingPersistCreatures.length} persist trigger(s)`);

      for (const creatureSnapshot of StateBasedEffects.pendingPersistCreatures) {
        // Find the actual card in graveyard
        const card = state.cards[creatureSnapshot.instanceId];
        if (card && card.zone === 'graveyard') {
          LorwynMechanics.returnFromPersist(state, card);
        }
      }

      // Clear the pending list
      StateBasedEffects.pendingPersistCreatures = [];

      // Run SBA again to check if the returned creatures die again
      // (e.g., if they return as 0/0 with a -1/-1 counter)
      this.process(state);
    }
  }
}
