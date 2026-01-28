import { StrictGameState, CardObject, StackObject, Zone, PendingChoice, ChoiceResult, DelayedTrigger, Step, Phase } from '../types';
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

/**
 * Represents a damage event for tracking triggers
 */
export interface DamageEvent {
  sourceId: string;        // Card dealing damage
  targetId: string;        // Card or player receiving damage
  amount: number;          // Amount of damage dealt
  isCombatDamage: boolean; // Whether this is combat damage
  isToPlayer: boolean;     // Whether target is a player (vs creature/planeswalker)
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

  // ============================================
  // APNAP ORDERING (Rule 101.4)
  // ============================================

  /**
   * Orders triggered abilities according to APNAP (Active Player, Non-Active Player) rule.
   * When multiple triggers happen simultaneously:
   * 1. Active player puts their triggers on the stack first (in any order they choose)
   * 2. Then non-active players in turn order put their triggers on the stack
   * 3. Since the stack is LIFO, active player's triggers resolve LAST
   *
   * @param state - Current game state
   * @param triggers - Array of triggers that happened simultaneously
   * @returns Ordered array of triggers (active player first, then APNAP order)
   */
  static orderTriggersAPNAP(state: StrictGameState, triggers: StackObject[]): StackObject[] {
    if (triggers.length <= 1) return triggers;

    const activePlayerId = state.activePlayerId;
    const playerIds = Object.keys(state.players);

    // Group triggers by controller
    const triggersByController: Record<string, StackObject[]> = {};
    for (const trigger of triggers) {
      if (!triggersByController[trigger.controllerId]) {
        triggersByController[trigger.controllerId] = [];
      }
      triggersByController[trigger.controllerId].push(trigger);
    }

    // Build APNAP order: active player first, then others in turn order
    // For 2-player game, it's just active then non-active
    const apnapOrder: string[] = [activePlayerId];
    for (const playerId of playerIds) {
      if (playerId !== activePlayerId) {
        apnapOrder.push(playerId);
      }
    }

    // Collect triggers in APNAP order
    // Active player's triggers go on stack first (bottom), resolve last
    const orderedTriggers: StackObject[] = [];
    for (const playerId of apnapOrder) {
      const playerTriggers = triggersByController[playerId] || [];
      // For now, add in original order within each player's triggers
      // TODO: For human players with multiple triggers, could prompt for ordering
      orderedTriggers.push(...playerTriggers);
    }

    console.log(`[TriggeredAbilityHandler] Ordered ${triggers.length} triggers by APNAP`);
    return orderedTriggers;
  }

  // ============================================
  // BEGINNING-OF-PHASE/STEP TRIGGERS
  // ============================================

  /**
   * Check for triggers that fire at the beginning of a phase or step.
   * Patterns detected:
   * - "At the beginning of your upkeep" (only active player)
   * - "At the beginning of each upkeep" / "At the beginning of each player's upkeep" (all players)
   * - "At the beginning of combat" / "At the beginning of your combat phase"
   * - "At the beginning of your end step"
   * - "At the beginning of the end step" / "At the beginning of each end step"
   *
   * @param state - Current game state
   * @param phase - Current phase
   * @param step - Current step
   * @returns Array of triggers that should go on the stack
   */
  static checkBeginningTriggers(state: StrictGameState, phase: string, step: string): StackObject[] {
    const triggers: StackObject[] = [];

    // Get all permanents on the battlefield
    const permanents = Object.values(state.cards).filter(c => c.zone === 'battlefield');

    for (const permanent of permanents) {
      const abilities = AbilityParser.parseAbilities(permanent);

      for (const ability of abilities) {
        if (ability.type !== 'triggered') continue;

        const text = ability.text.toLowerCase();
        const isActivePlayerController = permanent.controllerId === state.activePlayerId;

        // Check if this ability triggers for the current phase/step
        let shouldTrigger = false;

        // === UPKEEP TRIGGERS ===
        if (step === 'upkeep') {
          // "At the beginning of your upkeep" - only for active player's permanents
          if (/^at the beginning of your upkeep/i.test(text) && isActivePlayerController) {
            shouldTrigger = true;
          }
          // "At the beginning of each upkeep" / "At the beginning of each player's upkeep"
          else if (/^at the beginning of (?:each (?:player's )?)?upkeep/i.test(text)) {
            shouldTrigger = true;
          }
        }

        // === COMBAT TRIGGERS (beginning of combat) ===
        if (step === 'beginning_combat') {
          // "At the beginning of combat" / "At the beginning of your combat phase"
          if (/^at the beginning of (?:your )?combat/i.test(text) && isActivePlayerController) {
            shouldTrigger = true;
          }
          // "At the beginning of each combat"
          else if (/^at the beginning of each combat/i.test(text)) {
            shouldTrigger = true;
          }
        }

        // === END STEP TRIGGERS ===
        if (step === 'end') {
          // "At the beginning of your end step" - only for active player's permanents
          if (/^at the beginning of your end step/i.test(text) && isActivePlayerController) {
            shouldTrigger = true;
          }
          // "At the beginning of the end step" / "At the beginning of each end step"
          else if (/^at the beginning of (?:the |each )?end step/i.test(text)) {
            shouldTrigger = true;
          }
        }

        // === DRAW STEP TRIGGERS ===
        if (step === 'draw') {
          if (/^at the beginning of (?:your )?draw step/i.test(text) && isActivePlayerController) {
            shouldTrigger = true;
          }
        }

        // === MAIN PHASE TRIGGERS (rare) ===
        if (phase === 'main1' || phase === 'main2') {
          if (/^at the beginning of (?:your )?(?:first )?main phase/i.test(text) && isActivePlayerController) {
            if ((phase === 'main1' && /first/i.test(text)) || !(/first/i.test(text))) {
              shouldTrigger = true;
            }
          }
        }

        if (shouldTrigger) {
          const trigger = this.createTriggerStackObject(state, permanent, ability, permanent.controllerId);
          if (trigger) {
            triggers.push(trigger);
            console.log(`[TriggeredAbilityHandler] Beginning trigger detected: ${permanent.name} at ${phase}/${step}`);
          }
        }
      }
    }

    return triggers;
  }

  // ============================================
  // BLOCK TRIGGERS
  // ============================================

  /**
   * Check for triggers that fire when creatures block or become blocked.
   * Patterns detected:
   * - "Whenever this creature blocks" - Blocker has trigger
   * - "Whenever this creature becomes blocked" - Attacker has trigger
   * - "Whenever a creature you control blocks" - Other permanents care about blocking
   *
   * @param state - Current game state
   * @param blockers - Array of blocker/attacker pairs that were declared
   * @returns Array of triggers that should go on the stack
   */
  static checkBlockTriggers(
    state: StrictGameState,
    blockers: { blockerId: string; attackerId: string }[]
  ): StackObject[] {
    const triggers: StackObject[] = [];

    // Track which attackers became blocked (for "becomes blocked" triggers)
    const blockedAttackerIds = new Set<string>();
    for (const { attackerId } of blockers) {
      blockedAttackerIds.add(attackerId);
    }

    // 1. Check each blocker for "whenever this creature blocks" triggers
    for (const { blockerId, attackerId } of blockers) {
      const blocker = state.cards[blockerId];
      if (!blocker) continue;

      const abilities = AbilityParser.parseAbilities(blocker);
      for (const ability of abilities) {
        if (ability.type !== 'triggered') continue;
        const text = ability.text.toLowerCase();

        // "Whenever this creature blocks" or "Whenever ~ blocks"
        if (/^whenever (?:this creature|~|it) blocks/i.test(text)) {
          const trigger = this.createTriggerStackObject(state, blocker, ability, blocker.controllerId);
          if (trigger) {
            // Store the attacker being blocked for effect reference
            (trigger as any).blockedAttackerId = attackerId;
            triggers.push(trigger);
            console.log(`[TriggeredAbilityHandler] Block trigger: ${blocker.name} blocks`);
          }
        }
      }
    }

    // 2. Check each blocked attacker for "whenever this creature becomes blocked" triggers
    for (const attackerId of blockedAttackerIds) {
      const attacker = state.cards[attackerId];
      if (!attacker) continue;

      const abilities = AbilityParser.parseAbilities(attacker);
      for (const ability of abilities) {
        if (ability.type !== 'triggered') continue;
        const text = ability.text.toLowerCase();

        // "Whenever this creature becomes blocked"
        if (/^whenever (?:this creature|~|it) becomes blocked/i.test(text)) {
          const trigger = this.createTriggerStackObject(state, attacker, ability, attacker.controllerId);
          if (trigger) {
            triggers.push(trigger);
            console.log(`[TriggeredAbilityHandler] Becomes blocked trigger: ${attacker.name}`);
          }
        }
      }
    }

    // 3. Check other permanents for triggers that care about blocking
    const otherPermanents = Object.values(state.cards).filter(c =>
      c.zone === 'battlefield' &&
      !blockers.some(b => b.blockerId === c.instanceId) &&
      !blockedAttackerIds.has(c.instanceId)
    );

    for (const permanent of otherPermanents) {
      const abilities = AbilityParser.parseAbilities(permanent);
      for (const ability of abilities) {
        if (ability.type !== 'triggered') continue;
        const text = ability.text.toLowerCase();

        // "Whenever a creature you control blocks"
        if (/^whenever a creature you control blocks/i.test(text)) {
          // Check if any of the blockers are controlled by this permanent's controller
          const relevantBlockers = blockers.filter(b => {
            const blocker = state.cards[b.blockerId];
            return blocker && blocker.controllerId === permanent.controllerId;
          });

          for (const { blockerId } of relevantBlockers) {
            const trigger = this.createTriggerStackObject(state, permanent, ability, permanent.controllerId);
            if (trigger) {
              (trigger as any).triggeringBlockerId = blockerId;
              triggers.push(trigger);
              console.log(`[TriggeredAbilityHandler] ${permanent.name} triggers from creature blocking`);
            }
          }
        }

        // "Whenever a creature blocks"
        if (/^whenever a creature blocks/i.test(text) && !/you control/i.test(text)) {
          for (const { blockerId } of blockers) {
            const trigger = this.createTriggerStackObject(state, permanent, ability, permanent.controllerId);
            if (trigger) {
              (trigger as any).triggeringBlockerId = blockerId;
              triggers.push(trigger);
              console.log(`[TriggeredAbilityHandler] ${permanent.name} triggers from any creature blocking`);
            }
          }
        }
      }
    }

    return triggers;
  }

  // ============================================
  // DAMAGE TRIGGERS
  // ============================================

  /**
   * Check for triggers that fire when damage is dealt.
   * Patterns detected:
   * - "Whenever this creature deals damage"
   * - "Whenever this creature deals combat damage"
   * - "Whenever this creature deals combat damage to a player"
   * - "Whenever you are dealt damage" (player damage triggers)
   *
   * @param state - Current game state
   * @param damageEvents - Array of damage events that occurred
   * @returns Array of triggers that should go on the stack
   */
  static checkDamageTriggers(state: StrictGameState, damageEvents: DamageEvent[]): StackObject[] {
    const triggers: StackObject[] = [];

    for (const event of damageEvents) {
      const source = state.cards[event.sourceId];
      if (!source) continue;

      // Check the damage source for "deals damage" triggers
      const abilities = AbilityParser.parseAbilities(source);
      for (const ability of abilities) {
        if (ability.type !== 'triggered') continue;
        const text = ability.text.toLowerCase();

        let shouldTrigger = false;

        // "Whenever this creature deals combat damage to a player"
        if (/^whenever (?:this creature|~|it) deals combat damage to a player/i.test(text)) {
          if (event.isCombatDamage && event.isToPlayer) {
            shouldTrigger = true;
          }
        }
        // "Whenever this creature deals combat damage to an opponent"
        else if (/^whenever (?:this creature|~|it) deals combat damage to an opponent/i.test(text)) {
          if (event.isCombatDamage && event.isToPlayer) {
            // Check if target is an opponent
            const targetPlayer = state.players[event.targetId];
            if (targetPlayer && targetPlayer.id !== source.controllerId) {
              shouldTrigger = true;
            }
          }
        }
        // "Whenever this creature deals combat damage"
        else if (/^whenever (?:this creature|~|it) deals combat damage/i.test(text)) {
          if (event.isCombatDamage) {
            shouldTrigger = true;
          }
        }
        // "Whenever this creature deals damage to a player"
        else if (/^whenever (?:this creature|~|it) deals damage to a player/i.test(text)) {
          if (event.isToPlayer) {
            shouldTrigger = true;
          }
        }
        // "Whenever this creature deals damage"
        else if (/^whenever (?:this creature|~|it) deals damage/i.test(text)) {
          shouldTrigger = true;
        }

        if (shouldTrigger) {
          const trigger = this.createTriggerStackObject(state, source, ability, source.controllerId);
          if (trigger) {
            // Store damage event info for effect reference
            (trigger as any).damageEvent = event;
            triggers.push(trigger);
            console.log(`[TriggeredAbilityHandler] Damage trigger: ${source.name} dealt ${event.amount} damage`);
          }
        }
      }
    }

    // Check other permanents for triggers that care about damage
    const permanents = Object.values(state.cards).filter(c => c.zone === 'battlefield');
    for (const permanent of permanents) {
      const abilities = AbilityParser.parseAbilities(permanent);
      for (const ability of abilities) {
        if (ability.type !== 'triggered') continue;
        const text = ability.text.toLowerCase();

        // "Whenever you are dealt damage"
        if (/^whenever you are dealt damage/i.test(text)) {
          for (const event of damageEvents) {
            if (event.isToPlayer && event.targetId === permanent.controllerId) {
              const trigger = this.createTriggerStackObject(state, permanent, ability, permanent.controllerId);
              if (trigger) {
                (trigger as any).damageEvent = event;
                triggers.push(trigger);
                console.log(`[TriggeredAbilityHandler] ${permanent.name} triggers from damage to controller`);
              }
            }
          }
        }

        // "Whenever a creature you control deals damage"
        if (/^whenever a creature you control deals damage/i.test(text)) {
          for (const event of damageEvents) {
            const source = state.cards[event.sourceId];
            if (source && source.controllerId === permanent.controllerId && source.types?.includes('Creature')) {
              const trigger = this.createTriggerStackObject(state, permanent, ability, permanent.controllerId);
              if (trigger) {
                (trigger as any).damageEvent = event;
                triggers.push(trigger);
                console.log(`[TriggeredAbilityHandler] ${permanent.name} triggers from creature dealing damage`);
              }
            }
          }
        }
      }
    }

    return triggers;
  }

  // ============================================
  // LEAVES-THE-BATTLEFIELD (LTB) TRIGGERS
  // ============================================

  /**
   * Check for triggers that fire when a permanent leaves the battlefield.
   * Patterns detected:
   * - "When this leaves the battlefield" (self LTB)
   * - "When this creature leaves the battlefield"
   * - "Whenever a creature leaves the battlefield" (other permanents care)
   *
   * Note: Uses "look-back-in-time" - the cardSnapshot has the card's state BEFORE it left.
   *
   * @param state - Current game state
   * @param cardSnapshot - The card's state before it left the battlefield
   * @param toZone - The zone the card moved to
   * @returns Array of triggers that should go on the stack
   */
  static checkLTBTriggers(state: StrictGameState, cardSnapshot: CardObject, toZone: Zone): StackObject[] {
    const triggers: StackObject[] = [];

    // Don't trigger if moving to battlefield (that's ETB, not LTB)
    if (toZone === 'battlefield') return triggers;

    // 1. Check the leaving card itself for LTB triggers
    const abilities = AbilityParser.parseAbilities(cardSnapshot);
    for (const ability of abilities) {
      if (ability.type !== 'triggered') continue;
      const text = ability.text.toLowerCase();

      // "When this leaves the battlefield" / "When ~ leaves the battlefield"
      if (/^when (?:this|~|it) leaves the battlefield/i.test(text) ||
          /^when (?:this creature|this permanent|this artifact|this enchantment) leaves the battlefield/i.test(text)) {
        const trigger = this.createTriggerStackObject(state, cardSnapshot, ability, cardSnapshot.controllerId);
        if (trigger) {
          // Store the snapshot for effect resolution (look-back-in-time)
          (trigger as any).cardSnapshot = cardSnapshot;
          (trigger as any).toZone = toZone;
          triggers.push(trigger);
          console.log(`[TriggeredAbilityHandler] LTB trigger: ${cardSnapshot.name} left battlefield`);
        }
      }
    }

    // 2. Check other permanents for triggers that care about things leaving
    const otherPermanents = Object.values(state.cards).filter(c =>
      c.zone === 'battlefield' && c.instanceId !== cardSnapshot.instanceId
    );

    for (const permanent of otherPermanents) {
      const abilities = AbilityParser.parseAbilities(permanent);
      for (const ability of abilities) {
        if (ability.type !== 'triggered') continue;
        const text = ability.text.toLowerCase();

        // "Whenever a creature leaves the battlefield"
        if (/^whenever a creature leaves the battlefield/i.test(text)) {
          if (cardSnapshot.types?.includes('Creature')) {
            const trigger = this.createTriggerStackObject(state, permanent, ability, permanent.controllerId);
            if (trigger) {
              (trigger as any).leavingCardSnapshot = cardSnapshot;
              triggers.push(trigger);
              console.log(`[TriggeredAbilityHandler] ${permanent.name} triggers from creature leaving`);
            }
          }
        }

        // "Whenever a creature you control leaves the battlefield"
        if (/^whenever a creature you control leaves the battlefield/i.test(text)) {
          if (cardSnapshot.types?.includes('Creature') && cardSnapshot.controllerId === permanent.controllerId) {
            const trigger = this.createTriggerStackObject(state, permanent, ability, permanent.controllerId);
            if (trigger) {
              (trigger as any).leavingCardSnapshot = cardSnapshot;
              triggers.push(trigger);
              console.log(`[TriggeredAbilityHandler] ${permanent.name} triggers from your creature leaving`);
            }
          }
        }

        // "Whenever a permanent leaves the battlefield"
        if (/^whenever a permanent leaves the battlefield/i.test(text)) {
          const trigger = this.createTriggerStackObject(state, permanent, ability, permanent.controllerId);
          if (trigger) {
            (trigger as any).leavingCardSnapshot = cardSnapshot;
            triggers.push(trigger);
            console.log(`[TriggeredAbilityHandler] ${permanent.name} triggers from permanent leaving`);
          }
        }
      }
    }

    return triggers;
  }

  // ============================================
  // SPELL CAST TRIGGERS
  // ============================================

  /**
   * Check for triggers that fire when a spell is cast.
   * Patterns detected:
   * - "Whenever you cast a spell"
   * - "Whenever you cast a creature spell"
   * - "Whenever you cast an instant or sorcery spell"
   * - "Whenever an opponent casts a spell"
   * - "Whenever a player casts a spell"
   *
   * @param state - Current game state
   * @param castCard - The spell that was cast
   * @param casterId - The player who cast the spell
   * @returns Array of triggers that should go on the stack
   */
  static checkSpellCastTriggers(state: StrictGameState, castCard: CardObject, casterId: string): StackObject[] {
    const triggers: StackObject[] = [];

    // Get the spell's types for filtering
    const spellTypes = castCard.types || [];
    const isCreature = spellTypes.includes('Creature');
    const isInstant = spellTypes.includes('Instant');
    const isSorcery = spellTypes.includes('Sorcery');
    const isArtifact = spellTypes.includes('Artifact');
    const isEnchantment = spellTypes.includes('Enchantment');

    // Check all permanents for spell cast triggers
    const permanents = Object.values(state.cards).filter(c => c.zone === 'battlefield');

    for (const permanent of permanents) {
      const abilities = AbilityParser.parseAbilities(permanent);

      for (const ability of abilities) {
        if (ability.type !== 'triggered') continue;
        const text = ability.text.toLowerCase();

        let shouldTrigger = false;
        const isControllerCast = permanent.controllerId === casterId;
        const isOpponentCast = permanent.controllerId !== casterId;

        // "Whenever you cast a spell"
        if (/^whenever you cast a spell/i.test(text) && isControllerCast) {
          shouldTrigger = true;
        }
        // "Whenever you cast a creature spell"
        else if (/^whenever you cast a creature spell/i.test(text) && isControllerCast && isCreature) {
          shouldTrigger = true;
        }
        // "Whenever you cast an instant or sorcery spell"
        else if (/^whenever you cast an instant or sorcery spell/i.test(text) && isControllerCast && (isInstant || isSorcery)) {
          shouldTrigger = true;
        }
        // "Whenever you cast a noncreature spell"
        else if (/^whenever you cast a noncreature spell/i.test(text) && isControllerCast && !isCreature) {
          shouldTrigger = true;
        }
        // "Whenever you cast an artifact spell"
        else if (/^whenever you cast an artifact spell/i.test(text) && isControllerCast && isArtifact) {
          shouldTrigger = true;
        }
        // "Whenever you cast an enchantment spell"
        else if (/^whenever you cast an enchantment spell/i.test(text) && isControllerCast && isEnchantment) {
          shouldTrigger = true;
        }
        // "Whenever an opponent casts a spell"
        else if (/^whenever an opponent casts a spell/i.test(text) && isOpponentCast) {
          shouldTrigger = true;
        }
        // "Whenever a player casts a spell"
        else if (/^whenever a player casts a spell/i.test(text)) {
          shouldTrigger = true;
        }

        if (shouldTrigger) {
          const trigger = this.createTriggerStackObject(state, permanent, ability, permanent.controllerId);
          if (trigger) {
            // Store the cast spell info for effect reference
            (trigger as any).castSpell = {
              cardId: castCard.instanceId,
              cardName: castCard.name,
              casterId: casterId,
              types: spellTypes
            };
            triggers.push(trigger);
            console.log(`[TriggeredAbilityHandler] Spell cast trigger: ${permanent.name} from casting ${castCard.name}`);
          }
        }
      }
    }

    return triggers;
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

  // ============================================
  // DELAYED TRIGGERS (Rule 603.7)
  // ============================================

  /**
   * Creates a delayed triggered ability that will trigger at a later time.
   * Common patterns:
   * - "At the beginning of the next end step, exile it"
   * - "At the beginning of your next upkeep, draw a card"
   *
   * @param state - Current game state
   * @param sourceCard - Card creating the delayed trigger
   * @param controllerId - Who controls this delayed trigger
   * @param config - Configuration for when/what the trigger does
   */
  static createDelayedTrigger(
    state: StrictGameState,
    sourceCard: CardObject,
    controllerId: string,
    config: {
      triggerCondition: DelayedTrigger['triggerCondition'];
      effectText: string;
      targetIds?: string[];
      oneShot?: boolean;
    }
  ): void {
    if (!state.delayedTriggers) {
      state.delayedTriggers = [];
    }

    const delayedTrigger: DelayedTrigger = {
      id: `delayed-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      sourceCardId: sourceCard.instanceId,
      sourceCardName: sourceCard.name,
      controllerId,
      triggerCondition: config.triggerCondition,
      effectText: config.effectText,
      targetIds: config.targetIds,
      oneShot: config.oneShot ?? true, // Most delayed triggers are one-shot
      createdAtTurn: state.turnCount,
      createdAtStep: state.step
    };

    state.delayedTriggers.push(delayedTrigger);
    console.log(`[TriggeredAbilityHandler] Created delayed trigger: "${config.effectText}" (triggers at ${config.triggerCondition.step || config.triggerCondition.phase})`);
  }

  /**
   * Checks for delayed triggers that should fire at the current phase/step.
   * Called from PhaseManager at phase/step transitions.
   *
   * @param state - Current game state
   * @param phase - Current phase
   * @param step - Current step
   * @returns Array of triggers that should go on the stack
   */
  static checkDelayedTriggers(state: StrictGameState, phase: Phase, step: Step): StackObject[] {
    const triggers: StackObject[] = [];

    if (!state.delayedTriggers || state.delayedTriggers.length === 0) {
      return triggers;
    }

    const triggersToRemove: string[] = [];

    for (const delayed of state.delayedTriggers) {
      let shouldTrigger = false;

      // Check if the trigger condition is met
      if (delayed.triggerCondition.type === 'beginning_of_step') {
        if (delayed.triggerCondition.step === step) {
          // For "next" triggers, make sure we're not in the same step it was created
          if (delayed.triggerCondition.nextOccurrence) {
            const isSameStep = delayed.createdAtTurn === state.turnCount && delayed.createdAtStep === step;
            shouldTrigger = !isSameStep;
          } else {
            shouldTrigger = true;
          }
        }
      } else if (delayed.triggerCondition.type === 'beginning_of_phase') {
        if (delayed.triggerCondition.phase === phase) {
          shouldTrigger = true;
        }
      }

      if (shouldTrigger) {
        // Create a stack object for this delayed trigger
        const stackItem: StackObject = {
          id: `trigger-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          sourceId: delayed.sourceCardId,
          controllerId: delayed.controllerId,
          type: 'trigger',
          name: `Delayed: ${delayed.sourceCardName}`,
          text: delayed.effectText,
          targets: delayed.targetIds || [],
          resolutionState: {
            choicesMade: []
          }
        };

        // Store reference to the delayed trigger for effect resolution
        (stackItem as any).isDelayedTrigger = true;
        (stackItem as any).delayedTriggerId = delayed.id;

        triggers.push(stackItem);
        console.log(`[TriggeredAbilityHandler] Delayed trigger fires: ${delayed.sourceCardName} - "${delayed.effectText}"`);

        // Mark one-shot triggers for removal
        if (delayed.oneShot) {
          triggersToRemove.push(delayed.id);
        }
      }
    }

    // Remove one-shot triggers that fired
    if (triggersToRemove.length > 0) {
      state.delayedTriggers = state.delayedTriggers.filter(d => !triggersToRemove.includes(d.id));
    }

    return triggers;
  }

  /**
   * Parses effect text for delayed trigger patterns and creates the delayed trigger.
   * Common patterns:
   * - "At the beginning of the next end step, exile it"
   * - "At the beginning of your next upkeep, [effect]"
   *
   * @param state - Current game state
   * @param sourceCard - Card creating the effect
   * @param controllerId - Controller of the effect
   * @param effectText - Oracle text to parse
   * @param targetIds - Any pre-selected targets
   * @returns True if a delayed trigger was created
   */
  static parseAndCreateDelayedTrigger(
    state: StrictGameState,
    sourceCard: CardObject,
    controllerId: string,
    effectText: string,
    targetIds?: string[]
  ): boolean {
    const lowerText = effectText.toLowerCase();

    // "At the beginning of the next end step, [effect]"
    const nextEndStepMatch = lowerText.match(/at the beginning of the next end step,?\s*(.+)/i);
    if (nextEndStepMatch) {
      this.createDelayedTrigger(state, sourceCard, controllerId, {
        triggerCondition: {
          type: 'beginning_of_step',
          step: 'end',
          nextOccurrence: true
        },
        effectText: nextEndStepMatch[1].trim(),
        targetIds,
        oneShot: true
      });
      return true;
    }

    // "At the beginning of your next upkeep, [effect]"
    const nextUpkeepMatch = lowerText.match(/at the beginning of your next upkeep,?\s*(.+)/i);
    if (nextUpkeepMatch) {
      this.createDelayedTrigger(state, sourceCard, controllerId, {
        triggerCondition: {
          type: 'beginning_of_step',
          step: 'upkeep',
          nextOccurrence: true
        },
        effectText: nextUpkeepMatch[1].trim(),
        targetIds,
        oneShot: true
      });
      return true;
    }

    // "At the beginning of the next combat, [effect]"
    const nextCombatMatch = lowerText.match(/at the beginning of the next combat,?\s*(.+)/i);
    if (nextCombatMatch) {
      this.createDelayedTrigger(state, sourceCard, controllerId, {
        triggerCondition: {
          type: 'beginning_of_step',
          step: 'beginning_combat',
          nextOccurrence: true
        },
        effectText: nextCombatMatch[1].trim(),
        targetIds,
        oneShot: true
      });
      return true;
    }

    return false;
  }
}
