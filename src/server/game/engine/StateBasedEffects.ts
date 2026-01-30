import { StrictGameState, CardObject, StackObject } from '../types';
import { Layers } from './Layers';
import { GameLogger } from './GameLogger';
import { LorwynMechanics } from './LorwynMechanics';
import { TriggeredAbilityHandler } from './TriggeredAbilityHandler';
import { CardUtils } from './CardUtils';

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
  // Track aura "goes to graveyard" triggers (e.g., Rancor)
  private static pendingAuraGraveyardTriggers: StackObject[] = [];
  // Track aura "enchanted creature dies" triggers (e.g., Angelic Destiny)
  private static pendingAuraEnchantedCreatureDiesTriggers: StackObject[] = [];

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

        // Check for attached Auras with "enchanted creature dies" triggers BEFORE moving to graveyard
        StateBasedEffects.checkEnchantedCreatureDiesTriggers(state, cardSnapshot, cards);

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

        // Check for attached Auras with "enchanted creature dies" triggers BEFORE moving to graveyard
        StateBasedEffects.checkEnchantedCreatureDiesTriggers(state, cardSnapshot, cards);

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

        // Check for attached Auras with "enchanted creature dies" triggers BEFORE moving to graveyard
        StateBasedEffects.checkEnchantedCreatureDiesTriggers(state, cardSnapshot, cards);

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
    // When an aura's enchanted permanent leaves the battlefield or becomes invalid:
    // - Bestow auras become creatures instead of going to graveyard
    // - Normal auras go to graveyard (may trigger "return to hand" abilities like Rancor)
    Object.values(cards).forEach(c => {
      if (c.zone === 'battlefield' && c.types?.includes('Enchantment') && c.subtypes?.includes('Aura')) {
        let shouldDetach = false;
        let reason = '';

        if (!c.attachedTo) {
          shouldDetach = true;
          reason = 'unattached';
        } else {
          const target = cards[c.attachedTo];
          if (!target || target.zone !== 'battlefield') {
            shouldDetach = true;
            reason = 'target invalid';
          }
        }

        if (shouldDetach) {
          // Check for Bestow - aura becomes a creature instead of going to graveyard
          if (CardUtils.hasBestow(c)) {
            console.log(`SBA: ${c.name} (Bestow Aura) detached - becomes creature.`);
            GameLogger.log(state, `{${c.name}} becomes a creature (Bestow)`, 'zone', 'Game', [c]);

            // Detach from target
            c.attachedTo = undefined;

            // Remove "Aura" subtype and restore creature characteristics
            c.subtypes = c.subtypes?.filter(s => s !== 'Aura') || [];

            // Ensure it has Creature type (Bestow cards are Enchantment Creatures)
            if (!c.types.includes('Creature')) {
              c.types.push('Creature');
            }

            // Reset power/toughness from base values (the card's P/T as a creature)
            const stats = CardUtils.getBestowCreatureStats(c);
            if (stats) {
              c.power = stats.power;
              c.toughness = stats.toughness;
              c.basePower = stats.power;
              c.baseToughness = stats.toughness;
            }

            // Bestow creatures have summoning sickness when they become creatures
            c.controlledSinceTurn = state.turnCount;

            sbaPerformed = true;
          } else {
            // Normal aura goes to graveyard
            console.log(`SBA: ${c.name} (Aura) ${reason}. Goes to graveyard.`);

            // Capture snapshot before moving to graveyard (for triggers)
            const auraSnapshot = { ...c };

            c.attachedTo = undefined;
            c.zone = 'graveyard';
            GameLogger.logLeavesBattlefield(state, c, 'graveyard', reason);

            // Check for "return to hand" triggers (Rancor-type auras)
            if (CardUtils.hasReturnToHandOnGraveyard(auraSnapshot)) {
              const trigger = StateBasedEffects.createAuraGraveyardTrigger(state, auraSnapshot);
              if (trigger) {
                StateBasedEffects.pendingAuraGraveyardTriggers.push(trigger);
                console.log(`SBA: ${c.name} has "return to hand" trigger`);
              }
            }

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

  /**
   * Checks for Auras attached to a dying creature that have "When enchanted creature dies" triggers.
   * These triggers fire when the creature dies, allowing the Aura to return to hand or have other effects.
   * Examples: Angelic Destiny, Nurgle's Rot
   *
   * @param state - Current game state
   * @param dyingCreature - The creature that is dying (snapshot)
   * @param cards - Current cards in game (to find attached Auras)
   */
  private static checkEnchantedCreatureDiesTriggers(
    state: StrictGameState,
    dyingCreature: CardObject,
    cards: Record<string, CardObject>
  ): void {
    // Find all Auras attached to this dying creature
    const attachedAuras = Object.values(cards).filter(c =>
      c.zone === 'battlefield' &&
      c.types?.includes('Enchantment') &&
      c.subtypes?.includes('Aura') &&
      c.attachedTo === dyingCreature.instanceId
    );

    for (const aura of attachedAuras) {
      // Check for "When enchanted creature dies" pattern
      const effectText = CardUtils.getEnchantedCreatureDiesEffect(aura);
      if (effectText) {
        console.log(`SBA: Aura ${aura.name} has "enchanted creature dies" trigger: "${effectText}"`);

        // Create trigger for this Aura
        const trigger = StateBasedEffects.createEnchantedCreatureDiesTrigger(state, aura, effectText);
        if (trigger) {
          StateBasedEffects.pendingAuraEnchantedCreatureDiesTriggers.push(trigger);
        }
      }
    }
  }

  /**
   * Creates a trigger for auras with "When enchanted creature dies" effects.
   * Pattern: "When enchanted creature dies, return this card to its owner's hand."
   */
  private static createEnchantedCreatureDiesTrigger(
    _state: StrictGameState,
    auraCard: CardObject,
    effectText: string
  ): StackObject | null {
    const trigger: StackObject = {
      id: `trigger-aura-enchanted-dies-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
      sourceId: auraCard.instanceId,
      controllerId: auraCard.controllerId,
      type: 'trigger',
      name: `${auraCard.name}: Enchanted creature dies`,
      text: effectText,
      targets: [auraCard.instanceId],
      resolutionState: {
        choicesMade: []
      }
    };

    // Store the owner ID for resolution (return to owner's hand, not controller's)
    (trigger as any).ownerId = auraCard.ownerId;
    (trigger as any).isEnchantedCreatureDiesTrigger = true;
    (trigger as any).fullEffectText = effectText;

    return trigger;
  }

  /**
   * Creates a trigger for auras with "return to hand" effects (e.g., Rancor).
   * Pattern: "When this Aura is put into a graveyard from the battlefield, return it to its owner's hand."
   */
  private static createAuraGraveyardTrigger(_state: StrictGameState, auraSnapshot: CardObject): StackObject | null {
    const trigger: StackObject = {
      id: `trigger-aura-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      sourceId: auraSnapshot.instanceId,
      controllerId: auraSnapshot.controllerId,
      type: 'trigger',
      name: `${auraSnapshot.name}: Return to hand`,
      text: `Return ${auraSnapshot.name} to its owner's hand`,
      targets: [auraSnapshot.instanceId], // The aura itself is the "target" for the effect
      resolutionState: {
        choicesMade: []
      }
    };

    // Store the owner ID for resolution (return to owner's hand, not controller's)
    (trigger as any).ownerId = auraSnapshot.ownerId;
    (trigger as any).isAuraReturnTrigger = true;

    return trigger;
  }

  /**
   * Resolves an aura "return to hand" trigger.
   * The aura returns from graveyard to its owner's hand.
   */
  static resolveAuraReturnTrigger(state: StrictGameState, trigger: StackObject): boolean {
    const card = state.cards[trigger.sourceId];
    if (!card) {
      console.log(`[StateBasedEffects] Aura ${trigger.sourceId} no longer exists - trigger fizzles`);
      return false;
    }

    // The aura must still be in the graveyard to return
    if (card.zone !== 'graveyard') {
      console.log(`[StateBasedEffects] ${card.name} is no longer in graveyard (${card.zone}) - trigger fizzles`);
      return false;
    }

    // Return to owner's hand
    const ownerId = (trigger as any).ownerId || card.ownerId;
    card.zone = 'hand';
    card.controllerId = ownerId; // Reset controller to owner when returning to hand
    card.attachedTo = undefined;

    console.log(`[StateBasedEffects] ${card.name} returned to owner's hand`);
    GameLogger.log(state, `{${card.name}} returns to its owner's hand`, 'zone', 'Game', [card]);

    return true;
  }

  /**
   * Resolves an aura "enchanted creature dies" trigger.
   * Handles effects like "return this card to its owner's hand" or other effects.
   * Examples: Angelic Destiny, Nurgle's Rot
   */
  static resolveEnchantedCreatureDiesTrigger(state: StrictGameState, trigger: StackObject): boolean {
    const card = state.cards[trigger.sourceId];
    if (!card) {
      console.log(`[StateBasedEffects] Aura ${trigger.sourceId} no longer exists - trigger fizzles`);
      return false;
    }

    const effectText = ((trigger as any).fullEffectText || trigger.text).toLowerCase();
    const ownerId = (trigger as any).ownerId || card.ownerId;

    console.log(`[StateBasedEffects] Resolving "enchanted creature dies" trigger for ${card.name}: "${effectText}"`);

    // Handle "return this card to its owner's hand"
    if (/return (?:this card|~|it) to its owner's hand/i.test(effectText)) {
      // The aura should be in graveyard at this point (SBA moved it there)
      if (card.zone !== 'graveyard') {
        console.log(`[StateBasedEffects] ${card.name} is not in graveyard (${card.zone}) - cannot return to hand`);
        // Continue to check for other effects
      } else {
        card.zone = 'hand';
        card.controllerId = ownerId;
        card.attachedTo = undefined;

        console.log(`[StateBasedEffects] ${card.name} returned to owner's hand (enchanted creature died)`);
        GameLogger.log(state, `{${card.name}} returns to its owner's hand`, 'zone', 'Game', [card]);
      }
    }

    // Handle token creation effects (like Nurgle's Rot)
    // "return this card to its owner's hand and you create a 1/3 black Demon creature token"
    if (/create/i.test(effectText) && /token/i.test(effectText)) {
      // Parse token creation - this is a simplified version
      // For more complex effects, we'd delegate to OracleEffectResolver
      const tokenMatch = effectText.match(/create (?:a |an )?(\d+)\/(\d+) (\w+) (\w+) creature token/i);
      if (tokenMatch) {
        const power = parseInt(tokenMatch[1]);
        const toughness = parseInt(tokenMatch[2]);
        const color = tokenMatch[3];
        const creatureType = tokenMatch[4];

        console.log(`[StateBasedEffects] Creating ${power}/${toughness} ${color} ${creatureType} token`);
        // TODO: Implement token creation via ActionHandler
        // For now, log what would happen
        GameLogger.log(
          state,
          `${card.name} creates a ${power}/${toughness} ${color} ${creatureType} token`,
          'action',
          card.name,
          [card]
        );
      }
    }

    return true;
  }

  // This method encapsulates the SBA loop and recalculation of layers
  static process(state: StrictGameState) {
    // Reset pending lists at start of SBA processing
    StateBasedEffects.pendingPersistCreatures = [];
    StateBasedEffects.pendingDeathTriggers = [];
    StateBasedEffects.pendingAuraGraveyardTriggers = [];
    StateBasedEffects.pendingAuraEnchantedCreatureDiesTriggers = [];

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

    // Process aura "return to hand" triggers (Rancor-type auras)
    // These go on the stack after death triggers
    if (StateBasedEffects.pendingAuraGraveyardTriggers.length > 0) {
      console.log(`[StateBasedEffects] Processing ${StateBasedEffects.pendingAuraGraveyardTriggers.length} aura graveyard trigger(s)`);

      // Order triggers by APNAP
      const orderedTriggers = TriggeredAbilityHandler.orderTriggersAPNAP(state, StateBasedEffects.pendingAuraGraveyardTriggers);
      TriggeredAbilityHandler.putTriggersOnStack(state, orderedTriggers);

      // Clear the pending list
      StateBasedEffects.pendingAuraGraveyardTriggers = [];
    }

    // Process aura "enchanted creature dies" triggers (Angelic Destiny-type auras)
    // These go on the stack after aura graveyard triggers
    if (StateBasedEffects.pendingAuraEnchantedCreatureDiesTriggers.length > 0) {
      console.log(`[StateBasedEffects] Processing ${StateBasedEffects.pendingAuraEnchantedCreatureDiesTriggers.length} aura 'enchanted creature dies' trigger(s)`);

      // Order triggers by APNAP
      const orderedTriggers = TriggeredAbilityHandler.orderTriggersAPNAP(state, StateBasedEffects.pendingAuraEnchantedCreatureDiesTriggers);
      TriggeredAbilityHandler.putTriggersOnStack(state, orderedTriggers);

      // Clear the pending list
      StateBasedEffects.pendingAuraEnchantedCreatureDiesTriggers = [];
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
