import { StrictGameState, CardObject, StackObject, Zone, PendingChoice, ChoiceResult } from '../types';
import { AbilityParser, ParsedAbility } from './AbilityParser';
import { ChoiceHandler } from './ChoiceHandler';
import { GameLogger } from './GameLogger';
import { ActionHandler } from './ActionHandler';
import { StateBasedEffects } from './StateBasedEffects';
import { OracleEffectResolver } from './OracleEffectResolver';

/**
 * TriggeredAbilityHandler
 *
 * Handles triggered abilities according to MTG rules (603):
 * - Detects when trigger conditions are met
 * - Puts triggered abilities on the stack
 * - Handles target selection for targeted triggers
 * - Processes trigger resolution
 *
 * Trigger types supported:
 * - ETB (Enters-the-battlefield): "When [this creature] enters..."
 * - LTB (Leaves-the-battlefield): "When [this creature] leaves..."
 * - Death triggers: "When [this creature] dies..."
 * - Attack triggers: "Whenever [this creature] attacks..."
 * - Damage triggers: "Whenever [this creature] deals damage..."
 */

export interface TriggerContext {
  sourceCard: CardObject;
  ability: ParsedAbility;
  controllerId: string;
  // For "target player's graveyard" type effects
  relatedPlayerId?: string;
}

export interface ParsedTargetRequirement {
  count: { min: number; max: number };
  filter: {
    zones: Zone[];
    types?: string[];
    notTypes?: string[];
    controllerType?: 'any' | 'opponent' | 'you';
    cardName?: string;  // For "target card named X"
    tapped?: boolean;   // Filter by tapped state (true = must be tapped, false = must be untapped)
    notSelf?: boolean;  // Exclude the source card itself
  };
  description: string;  // Human-readable description like "up to two target cards from graveyards"
}

/**
 * Parsed optional cost with "if you do" conditional effect
 * Pattern: "you may [cost]. If you do, [effect]"
 */
export interface ParsedOptionalCost {
  costType: 'tap_creature' | 'sacrifice' | 'pay_life' | 'pay_mana' | 'discard';
  costDescription: string;
  costRequirement?: ParsedTargetRequirement;  // For costs that need selection (tap another creature)
  conditionalEffect: string;  // The "if you do" effect text
}

export class TriggeredAbilityHandler {

  /**
   * Check for ETB (enters-the-battlefield) triggers when a permanent enters
   * This should be called after a permanent is placed on the battlefield
   */
  static checkETBTriggers(state: StrictGameState, enteringCard: CardObject): StackObject[] {
    const triggers: StackObject[] = [];

    // 1. Check the entering card itself for ETB abilities
    const selfTriggers = this.getETBTriggersForCard(enteringCard);
    for (const ability of selfTriggers) {
      const trigger = this.createTriggerStackObject(state, enteringCard, ability, enteringCard.controllerId);
      if (trigger) {
        triggers.push(trigger);
      }
    }

    // 2. Check other permanents for triggers that care about things entering
    // e.g., "Whenever a creature enters the battlefield under your control..."
    const otherPermanents = Object.values(state.cards).filter(c =>
      c.zone === 'battlefield' && c.instanceId !== enteringCard.instanceId
    );

    for (const permanent of otherPermanents) {
      const abilities = AbilityParser.parseAbilities(permanent);
      const relevantTriggers = abilities.filter(a =>
        a.type === 'triggered' &&
        this.triggersOnOtherETB(a, enteringCard, permanent)
      );

      for (const ability of relevantTriggers) {
        const trigger = this.createTriggerStackObject(state, permanent, ability, permanent.controllerId);
        if (trigger) {
          triggers.push(trigger);
        }
      }
    }

    return triggers;
  }

  /**
   * Gets ETB triggered abilities from a card's oracle text
   */
  static getETBTriggersForCard(card: CardObject): ParsedAbility[] {
    const abilities = AbilityParser.parseAbilities(card);

    console.log(`[TriggeredAbilityHandler] Parsing abilities for ${card.name}, found ${abilities.length} total abilities`);
    for (const a of abilities) {
      console.log(`  - [${a.type}] "${a.text.substring(0, 60)}..."`);
    }

    return abilities.filter(ability => {
      if (ability.type !== 'triggered') return false;

      const text = ability.text.toLowerCase();

      // Match patterns for self-ETB triggers
      // "When this creature enters" / "When ~ enters" / "When NAME enters"
      const selfETBPatterns = [
        /^when (?:this (?:creature|permanent|artifact|enchantment)|~|it) enters/i,
        new RegExp(`^when ${card.name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} enters`, 'i'),
        /^when (?:this (?:creature|permanent|artifact|enchantment)|~|it) enters the battlefield/i
      ];

      const matches = selfETBPatterns.some(pattern => pattern.test(text));
      console.log(`[TriggeredAbilityHandler] Checking ETB pattern for "${text.substring(0, 40)}..." -> ${matches}`);
      return matches;
    });
  }

  /**
   * Checks if an ability triggers when another permanent enters
   */
  static triggersOnOtherETB(ability: ParsedAbility, enteringCard: CardObject, sourceCard: CardObject): boolean {
    const text = ability.text.toLowerCase();

    // "Whenever a creature enters the battlefield..."
    if (/whenever a creature enters/i.test(text)) {
      if (!enteringCard.types?.includes('Creature')) return false;

      // Check controller requirement: "under your control"
      if (/under your control/i.test(text)) {
        return enteringCard.controllerId === sourceCard.controllerId;
      }
      return true;
    }

    // "Whenever another creature enters..."
    if (/whenever another creature enters/i.test(text)) {
      return enteringCard.types?.includes('Creature') &&
             enteringCard.instanceId !== sourceCard.instanceId;
    }

    return false;
  }

  /**
   * Creates a StackObject for a triggered ability
   */
  static createTriggerStackObject(
    state: StrictGameState,
    sourceCard: CardObject,
    ability: ParsedAbility,
    controllerId: string
  ): StackObject | null {
    const targetRequirement = this.parseTargetRequirement(ability.text);

    // If the trigger requires targets, check if valid targets exist
    if (targetRequirement) {
      const validTargets = this.findValidTargets(state, targetRequirement, controllerId);

      // For "up to X" triggers, we can still put them on stack with 0 targets
      if (targetRequirement.count.min > 0 && validTargets.length === 0) {
        console.log(`[TriggeredAbilityHandler] No valid targets for ${sourceCard.name} trigger - ability won't trigger`);
        return null;
      }
    }

    const stackItem: StackObject = {
      id: `trigger-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      sourceId: sourceCard.instanceId,
      controllerId: controllerId,
      type: 'trigger',
      name: `${sourceCard.name}: ${ability.effectText.substring(0, 40)}...`,
      text: ability.effectText,
      targets: [], // Will be filled in during target selection
      resolutionState: {
        choicesMade: []
      }
    };

    // Store the parsed target requirement for later use
    (stackItem as any).targetRequirement = targetRequirement;
    (stackItem as any).fullAbilityText = ability.text;

    console.log(`[TriggeredAbilityHandler] Created trigger for ${sourceCard.name}: "${ability.text.substring(0, 60)}..."`);

    return stackItem;
  }

  /**
   * Parses target requirements from ability text
   * Examples:
   * - "exile up to two target cards from graveyards" -> { count: {min:0, max:2}, filter: {zones: ['graveyard']} }
   * - "target creature" -> { count: {min:1, max:1}, filter: {types: ['Creature'], zones: ['battlefield']} }
   * - "target opponent discards a card" -> { count: {min:1, max:1}, filter: player targeting }
   */
  static parseTargetRequirement(text: string): ParsedTargetRequirement | null {
    const lowerText = text.toLowerCase();

    // "up to X target cards from graveyards"
    const upToGraveyardMatch = lowerText.match(/(?:exile\s+)?up to (one|two|three|\d+) target cards? from graveyards?/i);
    if (upToGraveyardMatch) {
      const max = this.parseNumber(upToGraveyardMatch[1]);
      return {
        count: { min: 0, max },
        filter: {
          zones: ['graveyard'],
          controllerType: 'any'
        },
        description: `up to ${upToGraveyardMatch[1]} target card${max > 1 ? 's' : ''} from graveyards`
      };
    }

    // "exile target card from a graveyard"
    const singleGraveyardMatch = lowerText.match(/(?:exile\s+)?target card from a graveyard/i);
    if (singleGraveyardMatch) {
      return {
        count: { min: 1, max: 1 },
        filter: {
          zones: ['graveyard'],
          controllerType: 'any'
        },
        description: 'target card from a graveyard'
      };
    }

    // "target creature"
    const targetCreatureMatch = lowerText.match(/target creature(?! card)/i);
    if (targetCreatureMatch) {
      // Check for "target creature you control" or "target creature you don't control"
      let controllerType: 'any' | 'opponent' | 'you' = 'any';
      if (/target creature you control/i.test(lowerText)) {
        controllerType = 'you';
      } else if (/target creature you don't control/i.test(lowerText) || /target creature an opponent controls/i.test(lowerText)) {
        controllerType = 'opponent';
      }

      return {
        count: { min: 1, max: 1 },
        filter: {
          zones: ['battlefield'],
          types: ['Creature'],
          controllerType
        },
        description: 'target creature'
      };
    }

    // "target nonland permanent"
    const nonlandPermanentMatch = lowerText.match(/target nonland permanent/i);
    if (nonlandPermanentMatch) {
      return {
        count: { min: 1, max: 1 },
        filter: {
          zones: ['battlefield'],
          notTypes: ['Land'],
          controllerType: 'any'
        },
        description: 'target nonland permanent'
      };
    }

    // "target player" (for player targeting, not card targeting)
    // This is handled differently - return null and let the effect handler deal with it
    if (/target (?:player|opponent)/i.test(lowerText) && !lowerText.includes('target player\'s') && !lowerText.includes('target opponent\'s')) {
      // Player targeting handled elsewhere
      return null;
    }

    // "target opponent's graveyard" / "target player's graveyard"
    const playerGraveyardMatch = lowerText.match(/target (player|opponent)'s graveyard/i);
    if (playerGraveyardMatch) {
      return {
        count: { min: 1, max: 1 },
        filter: {
          zones: ['graveyard'],
          controllerType: playerGraveyardMatch[1].toLowerCase() === 'opponent' ? 'opponent' : 'any'
        },
        description: `target ${playerGraveyardMatch[1]}'s graveyard`
      };
    }

    // Check for generic "target" keyword but not a specific pattern we recognize
    if (/\btarget\b/i.test(lowerText)) {
      console.log(`[TriggeredAbilityHandler] Unrecognized target pattern in: "${text.substring(0, 80)}..."`);
    }

    return null;
  }

  /**
   * Finds valid targets based on the requirement
   */
  static findValidTargets(
    state: StrictGameState,
    requirement: ParsedTargetRequirement,
    controllerId: string
  ): string[] {
    const validTargets: string[] = [];

    for (const card of Object.values(state.cards)) {
      if (!requirement.filter.zones.includes(card.zone)) continue;

      // Type filter
      if (requirement.filter.types) {
        const hasType = requirement.filter.types.some(t =>
          card.types?.includes(t) || card.typeLine?.includes(t)
        );
        if (!hasType) continue;
      }

      // Not-type filter
      if (requirement.filter.notTypes) {
        const hasExcludedType = requirement.filter.notTypes.some(t =>
          card.types?.includes(t) || card.typeLine?.includes(t)
        );
        if (hasExcludedType) continue;
      }

      // Controller filter
      if (requirement.filter.controllerType === 'you' && card.controllerId !== controllerId) continue;
      if (requirement.filter.controllerType === 'opponent' && card.controllerId === controllerId) continue;

      // Check for hexproof/shroud if targeting opponent's stuff
      if (card.zone === 'battlefield' && card.controllerId !== controllerId) {
        const hasHexproof = card.keywords?.some(k => k.toLowerCase() === 'hexproof');
        const hasShroud = card.keywords?.some(k => k.toLowerCase() === 'shroud');
        if (hasHexproof || hasShroud) continue;
      }

      validTargets.push(card.instanceId);
    }

    return validTargets;
  }

  /**
   * Creates a pending choice for target selection
   */
  static createTargetSelectionChoice(
    state: StrictGameState,
    stackItem: StackObject,
    sourceCard: CardObject,
    requirement: ParsedTargetRequirement
  ): PendingChoice {
    const validTargets = this.findValidTargets(state, requirement, stackItem.controllerId);

    const choice = ChoiceHandler.createChoice(state, stackItem, {
      type: 'target_selection',
      sourceStackId: stackItem.id,
      sourceCardId: sourceCard.instanceId,
      sourceCardName: sourceCard.name,
      choosingPlayerId: stackItem.controllerId,
      controllingPlayerId: stackItem.controllerId,
      prompt: `Choose ${requirement.description} for ${sourceCard.name}:`,
      selectableIds: validTargets,
      constraints: {
        minCount: requirement.count.min,
        maxCount: requirement.count.max,
        filter: {
          zones: requirement.filter.zones
        }
      }
    });

    return choice;
  }

  /**
   * Puts triggers on the stack and handles targeting
   * Returns true if triggers were added and need resolution
   */
  static putTriggersOnStack(state: StrictGameState, triggers: StackObject[]): boolean {
    if (triggers.length === 0) return false;

    // Put all triggers on stack (in APNAP order - Active Player first)
    // For now, simplified: just add them in order
    for (const trigger of triggers) {
      state.stack.push(trigger);

      const sourceCard = state.cards[trigger.sourceId];
      if (sourceCard) {
        GameLogger.log(
          state,
          `{${sourceCard.name}} triggers: "${trigger.text.substring(0, 50)}..."`,
          'action',
          sourceCard.name,
          [sourceCard]
        );
      }
    }

    // Check if the top trigger needs target selection
    const topTrigger = state.stack[state.stack.length - 1];
    if (topTrigger && topTrigger.type === 'trigger') {
      const targetRequirement = (topTrigger as any).targetRequirement as ParsedTargetRequirement | undefined;

      if (targetRequirement && !topTrigger.targets.length) {
        const sourceCard = state.cards[topTrigger.sourceId];
        if (sourceCard) {
          // Create a choice for target selection
          this.createTargetSelectionChoice(state, topTrigger, sourceCard, targetRequirement);
          return true;
        }
      }
    }

    console.log(`[TriggeredAbilityHandler] ${triggers.length} trigger(s) added to stack`);
    return true;
  }

  /**
   * Resolves a triggered ability that has finished target selection
   * Returns false if waiting for a choice, true if resolution is complete
   */
  static resolveTrigger(state: StrictGameState, stackItem: StackObject): boolean {
    const sourceCard = state.cards[stackItem.sourceId];
    if (!sourceCard) {
      console.warn(`[TriggeredAbilityHandler] Source card not found for trigger resolution`);
      return false;
    }

    // === HANDLE OPTIONAL COSTS ("IF YOU DO" PATTERNS) ===
    // Check if this trigger has an optional cost that needs handling
    const optionalCost = (stackItem as any).optionalCost as ParsedOptionalCost | undefined;
    if (optionalCost) {
      // Check if we need to create a choice or process an existing one
      const canContinue = this.handleOptionalCostChoice(state, stackItem, sourceCard);
      if (!canContinue) {
        // Waiting for player choice
        return false;
      }

      // If the optional cost was the entire effect (like "can't be blocked"),
      // and it was already applied, we're done
      const costPaid = (stackItem as any).optionalCostPaid;
      if (costPaid !== undefined) {
        console.log(`[TriggeredAbilityHandler] Optional cost handled (paid: ${costPaid}), trigger resolution complete`);
        StateBasedEffects.process(state);
        return true;
      }
    }

    const effectText = (stackItem as any).fullAbilityText || stackItem.text;
    const lowerText = effectText.toLowerCase();
    const targets = stackItem.targets || [];

    console.log(`[TriggeredAbilityHandler] Resolving trigger for ${sourceCard.name}: "${effectText.substring(0, 60)}..."`);
    console.log(`[TriggeredAbilityHandler] Targets: ${targets.join(', ')}`);

    let effectResolved = false;

    // === EXILE EFFECTS ===
    if (/exile/i.test(lowerText) && targets.length > 0) {
      for (const targetId of targets) {
        const targetCard = state.cards[targetId];
        if (targetCard) {
          const fromZone = targetCard.zone;
          ActionHandler.moveCardToZone(state, targetId, 'exile');
          console.log(`[TriggeredAbilityHandler] Exiled ${targetCard.name} from ${fromZone}`);
          GameLogger.log(state, `{${sourceCard.name}} exiles {${targetCard.name}}`, 'action', sourceCard.name, [sourceCard, targetCard]);
          effectResolved = true;
        }
      }
    }

    // === LIFE GAIN EFFECTS ===
    const lifeGainMatch = lowerText.match(/you gain (\d+) life/i);
    if (lifeGainMatch) {
      const amount = parseInt(lifeGainMatch[1]);
      const player = state.players[stackItem.controllerId];
      if (player) {
        player.life += amount;
        console.log(`[TriggeredAbilityHandler] ${player.name} gains ${amount} life`);
        GameLogger.logLifeGain(state, sourceCard, player.name, amount);
        effectResolved = true;
      }
    }

    // === DAMAGE EFFECTS ===
    const damageMatch = lowerText.match(/deals? (\d+) damage to (?:target |any |each )?(\w+)/i);
    if (damageMatch && targets.length > 0) {
      const damage = parseInt(damageMatch[1]);
      for (const targetId of targets) {
        const targetCard = state.cards[targetId];
        const targetPlayer = state.players[targetId];

        if (targetCard && targetCard.zone === 'battlefield') {
          targetCard.damageMarked = (targetCard.damageMarked || 0) + damage;
          GameLogger.log(state, `{${sourceCard.name}} deals ${damage} damage to {${targetCard.name}}`, 'action', sourceCard.name, [sourceCard, targetCard]);
          effectResolved = true;
        } else if (targetPlayer) {
          targetPlayer.life -= damage;
          GameLogger.log(state, `{${sourceCard.name}} deals ${damage} damage to ${targetPlayer.name}`, 'action', sourceCard.name, [sourceCard]);
          effectResolved = true;
        }
      }
    }

    // === DRAW EFFECTS ===
    const drawMatch = lowerText.match(/draw (a card|(\d+) cards?)/i);
    if (drawMatch) {
      const count = drawMatch[2] ? parseInt(drawMatch[2]) : 1;
      for (let i = 0; i < count; i++) {
        ActionHandler.drawCard(state, stackItem.controllerId);
      }
      const player = state.players[stackItem.controllerId];
      GameLogger.log(state, `${player?.name || 'Player'} draws ${count} card${count > 1 ? 's' : ''}`, 'action', sourceCard.name, [sourceCard]);
      effectResolved = true;
    }

    // === DESTROY EFFECTS ===
    if (/destroy/i.test(lowerText) && targets.length > 0) {
      for (const targetId of targets) {
        const targetCard = state.cards[targetId];
        if (targetCard && targetCard.zone === 'battlefield') {
          // Check for indestructible
          const isIndestructible = targetCard.keywords?.some(k => k.toLowerCase() === 'indestructible');
          if (!isIndestructible) {
            ActionHandler.moveCardToZone(state, targetId, 'graveyard');
            GameLogger.log(state, `{${sourceCard.name}} destroys {${targetCard.name}}`, 'action', sourceCard.name, [sourceCard, targetCard]);
            effectResolved = true;
          }
        }
      }
    }

    // === BOUNCE EFFECTS ===
    if (/return.*to.*(?:owner's|its owner's) hand/i.test(lowerText) && targets.length > 0) {
      for (const targetId of targets) {
        const targetCard = state.cards[targetId];
        if (targetCard) {
          ActionHandler.moveCardToZone(state, targetId, 'hand');
          GameLogger.log(state, `{${sourceCard.name}} returns {${targetCard.name}} to hand`, 'action', sourceCard.name, [sourceCard, targetCard]);
          effectResolved = true;
        }
      }
    }

    // === TOKEN CREATION ===
    if (/create/i.test(lowerText) && /token/i.test(lowerText)) {
      // Delegate to OracleEffectResolver for token creation
      const pseudoStackItem: StackObject = {
        ...stackItem,
        type: 'spell' // Pretend it's a spell for resolution
      };
      effectResolved = OracleEffectResolver.resolveSpellEffects(state, sourceCard, pseudoStackItem);
    }

    // === COUNTER ADDITION ===
    const counterMatch = lowerText.match(/put (a|an?|\d+) ([+-]?\d+\/[+-]?\d+|[\w\s]+?) counters? on/i);
    if (counterMatch) {
      const count = counterMatch[1] === 'a' || counterMatch[1] === 'an' ? 1 : parseInt(counterMatch[1]) || 1;
      const counterType = counterMatch[2].trim();

      // Determine target: "on it", "on ~", "on target creature"
      let targetCardId: string | undefined;
      if (/on it|on ~|on this/i.test(lowerText)) {
        targetCardId = sourceCard.instanceId;
      } else if (targets.length > 0) {
        targetCardId = targets[0];
      }

      if (targetCardId) {
        const targetCard = state.cards[targetCardId];
        if (targetCard) {
          ActionHandler.addCounter(state, stackItem.controllerId, targetCardId, counterType, count);
          effectResolved = true;
        }
      }
    }

    // Run state-based effects after trigger resolution
    if (effectResolved) {
      StateBasedEffects.process(state);
    }

    return effectResolved;
  }

  /**
   * Utility: parses number words
   */
  private static parseNumber(text: string): number {
    const numberWords: Record<string, number> = {
      'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
      'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10
    };
    const lower = text.toLowerCase();
    return numberWords[lower] || parseInt(text) || 1;
  }

  /**
   * Check for death triggers when a creature dies
   */
  static checkDeathTriggers(state: StrictGameState, dyingCard: CardObject): StackObject[] {
    const triggers: StackObject[] = [];

    // 1. Check the dying card itself for death triggers
    const abilities = AbilityParser.parseAbilities(dyingCard);
    const deathTriggers = abilities.filter(a => {
      if (a.type !== 'triggered') return false;
      const text = a.text.toLowerCase();
      return /^when (?:this creature|~|it) dies/i.test(text);
    });

    for (const ability of deathTriggers) {
      const trigger = this.createTriggerStackObject(state, dyingCard, ability, dyingCard.controllerId);
      if (trigger) {
        triggers.push(trigger);
      }
    }

    // 2. Check other permanents for triggers that care about things dying
    const otherPermanents = Object.values(state.cards).filter(c =>
      c.zone === 'battlefield' && c.instanceId !== dyingCard.instanceId
    );

    for (const permanent of otherPermanents) {
      const abilities = AbilityParser.parseAbilities(permanent);
      const relevantTriggers = abilities.filter(a => {
        if (a.type !== 'triggered') return false;
        const text = a.text.toLowerCase();

        // "Whenever a creature dies..."
        if (/whenever a creature dies/i.test(text)) {
          return dyingCard.types?.includes('Creature');
        }

        // "Whenever another creature you control dies..."
        if (/whenever another creature (?:you control )?dies/i.test(text)) {
          if (!dyingCard.types?.includes('Creature')) return false;
          if (/you control/i.test(text) && dyingCard.controllerId !== permanent.controllerId) return false;
          return dyingCard.instanceId !== permanent.instanceId;
        }

        return false;
      });

      for (const ability of relevantTriggers) {
        const trigger = this.createTriggerStackObject(state, permanent, ability, permanent.controllerId);
        if (trigger) {
          triggers.push(trigger);
        }
      }
    }

    return triggers;
  }

  /**
   * Check for attack triggers when a creature attacks
   */
  static checkAttackTriggers(state: StrictGameState, attackingCard: CardObject, defenderId: string): StackObject[] {
    const triggers: StackObject[] = [];

    // Check the attacking card for attack triggers
    const abilities = AbilityParser.parseAbilities(attackingCard);
    const attackTriggers = abilities.filter(a => {
      if (a.type !== 'triggered') return false;
      const text = a.text.toLowerCase();
      return /^whenever (?:this creature|~|it) attacks/i.test(text);
    });

    for (const ability of attackTriggers) {
      const trigger = this.createTriggerStackObject(state, attackingCard, ability, attackingCard.controllerId);
      if (trigger) {
        // Store defender info for effects that reference it
        (trigger as any).defenderId = defenderId;

        // Check if this trigger has an optional cost ("you may [cost]. If you do, [effect]")
        const optionalCost = this.parseOptionalCost(ability.text, attackingCard);
        if (optionalCost) {
          (trigger as any).optionalCost = optionalCost;
          console.log(`[TriggeredAbilityHandler] Found optional cost in trigger: ${optionalCost.costDescription}`);
        }

        triggers.push(trigger);
      }
    }

    return triggers;
  }

  // ============================================
  // OPTIONAL COST ("IF YOU DO") HANDLING
  // ============================================

  /**
   * Parses "you may [cost]. If you do, [effect]" patterns from ability text
   */
  static parseOptionalCost(text: string, _sourceCard: CardObject): ParsedOptionalCost | null {
    const lowerText = text.toLowerCase();

    // Pattern: "you may tap another untapped creature you control. if you do, [effect]"
    const tapCreatureMatch = lowerText.match(
      /you may tap (another )?(?:an )?untapped creature you control\.?\s*if you do,?\s*(.+?)(?:\.|$)/i
    );
    if (tapCreatureMatch) {
      const isAnother = !!tapCreatureMatch[1];
      const conditionalEffect = tapCreatureMatch[2].trim();

      return {
        costType: 'tap_creature',
        costDescription: `Tap ${isAnother ? 'another ' : ''}untapped creature you control`,
        costRequirement: {
          count: { min: 1, max: 1 },
          filter: {
            zones: ['battlefield'],
            types: ['Creature'],
            controllerType: 'you',
            tapped: false,  // Must be untapped
            notSelf: isAnother  // Exclude the source card if "another"
          },
          description: `${isAnother ? 'another ' : ''}untapped creature you control`
        },
        conditionalEffect
      };
    }

    // Pattern: "you may sacrifice a creature. if you do, [effect]"
    const sacrificeCreatureMatch = lowerText.match(
      /you may sacrifice (a|an|another)?\s*(\w+)?\.?\s*if you do,?\s*(.+?)(?:\.|$)/i
    );
    if (sacrificeCreatureMatch) {
      const sacrificeType = sacrificeCreatureMatch[2] || 'creature';
      const conditionalEffect = sacrificeCreatureMatch[3].trim();

      return {
        costType: 'sacrifice',
        costDescription: `Sacrifice a ${sacrificeType}`,
        costRequirement: {
          count: { min: 1, max: 1 },
          filter: {
            zones: ['battlefield'],
            types: [sacrificeType.charAt(0).toUpperCase() + sacrificeType.slice(1)],
            controllerType: 'you'
          },
          description: `a ${sacrificeType} you control`
        },
        conditionalEffect
      };
    }

    // Pattern: "you may pay {X}. if you do, [effect]"
    const payManaMatch = lowerText.match(
      /you may pay (\{[^}]+\})\.?\s*if you do,?\s*(.+?)(?:\.|$)/i
    );
    if (payManaMatch) {
      const manaCost = payManaMatch[1];
      const conditionalEffect = payManaMatch[2].trim();

      return {
        costType: 'pay_mana',
        costDescription: `Pay ${manaCost}`,
        conditionalEffect
      };
    }

    // Pattern: "you may discard a card. if you do, [effect]"
    const discardMatch = lowerText.match(
      /you may discard (a|an|\d+) cards?\.?\s*if you do,?\s*(.+?)(?:\.|$)/i
    );
    if (discardMatch) {
      const count = discardMatch[1] === 'a' || discardMatch[1] === 'an' ? 1 : parseInt(discardMatch[1]);
      const conditionalEffect = discardMatch[2].trim();

      return {
        costType: 'discard',
        costDescription: `Discard ${count} card${count > 1 ? 's' : ''}`,
        costRequirement: {
          count: { min: count, max: count },
          filter: {
            zones: ['hand'],
            controllerType: 'you'
          },
          description: `${count} card${count > 1 ? 's' : ''} from your hand`
        },
        conditionalEffect
      };
    }

    return null;
  }

  /**
   * Creates a choice for an optional cost when the trigger starts resolving.
   * Returns false if we need to wait for a choice, true if resolution can continue.
   */
  static handleOptionalCostChoice(
    state: StrictGameState,
    stackItem: StackObject,
    sourceCard: CardObject
  ): boolean {
    const optionalCost = (stackItem as any).optionalCost as ParsedOptionalCost | undefined;
    if (!optionalCost) return true; // No optional cost, continue normally

    // Check if we already have a choice result for this
    const existingChoice = stackItem.resolutionState?.choicesMade?.find(
      c => c.type === 'target_selection' || c.type === 'yes_no'
    );
    if (existingChoice) {
      // Already made the choice, process it
      return this.processOptionalCostChoice(state, stackItem, sourceCard, existingChoice);
    }

    // Find valid targets for the optional cost
    if (optionalCost.costRequirement) {
      const validTargets = this.findValidTargetsForOptionalCost(
        state,
        optionalCost.costRequirement,
        stackItem.controllerId,
        sourceCard.instanceId
      );

      if (validTargets.length === 0) {
        // No valid targets - the "you may" is effectively "you can't"
        console.log(`[TriggeredAbilityHandler] No valid targets for optional cost - skipping`);
        return true;
      }

      // Create a target selection choice with a skip option
      ChoiceHandler.createChoice(state, stackItem, {
        type: 'target_selection',
        sourceStackId: stackItem.id,
        sourceCardId: sourceCard.instanceId,
        sourceCardName: sourceCard.name,
        choosingPlayerId: stackItem.controllerId,
        controllingPlayerId: stackItem.controllerId,
        prompt: `${sourceCard.name}: ${optionalCost.costDescription} to get: "${optionalCost.conditionalEffect}"?`,
        selectableIds: validTargets,
        constraints: {
          minCount: 0,  // 0 = can skip (the "you may" part)
          maxCount: optionalCost.costRequirement.count.max,
          filter: {
            zones: optionalCost.costRequirement.filter.zones
          }
        },
        options: [
          { id: 'skip', label: 'Skip (decline)', description: 'Do not pay the cost' }
        ]
      });

      console.log(`[TriggeredAbilityHandler] Created optional cost choice for ${sourceCard.name}`);
      return false; // Wait for choice
    }

    // For costs without target selection (like pay mana), create a yes/no choice
    ChoiceHandler.createChoice(state, stackItem, {
      type: 'yes_no',
      sourceStackId: stackItem.id,
      sourceCardId: sourceCard.instanceId,
      sourceCardName: sourceCard.name,
      choosingPlayerId: stackItem.controllerId,
      controllingPlayerId: stackItem.controllerId,
      prompt: `${sourceCard.name}: ${optionalCost.costDescription} to get: "${optionalCost.conditionalEffect}"?`
    });

    return false; // Wait for choice
  }

  /**
   * Finds valid targets for an optional cost, respecting filters
   */
  static findValidTargetsForOptionalCost(
    state: StrictGameState,
    requirement: ParsedTargetRequirement,
    controllerId: string,
    sourceCardId: string
  ): string[] {
    const validTargets: string[] = [];

    for (const card of Object.values(state.cards)) {
      if (!requirement.filter.zones.includes(card.zone)) continue;

      // Type filter
      if (requirement.filter.types) {
        const hasType = requirement.filter.types.some(t =>
          card.types?.includes(t) || card.typeLine?.includes(t)
        );
        if (!hasType) continue;
      }

      // Controller filter
      if (requirement.filter.controllerType === 'you' && card.controllerId !== controllerId) continue;
      if (requirement.filter.controllerType === 'opponent' && card.controllerId === controllerId) continue;

      // Tapped filter
      if (requirement.filter.tapped !== undefined) {
        if (requirement.filter.tapped && !card.tapped) continue;  // Must be tapped but isn't
        if (!requirement.filter.tapped && card.tapped) continue;  // Must be untapped but is tapped
      }

      // Not-self filter (for "another" requirements)
      if (requirement.filter.notSelf && card.instanceId === sourceCardId) continue;

      validTargets.push(card.instanceId);
    }

    return validTargets;
  }

  /**
   * Processes an optional cost choice result and applies the conditional effect
   */
  static processOptionalCostChoice(
    state: StrictGameState,
    stackItem: StackObject,
    sourceCard: CardObject,
    choice: ChoiceResult
  ): boolean {
    const optionalCost = (stackItem as any).optionalCost as ParsedOptionalCost | undefined;
    if (!optionalCost) return true;

    // Check if player skipped
    const skipped = choice.selectedOptionIds?.includes('skip') ||
                    choice.confirmed === false ||
                    (choice.selectedCardIds?.length === 0 && choice.type === 'target_selection');

    if (skipped) {
      console.log(`[TriggeredAbilityHandler] Player skipped optional cost for ${sourceCard.name}`);
      // Don't execute the conditional effect, but mark as resolved
      (stackItem as any).optionalCostPaid = false;
      return true;
    }

    // Apply the cost
    let costPaid = false;
    switch (optionalCost.costType) {
      case 'tap_creature': {
        if (choice.selectedCardIds?.length) {
          const targetId = choice.selectedCardIds[0];
          const targetCard = state.cards[targetId];
          if (targetCard && !targetCard.tapped) {
            targetCard.tapped = true;
            costPaid = true;
            GameLogger.log(
              state,
              `${sourceCard.name}: Tapped {${targetCard.name}}`,
              'action',
              sourceCard.name,
              [sourceCard, targetCard]
            );
            console.log(`[TriggeredAbilityHandler] Paid optional cost: tapped ${targetCard.name}`);
          }
        }
        break;
      }

      case 'sacrifice': {
        if (choice.selectedCardIds?.length) {
          const targetId = choice.selectedCardIds[0];
          const targetCard = state.cards[targetId];
          if (targetCard) {
            ActionHandler.moveCardToZone(state, targetId, 'graveyard');
            costPaid = true;
            GameLogger.log(
              state,
              `${sourceCard.name}: Sacrificed {${targetCard.name}}`,
              'action',
              sourceCard.name,
              [sourceCard, targetCard]
            );
            console.log(`[TriggeredAbilityHandler] Paid optional cost: sacrificed ${targetCard.name}`);
          }
        }
        break;
      }

      case 'discard': {
        if (choice.selectedCardIds?.length) {
          for (const cardId of choice.selectedCardIds) {
            const discardedCard = state.cards[cardId];
            if (discardedCard) {
              ActionHandler.moveCardToZone(state, cardId, 'graveyard');
              GameLogger.log(
                state,
                `${sourceCard.name}: Discarded {${discardedCard.name}}`,
                'action',
                sourceCard.name,
                [sourceCard, discardedCard]
              );
            }
          }
          costPaid = true;
          console.log(`[TriggeredAbilityHandler] Paid optional cost: discarded ${choice.selectedCardIds.length} card(s)`);
        }
        break;
      }

      case 'pay_mana':
      case 'pay_life': {
        // For yes/no choices
        if (choice.confirmed) {
          costPaid = true;
          // TODO: Actually deduct mana/life
          console.log(`[TriggeredAbilityHandler] Paid optional cost: ${optionalCost.costDescription}`);
        }
        break;
      }
    }

    // Mark whether cost was paid
    (stackItem as any).optionalCostPaid = costPaid;

    // If cost was paid, apply the conditional effect
    if (costPaid) {
      this.applyConditionalEffect(state, stackItem, sourceCard, optionalCost.conditionalEffect);
    }

    return true;
  }

  /**
   * Applies the "if you do" conditional effect
   */
  static applyConditionalEffect(
    state: StrictGameState,
    stackItem: StackObject,
    sourceCard: CardObject,
    effectText: string
  ): void {
    const lowerEffect = effectText.toLowerCase();
    console.log(`[TriggeredAbilityHandler] Applying conditional effect: "${effectText}"`);

    // "this creature can't be blocked this turn"
    if (/(?:this creature|it|~) can'?t be blocked/i.test(lowerEffect)) {
      // Apply the modifier to the source card
      if (!sourceCard.modifiers) sourceCard.modifiers = [];
      sourceCard.modifiers.push({
        sourceId: stackItem.id,
        type: 'ability_grant',
        value: 'cant_be_blocked',
        untilEndOfTurn: true
      });

      GameLogger.log(
        state,
        `{${sourceCard.name}} can't be blocked this turn`,
        'action',
        sourceCard.name,
        [sourceCard]
      );
      console.log(`[TriggeredAbilityHandler] Applied "can't be blocked" to ${sourceCard.name}`);
      return;
    }

    // "this creature gets +X/+Y until end of turn"
    const pumpMatch = lowerEffect.match(/(?:this creature|it|~) gets? \+(\d+)\/\+(\d+)/i);
    if (pumpMatch) {
      const powerBoost = parseInt(pumpMatch[1]);
      const toughnessBoost = parseInt(pumpMatch[2]);

      if (!sourceCard.modifiers) sourceCard.modifiers = [];
      sourceCard.modifiers.push({
        sourceId: stackItem.id,
        type: 'pt_boost',
        value: { power: powerBoost, toughness: toughnessBoost },
        untilEndOfTurn: true
      });

      sourceCard.power = (sourceCard.basePower || sourceCard.power || 0) + powerBoost;
      sourceCard.toughness = (sourceCard.baseToughness || sourceCard.toughness || 0) + toughnessBoost;

      GameLogger.logPump(state, sourceCard, sourceCard, powerBoost, toughnessBoost);
      console.log(`[TriggeredAbilityHandler] Applied +${powerBoost}/+${toughnessBoost} to ${sourceCard.name}`);
      return;
    }

    // "target creature gets -X/-X until end of turn"
    const debuffMatch = lowerEffect.match(/target creature gets? ([-+]\d+)\/([-+]\d+)/i);
    if (debuffMatch && stackItem.targets?.length) {
      const powerMod = parseInt(debuffMatch[1]);
      const toughnessMod = parseInt(debuffMatch[2]);
      const targetCard = state.cards[stackItem.targets[0]];

      if (targetCard) {
        if (!targetCard.modifiers) targetCard.modifiers = [];
        targetCard.modifiers.push({
          sourceId: stackItem.id,
          type: 'pt_boost',
          value: { power: powerMod, toughness: toughnessMod },
          untilEndOfTurn: true
        });

        targetCard.power = (targetCard.basePower || targetCard.power || 0) + powerMod;
        targetCard.toughness = (targetCard.baseToughness || targetCard.toughness || 0) + toughnessMod;

        GameLogger.logPump(state, sourceCard, targetCard, powerMod, toughnessMod);
        console.log(`[TriggeredAbilityHandler] Applied ${powerMod}/${toughnessMod} to ${targetCard.name}`);
      }
      return;
    }

    // "draw a card"
    if (/draw (a card|\d+ cards?)/i.test(lowerEffect)) {
      const drawMatch = lowerEffect.match(/draw (a card|(\d+) cards?)/i);
      const count = drawMatch?.[2] ? parseInt(drawMatch[2]) : 1;
      for (let i = 0; i < count; i++) {
        ActionHandler.drawCard(state, stackItem.controllerId);
      }
      const player = state.players[stackItem.controllerId];
      GameLogger.log(
        state,
        `${player?.name || 'Player'} draws ${count} card${count > 1 ? 's' : ''}`,
        'action',
        sourceCard.name,
        [sourceCard]
      );
      console.log(`[TriggeredAbilityHandler] Drew ${count} card(s)`);
      return;
    }

    // "gain X life"
    const lifeGainMatch = lowerEffect.match(/(?:you )?gain (\d+) life/i);
    if (lifeGainMatch) {
      const amount = parseInt(lifeGainMatch[1]);
      const player = state.players[stackItem.controllerId];
      if (player) {
        player.life += amount;
        GameLogger.logLifeGain(state, sourceCard, player.name, amount);
        console.log(`[TriggeredAbilityHandler] ${player.name} gained ${amount} life`);
      }
      return;
    }

    // "deal X damage to any target"
    const damageMatch = lowerEffect.match(/deal (\d+) damage/i);
    if (damageMatch && stackItem.targets?.length) {
      const damage = parseInt(damageMatch[1]);
      const targetId = stackItem.targets[0];
      const targetCard = state.cards[targetId];
      const targetPlayer = state.players[targetId];

      if (targetCard && targetCard.zone === 'battlefield') {
        targetCard.damageMarked = (targetCard.damageMarked || 0) + damage;
        GameLogger.log(
          state,
          `{${sourceCard.name}} deals ${damage} damage to {${targetCard.name}}`,
          'action',
          sourceCard.name,
          [sourceCard, targetCard]
        );
      } else if (targetPlayer) {
        targetPlayer.life -= damage;
        GameLogger.log(
          state,
          `{${sourceCard.name}} deals ${damage} damage to ${targetPlayer.name}`,
          'action',
          sourceCard.name,
          [sourceCard]
        );
      }
      console.log(`[TriggeredAbilityHandler] Dealt ${damage} damage`);
      return;
    }

    console.log(`[TriggeredAbilityHandler] Unhandled conditional effect: "${effectText}"`);
  }
}
