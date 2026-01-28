import { StrictGameState, CardObject, StackObject, ChoiceOption } from '../types';
import { ActionHandler } from './ActionHandler';
import { ChoiceHandler } from './ChoiceHandler';
import { GameLogger } from './GameLogger';
import { StateBasedEffects } from './StateBasedEffects';

/**
 * LorwynMechanics
 *
 * Handles the new mechanics from Lorwyn Eclipsed:
 * - Blight: Put -1/-1 counters on a creature you control as a cost
 * - Vivid: Ability word that counts colors among permanents you control
 * - Persist: Return creature with -1/-1 counter when it dies (if it had no -1/-1 counters)
 * - Counter Annihilation: +1/+1 and -1/-1 counters cancel out
 */
export class LorwynMechanics {

  // ============================================
  // BLIGHT MECHANIC
  // ============================================

  /**
   * Check if oracle text contains blight as a cost.
   * Blight appears as "you may blight N" or "blight N" as a cost.
   * To blight N, put N -1/-1 counters on a creature you control.
   */
  static hasBlight(oracleText: string): boolean {
    return /\bblight\s+\d+\b/i.test(oracleText);
  }

  /**
   * Parse blight cost from oracle text.
   * Returns the number of -1/-1 counters to put.
   */
  static parseBlightCost(oracleText: string): number {
    const match = oracleText.match(/\bblight\s+(\d+)\b/i);
    return match ? parseInt(match[1]) : 0;
  }

  /**
   * Check if a player can pay the blight cost.
   * Returns true if they have at least one creature on the battlefield
   * (creatures don't need to survive the blighting).
   */
  static canPayBlightCost(state: StrictGameState, playerId: string): boolean {
    return Object.values(state.cards).some(c =>
      c.controllerId === playerId &&
      c.zone === 'battlefield' &&
      (c.types?.includes('Creature') || c.typeLine?.toLowerCase().includes('creature'))
    );
  }

  /**
   * Get creatures that can receive blight counters.
   */
  static getBlightTargets(state: StrictGameState, playerId: string): CardObject[] {
    return Object.values(state.cards).filter(c =>
      c.controllerId === playerId &&
      c.zone === 'battlefield' &&
      (c.types?.includes('Creature') || c.typeLine?.toLowerCase().includes('creature'))
    );
  }

  /**
   * Apply blight effect: put N -1/-1 counters on target creature.
   * The creature doesn't need to survive (you can overkill a 1/1).
   */
  static applyBlight(state: StrictGameState, playerId: string, targetCreatureId: string, amount: number): boolean {
    const creature = state.cards[targetCreatureId];
    if (!creature || creature.zone !== 'battlefield') {
      console.warn(`[LorwynMechanics] Cannot blight: creature ${targetCreatureId} not found on battlefield`);
      return false;
    }

    if (creature.controllerId !== playerId) {
      console.warn(`[LorwynMechanics] Cannot blight: ${creature.name} not controlled by ${playerId}`);
      return false;
    }

    // Add -1/-1 counters
    ActionHandler.addCounter(state, playerId, targetCreatureId, '-1/-1', amount);

    console.log(`[LorwynMechanics] ${creature.name} receives ${amount} -1/-1 counter(s) from blight`);
    GameLogger.log(
      state,
      `Blight ${amount}: ${amount} -1/-1 counter${amount > 1 ? 's' : ''} placed on {${creature.name}}`,
      'action',
      'Blight',
      [creature]
    );

    // Run counter annihilation and state-based effects
    this.processCounterAnnihilation(state, creature);
    StateBasedEffects.process(state);

    return true;
  }

  /**
   * Creates a pending choice for blight target selection.
   * Called when an effect with "you may blight N" needs target selection.
   */
  static createBlightChoice(
    state: StrictGameState,
    stackItem: StackObject,
    sourceCard: CardObject,
    blightAmount: number,
    isMayAbility: boolean = true
  ): boolean {
    const controllerId = stackItem.controllerId;
    const validTargets = this.getBlightTargets(state, controllerId);

    if (validTargets.length === 0) {
      console.log(`[LorwynMechanics] No valid blight targets for ${sourceCard.name}`);
      return false;
    }

    const prompt = isMayAbility
      ? `You may blight ${blightAmount}. Choose a creature you control to put ${blightAmount} -1/-1 counter${blightAmount > 1 ? 's' : ''} on:`
      : `Blight ${blightAmount}: Choose a creature you control:`;

    // For "you may" abilities, add a skip option
    const options: ChoiceOption[] | undefined = isMayAbility ? [
      { id: 'skip', label: "Don't blight", description: "Skip the blight effect" }
    ] : undefined;

    ChoiceHandler.createChoice(state, stackItem, {
      type: 'target_selection',
      sourceStackId: stackItem.id,
      sourceCardId: sourceCard.instanceId,
      sourceCardName: sourceCard.name,
      choosingPlayerId: controllerId,
      controllingPlayerId: controllerId,
      constraints: { exactCount: 1 },
      selectableIds: validTargets.map(c => c.instanceId),
      options: options,
      prompt: prompt
    });

    // Store blight amount in stack item for later resolution
    (stackItem as any).blightAmount = blightAmount;

    console.log(`[LorwynMechanics] Created blight choice for ${sourceCard.name}, amount: ${blightAmount}`);
    return true;
  }

  // ============================================
  // VIVID MECHANIC
  // ============================================

  /**
   * Count the number of distinct colors among permanents a player controls.
   * Returns a number from 0 to 5.
   * Note: Colorless permanents and lands (unless they have a color) don't contribute.
   */
  static countVividColors(state: StrictGameState, playerId: string): number {
    const colorsFound = new Set<string>();

    Object.values(state.cards).forEach(card => {
      if (card.controllerId === playerId && card.zone === 'battlefield') {
        const colors = card.colors || [];
        colors.forEach(c => colorsFound.add(c));
      }
    });

    return colorsFound.size;
  }

  /**
   * Check if oracle text contains a vivid ability.
   */
  static hasVivid(oracleText: string): boolean {
    return /\bvivid\b/i.test(oracleText);
  }

  /**
   * Parse vivid effect to determine how the color count is used.
   * Returns a description of the effect.
   */
  static parseVividEffect(oracleText: string): { type: string; multiplier?: number } | null {
    const lowerText = oracleText.toLowerCase();

    // "+X/+X where X is vivid" or "equal to vivid"
    if (/gets?\s+\+x\/\+x.*vivid/i.test(lowerText) ||
        /vivid.*\+x\/\+x/i.test(lowerText) ||
        /equal to the number of colors/i.test(lowerText)) {
      return { type: 'pump' };
    }

    // "deals X damage where X is vivid"
    if (/deals?\s+x\s+damage.*vivid/i.test(lowerText) ||
        /vivid.*deals?\s+damage/i.test(lowerText)) {
      return { type: 'damage' };
    }

    // "draw X cards" or "gain X life"
    if (/draw\s+x\s+cards?.*vivid/i.test(lowerText) ||
        /gain\s+x\s+life.*vivid/i.test(lowerText)) {
      return { type: 'value' };
    }

    return { type: 'generic' };
  }

  // ============================================
  // PERSIST MECHANIC
  // ============================================

  /**
   * Check if a card has the persist keyword.
   */
  static hasPersist(card: CardObject): boolean {
    if (card.keywords?.includes('Persist')) return true;

    const oracleText = (card.oracleText || card.definition?.oracle_text || '').toLowerCase();
    return /\bpersist\b/.test(oracleText);
  }

  /**
   * Check if a creature is eligible for persist (no -1/-1 counters when it died).
   */
  static canPersist(card: CardObject): boolean {
    if (!this.hasPersist(card)) return false;

    // Check if creature had any -1/-1 counters
    const minusCounters = card.counters?.find(c => c.type === '-1/-1');
    return !minusCounters || minusCounters.count <= 0;
  }

  /**
   * Return a creature from persist.
   * Puts the creature on the battlefield with a -1/-1 counter.
   */
  static returnFromPersist(state: StrictGameState, card: CardObject): boolean {
    if (card.zone !== 'graveyard') {
      console.warn(`[LorwynMechanics] Cannot persist: ${card.name} not in graveyard`);
      return false;
    }

    if (card.isToken) {
      console.log(`[LorwynMechanics] Tokens cannot persist: ${card.name}`);
      return false;
    }

    // Move to battlefield
    ActionHandler.moveCardToZone(state, card.instanceId, 'battlefield');

    // Add a -1/-1 counter
    ActionHandler.addCounter(state, card.ownerId, card.instanceId, '-1/-1', 1);

    // Reset tapped state (enters untapped)
    card.tapped = false;

    // Reset damage
    card.damageMarked = 0;

    // Mark as controlled since this turn (summoning sickness)
    card.controlledSinceTurn = state.turnCount;

    console.log(`[LorwynMechanics] ${card.name} returns from persist with a -1/-1 counter`);
    GameLogger.log(
      state,
      `{${card.name}} returns from persist with a -1/-1 counter`,
      'action',
      'Persist',
      [card]
    );

    // Run counter annihilation in case it already had +1/+1 counters somehow
    this.processCounterAnnihilation(state, card);

    return true;
  }

  // ============================================
  // COUNTER ANNIHILATION (Rule 122.3)
  // ============================================

  /**
   * Process counter annihilation for a single card.
   * If a permanent has both +1/+1 and -1/-1 counters, they are removed in pairs.
   */
  static processCounterAnnihilation(state: StrictGameState, card: CardObject): boolean {
    if (!card.counters) return false;

    const plusCounters = card.counters.find(c => c.type === '+1/+1');
    const minusCounters = card.counters.find(c => c.type === '-1/-1');

    if (!plusCounters || !minusCounters) return false;
    if (plusCounters.count <= 0 || minusCounters.count <= 0) return false;

    // Annihilate counters in pairs
    const pairsToRemove = Math.min(plusCounters.count, minusCounters.count);

    plusCounters.count -= pairsToRemove;
    minusCounters.count -= pairsToRemove;

    console.log(`[LorwynMechanics] Counter annihilation on ${card.name}: removed ${pairsToRemove} pairs`);
    GameLogger.log(
      state,
      `${pairsToRemove} +1/+1 and -1/-1 counters annihilate on {${card.name}}`,
      'info',
      'Counters',
      [card]
    );

    // Remove counters with 0 count
    card.counters = card.counters.filter(c => c.count > 0);

    // Recalculate P/T based on remaining counters
    this.recalculateCounterBonuses(card);

    return pairsToRemove > 0;
  }

  /**
   * Process counter annihilation for all permanents.
   * Called after adding counters or during state-based effects.
   */
  static processAllCounterAnnihilation(state: StrictGameState): boolean {
    let anyAnnihilated = false;

    Object.values(state.cards).forEach(card => {
      if (card.zone === 'battlefield') {
        if (this.processCounterAnnihilation(state, card)) {
          anyAnnihilated = true;
        }
      }
    });

    return anyAnnihilated;
  }

  /**
   * Recalculate power/toughness bonuses from +1/+1 and -1/-1 counters.
   */
  static recalculateCounterBonuses(card: CardObject): void {
    let counterBonus = 0;

    for (const counter of card.counters || []) {
      if (counter.type === '+1/+1') {
        counterBonus += counter.count;
      } else if (counter.type === '-1/-1') {
        counterBonus -= counter.count;
      }
    }

    // Calculate total modifiers excluding counter effects (we'll add them back)
    let totalPowerMod = 0;
    let totalToughnessMod = 0;

    for (const mod of card.modifiers || []) {
      if (mod.type === 'pt_boost' && mod.value && mod.sourceId !== 'counters') {
        totalPowerMod += mod.value.power || 0;
        totalToughnessMod += mod.value.toughness || 0;
      }
    }

    // Apply counter bonus
    card.power = (card.basePower || 0) + totalPowerMod + counterBonus;
    card.toughness = (card.baseToughness || 0) + totalToughnessMod + counterBonus;
  }

  // ============================================
  // EFFECT RESOLUTION HELPERS
  // ============================================

  /**
   * Check if an ETB effect requires blight and create the appropriate choice.
   * Returns true if a choice was created (pause resolution), false otherwise.
   */
  static handleETBBlightEffect(
    state: StrictGameState,
    card: CardObject,
    stackItem: StackObject
  ): boolean {
    const oracleText = (card.oracleText || card.definition?.oracle_text || '').toLowerCase();

    // Check for patterns like "you may blight N. If you do, [effect]"
    const blightMatch = oracleText.match(/you may blight\s+(\d+)\.\s*if you do,/i);
    if (blightMatch) {
      const blightAmount = parseInt(blightMatch[1]);
      if (blightAmount > 0 && this.canPayBlightCost(state, stackItem.controllerId)) {
        return this.createBlightChoice(state, stackItem, card, blightAmount, true);
      }
    }

    // Check for mandatory blight as ETB cost
    const mandatoryBlight = oracleText.match(/when .* enters.*blight\s+(\d+)/i);
    if (mandatoryBlight) {
      const blightAmount = parseInt(mandatoryBlight[1]);
      if (blightAmount > 0 && this.canPayBlightCost(state, stackItem.controllerId)) {
        return this.createBlightChoice(state, stackItem, card, blightAmount, false);
      }
    }

    return false;
  }

  /**
   * Process blight choice result and continue with the conditional effect.
   */
  static processBlightChoice(
    state: StrictGameState,
    card: CardObject,
    stackItem: StackObject,
    selectedCardIds: string[] | undefined,
    skipped: boolean
  ): boolean {
    const blightAmount = (stackItem as any).blightAmount || 0;

    if (skipped || !selectedCardIds?.length) {
      console.log(`[LorwynMechanics] Blight skipped for ${card.name}`);
      return false; // Don't execute the "if you do" effect
    }

    const targetId = selectedCardIds[0];
    this.applyBlight(state, stackItem.controllerId, targetId, blightAmount);

    return true; // Continue with the "if you do" effect
  }

  // ============================================
  // EVOKE SUPPORT (Returning Mechanic)
  // ============================================

  /**
   * Check if a card has evoke.
   */
  static hasEvoke(card: CardObject): boolean {
    if (card.keywords?.includes('Evoke')) return true;

    const oracleText = (card.oracleText || card.definition?.oracle_text || '').toLowerCase();
    return /\bevoke\b/.test(oracleText);
  }

  /**
   * Parse evoke cost from oracle text.
   */
  static parseEvokeCost(oracleText: string): string | null {
    const match = oracleText.match(/evoke\s+(\{[^}]+\}(?:\{[^}]+\})*)/i);
    return match ? match[1] : null;
  }

  // ============================================
  // BEHOLD SUPPORT (Returning Mechanic)
  // ============================================

  /**
   * Check if a card has behold.
   * Behold: Choose a permanent you control, or reveal a card from your hand that shares a type with it.
   */
  static hasBehold(card: CardObject): boolean {
    const oracleText = (card.oracleText || card.definition?.oracle_text || '').toLowerCase();
    return /\bbehold\b/.test(oracleText);
  }

  /**
   * Check behold condition: does the player control a permanent or have a card in hand
   * that matches the required type?
   */
  static checkBeholdCondition(state: StrictGameState, playerId: string, requiredTypes: string[]): boolean {
    // Check permanents on battlefield
    const hasPermanent = Object.values(state.cards).some(c =>
      c.controllerId === playerId &&
      c.zone === 'battlefield' &&
      requiredTypes.some(type =>
        c.types?.includes(type) || c.typeLine?.toLowerCase().includes(type.toLowerCase())
      )
    );

    if (hasPermanent) return true;

    // Check hand for matching card to reveal
    const hasInHand = Object.values(state.cards).some(c =>
      c.ownerId === playerId &&
      c.zone === 'hand' &&
      requiredTypes.some(type =>
        c.types?.includes(type) || c.typeLine?.toLowerCase().includes(type.toLowerCase())
      )
    );

    return hasInHand;
  }

  // ============================================
  // CONVOKE SUPPORT (Returning Mechanic)
  // ============================================

  /**
   * Check if a card has convoke.
   */
  static hasConvoke(card: CardObject): boolean {
    if (card.keywords?.includes('Convoke')) return true;

    const oracleText = (card.oracleText || card.definition?.oracle_text || '').toLowerCase();
    return /\bconvoke\b/.test(oracleText);
  }

  /**
   * Get untapped creatures that can be tapped for convoke.
   */
  static getConvokeCreatures(state: StrictGameState, playerId: string): CardObject[] {
    return Object.values(state.cards).filter(c =>
      c.controllerId === playerId &&
      c.zone === 'battlefield' &&
      !c.tapped &&
      (c.types?.includes('Creature') || c.typeLine?.toLowerCase().includes('creature'))
    );
  }
}
