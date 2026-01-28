import { StrictGameState, CardObject, StackObject, ChoiceResult } from '../types';
import { ActionHandler } from './ActionHandler';
import { StateBasedEffects } from './StateBasedEffects';
import { GameLogger } from './GameLogger';
import { ChoiceHandler } from './ChoiceHandler';
import { LorwynMechanics } from './LorwynMechanics';
import { scryfallService } from '../../singletons';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SETS_DIR = path.join(__dirname, '../../public/cards/sets');

/**
 * OracleEffectResolver
 *
 * Parses and executes spell effects based on oracle text.
 * This enables bot-cast spells (and player spells) to actually
 * interact with the game state based on their card text.
 */
export class OracleEffectResolver {

  /**
   * Main entry point: resolves a spell's effects based on oracle text
   */
  static resolveSpellEffects(
    state: StrictGameState,
    card: CardObject,
    stackItem: StackObject
  ): boolean {
    const oracleText = (card.oracleText || card.definition?.oracle_text || '').toLowerCase();
    const controllerId = stackItem.controllerId;
    const targets = stackItem.targets || [];

    console.log(`[OracleEffectResolver] Resolving effects for "${card.name}": ${oracleText.substring(0, 100)}...`);

    // ============================================
    // CHOICE SYSTEM - Check for pending/completed choices
    // ============================================

    // Check if there's a pending choice for this stack item (waiting for player input)
    if (state.pendingChoice?.sourceStackId === stackItem.id) {
      console.log(`[OracleEffectResolver] Waiting for choice resolution for ${card.name}`);
      return false; // Don't resolve yet, waiting for player choice
    }

    // Check for completed choice that needs execution
    const completedChoice = stackItem.resolutionState?.choicesMade?.find(c => !c._executed);
    if (completedChoice) {
      return this.executeChoiceEffect(state, card, stackItem, completedChoice);
    }

    // Check for hand reveal + choose effects (e.g., "Auntie's Sentence")
    if (this.requiresOpponentHandChoice(oracleText, stackItem)) {
      return this.handleHandRevealChoice(state, card, stackItem, oracleText);
    }

    // Check for modal spells ("Choose one", "Choose two", etc.)
    if (this.requiresModeChoice(oracleText, stackItem)) {
      return this.handleModeChoice(state, card, stackItem, oracleText);
    }

    // Check for blight effects (Lorwyn Eclipsed mechanic)
    if (this.requiresBlightChoice(oracleText, stackItem)) {
      return this.handleBlightChoice(state, card, stackItem, oracleText);
    }

    // ============================================
    // STANDARD EFFECT RESOLUTION
    // ============================================

    let effectResolved = false;

    // Process each effect type
    // Order matters - some effects should be processed before others

    // 1. Counter spell effects (highest priority)
    if (this.resolveCounterEffect(state, oracleText, targets)) {
      effectResolved = true;
    }

    // 2. Damage effects
    if (this.resolveDamageEffect(state, oracleText, controllerId, targets, card)) {
      effectResolved = true;
    }

    // 3. Destruction effects
    if (this.resolveDestroyEffect(state, oracleText, controllerId, targets, card)) {
      effectResolved = true;
    }

    // 4. Exile effects
    if (this.resolveExileEffect(state, oracleText, controllerId, targets, card)) {
      effectResolved = true;
    }

    // 5. Bounce effects (return to hand)
    if (this.resolveBounceEffect(state, oracleText, controllerId, targets, card)) {
      effectResolved = true;
    }

    // 6. Pump effects (+X/+X)
    if (this.resolvePumpEffect(state, oracleText, controllerId, targets, card)) {
      effectResolved = true;
    }

    // 7. Draw card effects
    if (this.resolveDrawEffect(state, oracleText, controllerId, card)) {
      effectResolved = true;
    }

    // 8. Discard effects
    if (this.resolveDiscardEffect(state, oracleText, controllerId, targets, card)) {
      effectResolved = true;
    }

    // 9. Life gain/loss effects
    if (this.resolveLifeEffect(state, oracleText, controllerId, targets, card)) {
      effectResolved = true;
    }

    // 10. Mill effects
    if (this.resolveMillEffect(state, oracleText, controllerId, targets, card)) {
      effectResolved = true;
    }

    // 11. Tap/untap effects
    if (this.resolveTapUntapEffect(state, oracleText, controllerId, targets, card)) {
      effectResolved = true;
    }

    // 12. Token creation effects
    if (this.resolveTokenEffect(state, oracleText, controllerId, card)) {
      effectResolved = true;
    }

    // 13. Counter placement effects
    if (this.resolveCounterPlacementEffect(state, oracleText, controllerId, targets, card)) {
      effectResolved = true;
    }

    // 14. Aura effects (ETB triggers and continuous effects)
    if (this.resolveAuraEffects(state, oracleText, controllerId, card)) {
      effectResolved = true;
    }

    // 15. Fight effects
    if (this.resolveFightEffect(state, oracleText, controllerId, targets, card)) {
      effectResolved = true;
    }

    // Run state-based effects after resolving
    StateBasedEffects.process(state);

    return effectResolved;
  }

  // ============================================
  // COUNTER SPELL EFFECTS
  // ============================================

  static resolveCounterEffect(state: StrictGameState, oracleText: string, targets: string[]): boolean {
    const counterMatch = oracleText.match(/counter target (spell|creature spell|instant|sorcery|artifact spell|enchantment spell)/);
    if (!counterMatch) return false;

    const targetId = targets[0];
    if (!targetId) return false;

    // Find the spell on the stack
    const stackIndex = state.stack.findIndex(s => s.id === targetId);
    if (stackIndex === -1) {
      console.log(`[OracleEffectResolver] Counter target not found on stack`);
      return false;
    }

    const counteredSpell = state.stack[stackIndex];
    const counteredCard = state.cards[counteredSpell.sourceId];

    // Remove from stack
    state.stack.splice(stackIndex, 1);

    // Move countered card to graveyard
    if (counteredCard) {
      ActionHandler.moveCardToZone(state, counteredCard.instanceId, 'graveyard');
      console.log(`[OracleEffectResolver] Countered ${counteredCard.name}`);
      GameLogger.logSpellCountered(state, counteredCard);
    }

    return true;
  }

  // ============================================
  // DAMAGE EFFECTS
  // ============================================

  static resolveDamageEffect(
    state: StrictGameState,
    oracleText: string,
    controllerId: string,
    targets: string[],
    sourceCard: CardObject
  ): boolean {
    // Match patterns like "deals X damage to target creature" or "deals X damage to any target"
    const damagePatterns = [
      /deals? (\d+) damage to (target|any target|each|all)/,
      /deals? (\d+) damage to target (creature|player|opponent|planeswalker)/,
      /deals? (\d+) damage to (it|that creature|that player)/,
      /(\d+) damage to (target|any target|each opponent|each player)/
    ];

    let damageAmount = 0;

    for (const pattern of damagePatterns) {
      const match = oracleText.match(pattern);
      if (match) {
        damageAmount = parseInt(match[1]);
        break;
      }
    }

    if (damageAmount === 0) return false;

    // Handle "each opponent" or "each player"
    if (oracleText.includes('each opponent')) {
      Object.keys(state.players).forEach(playerId => {
        if (playerId !== controllerId) {
          this.dealDamageToPlayer(state, playerId, damageAmount, sourceCard);
        }
      });
      return true;
    }

    if (oracleText.includes('each player')) {
      Object.keys(state.players).forEach(playerId => {
        this.dealDamageToPlayer(state, playerId, damageAmount, sourceCard);
      });
      return true;
    }

    // Handle "all creatures" damage
    if (oracleText.includes('to all creatures') || oracleText.includes('to each creature')) {
      Object.values(state.cards).forEach(card => {
        if (card.zone === 'battlefield' &&
            (card.types?.includes('Creature') || card.typeLine?.includes('Creature'))) {
          this.dealDamageToCreature(state, card, damageAmount, sourceCard);
        }
      });
      return true;
    }

    // Handle targeted damage
    if (targets.length > 0) {
      const targetId = targets[0];

      // Check if target is a player
      if (state.players[targetId]) {
        this.dealDamageToPlayer(state, targetId, damageAmount, sourceCard);
        return true;
      }

      // Check if target is a card
      const targetCard = state.cards[targetId];
      if (targetCard && targetCard.zone === 'battlefield') {
        this.dealDamageToCreature(state, targetCard, damageAmount, sourceCard);
        return true;
      }
    }

    return false;
  }

  static dealDamageToPlayer(state: StrictGameState, playerId: string, amount: number, source: CardObject) {
    const player = state.players[playerId];
    if (!player) return;

    player.life -= amount;
    console.log(`[OracleEffectResolver] ${source.name} deals ${amount} damage to ${player.name} (now at ${player.life} life)`);
    GameLogger.logDamageDealt(state, source, player.name, amount);
  }

  static dealDamageToCreature(state: StrictGameState, creature: CardObject, amount: number, source: CardObject) {
    creature.damageMarked = (creature.damageMarked || 0) + amount;
    console.log(`[OracleEffectResolver] ${source.name} deals ${amount} damage to ${creature.name} (${creature.damageMarked} total marked)`);
    GameLogger.logDamageDealt(state, source, creature.name, amount);
  }

  // ============================================
  // DESTRUCTION EFFECTS
  // ============================================

  static resolveDestroyEffect(
    state: StrictGameState,
    oracleText: string,
    _controllerId: string,
    targets: string[],
    sourceCard: CardObject
  ): boolean {
    const destroyPatterns = [
      /destroy (target|all|each) (creature|permanent|artifact|enchantment|planeswalker)/,
      /destroy (it|that creature|that permanent)/,
      /destroys? target (nonland permanent|nonblack creature|nonartifact creature)/
    ];

    let isDestroyEffect = false;
    let destroyAll = false;
    let targetType = '';

    for (const pattern of destroyPatterns) {
      const match = oracleText.match(pattern);
      if (match) {
        isDestroyEffect = true;
        destroyAll = match[1] === 'all' || match[1] === 'each';
        targetType = match[2] || '';
        break;
      }
    }

    if (!isDestroyEffect) return false;

    // Handle "destroy all creatures" (board wipes)
    if (destroyAll) {
      const toDestroy = Object.values(state.cards).filter(c => {
        if (c.zone !== 'battlefield') return false;
        return this.matchesTargetType(c, targetType);
      });

      toDestroy.forEach(card => {
        ActionHandler.moveCardToZone(state, card.instanceId, 'graveyard');
        console.log(`[OracleEffectResolver] ${sourceCard.name} destroyed ${card.name}`);
      });

      if (toDestroy.length > 0) {
        GameLogger.logBoardWipe(state, sourceCard, toDestroy.length);
      }
      return true;
    }

    // Handle targeted destruction
    if (targets.length > 0) {
      const targetId = targets[0];
      const targetCard = state.cards[targetId];

      if (targetCard && targetCard.zone === 'battlefield') {
        // Check for indestructible
        const hasIndestructible = targetCard.keywords?.includes('Indestructible') ||
          targetCard.oracleText?.toLowerCase().includes('indestructible');

        if (!hasIndestructible) {
          ActionHandler.moveCardToZone(state, targetCard.instanceId, 'graveyard');
          console.log(`[OracleEffectResolver] ${sourceCard.name} destroyed ${targetCard.name}`);
          GameLogger.logDestroy(state, sourceCard, targetCard);
          return true;
        } else {
          console.log(`[OracleEffectResolver] ${targetCard.name} is indestructible`);
        }
      }
    }

    return false;
  }

  // ============================================
  // EXILE EFFECTS
  // ============================================

  static resolveExileEffect(
    state: StrictGameState,
    oracleText: string,
    _controllerId: string,
    targets: string[],
    sourceCard: CardObject
  ): boolean {
    const exilePatterns = [
      /exile (target|all|each) (creature|permanent|card|artifact|enchantment)/,
      /exile (it|that creature|that card)/,
      /exiles? target (nonland permanent|attacking creature)/
    ];

    let isExileEffect = false;
    let exileAll = false;

    for (const pattern of exilePatterns) {
      const match = oracleText.match(pattern);
      if (match) {
        isExileEffect = true;
        exileAll = match[1] === 'all' || match[1] === 'each';
        break;
      }
    }

    if (!isExileEffect) return false;

    // Handle "exile all"
    if (exileAll) {
      const toExile = Object.values(state.cards).filter(c =>
        c.zone === 'battlefield' &&
        (c.types?.includes('Creature') || c.typeLine?.includes('Creature'))
      );

      toExile.forEach(card => {
        ActionHandler.moveCardToZone(state, card.instanceId, 'exile');
        console.log(`[OracleEffectResolver] ${sourceCard.name} exiled ${card.name}`);
      });
      return toExile.length > 0;
    }

    // Handle targeted exile
    if (targets.length > 0) {
      const targetId = targets[0];
      const targetCard = state.cards[targetId];

      if (targetCard && (targetCard.zone === 'battlefield' || targetCard.zone === 'graveyard')) {
        ActionHandler.moveCardToZone(state, targetCard.instanceId, 'exile');
        console.log(`[OracleEffectResolver] ${sourceCard.name} exiled ${targetCard.name}`);
        GameLogger.logExile(state, sourceCard, targetCard);
        return true;
      }
    }

    return false;
  }

  // ============================================
  // BOUNCE EFFECTS
  // ============================================

  static resolveBounceEffect(
    state: StrictGameState,
    oracleText: string,
    _controllerId: string,
    targets: string[],
    sourceCard: CardObject
  ): boolean {
    const bouncePatterns = [
      /return (target|all|each) (creature|permanent|nonland permanent)/,
      /return (it|that creature) to its owner's hand/,
      /returns? target (creature|permanent) to its owner's hand/,
      /put (target|that) (creature|permanent) .* into .* (hand|library)/
    ];

    let isBounceEffect = false;

    for (const pattern of bouncePatterns) {
      const match = oracleText.match(pattern);
      if (match) {
        isBounceEffect = true;
        break;
      }
    }

    if (!isBounceEffect) return false;

    // Handle "return all creatures" bounce
    if (oracleText.includes('return all') || oracleText.includes('return each')) {
      const toBounce = Object.values(state.cards).filter(c =>
        c.zone === 'battlefield' &&
        (c.types?.includes('Creature') || c.typeLine?.includes('Creature'))
      );
      toBounce.forEach(card => {
        ActionHandler.moveCardToZone(state, card.instanceId, 'hand');
      });
      return toBounce.length > 0;
    }

    // Handle targeted bounce
    if (targets.length > 0) {
      const targetId = targets[0];
      const targetCard = state.cards[targetId];

      if (targetCard && targetCard.zone === 'battlefield') {
        ActionHandler.moveCardToZone(state, targetCard.instanceId, 'hand');
        console.log(`[OracleEffectResolver] ${sourceCard.name} returned ${targetCard.name} to hand`);
        GameLogger.logBounce(state, sourceCard, targetCard);
        return true;
      }
    }

    return false;
  }

  // ============================================
  // PUMP EFFECTS (+X/+X)
  // ============================================

  static resolvePumpEffect(
    state: StrictGameState,
    oracleText: string,
    controllerId: string,
    targets: string[],
    sourceCard: CardObject
  ): boolean {
    // Match patterns like "+2/+2", "gets +3/+3", "-2/-2"
    const pumpPatterns = [
      /gets? ([+-]\d+)\/([+-]\d+)/,
      /([+-]\d+)\/([+-]\d+) until end of turn/,
      /target creature gets ([+-]\d+)\/([+-]\d+)/
    ];

    let powerMod = 0;
    let toughnessMod = 0;

    for (const pattern of pumpPatterns) {
      const match = oracleText.match(pattern);
      if (match) {
        powerMod = parseInt(match[1]);
        toughnessMod = parseInt(match[2]);
        break;
      }
    }

    if (powerMod === 0 && toughnessMod === 0) return false;

    // Determine target
    let targetCard: CardObject | null = null;

    if (targets.length > 0) {
      targetCard = state.cards[targets[0]];
    }

    if (!targetCard || targetCard.zone !== 'battlefield') {
      // Try to find "target creature you control" in text and use our best creature
      if (oracleText.includes('creature you control')) {
        const ourCreatures = Object.values(state.cards).filter(c =>
          c.controllerId === controllerId &&
          c.zone === 'battlefield' &&
          (c.types?.includes('Creature') || c.typeLine?.includes('Creature'))
        );
        if (ourCreatures.length > 0) {
          targetCard = ourCreatures[0];
        }
      }
    }

    if (!targetCard) return false;

    // Apply modifier
    targetCard.modifiers = targetCard.modifiers || [];
    targetCard.modifiers.push({
      sourceId: sourceCard.instanceId,
      type: 'pt_boost',
      value: { power: powerMod, toughness: toughnessMod },
      untilEndOfTurn: true
    });

    targetCard.power = (targetCard.basePower || 0) + powerMod;
    targetCard.toughness = (targetCard.baseToughness || 0) + toughnessMod;

    // Recalculate with all modifiers
    let totalPowerMod = 0;
    let totalToughnessMod = 0;
    for (const mod of targetCard.modifiers) {
      if (mod.type === 'pt_boost' && mod.value) {
        totalPowerMod += mod.value.power || 0;
        totalToughnessMod += mod.value.toughness || 0;
      }
    }
    targetCard.power = (targetCard.basePower || 0) + totalPowerMod;
    targetCard.toughness = (targetCard.baseToughness || 0) + totalToughnessMod;

    console.log(`[OracleEffectResolver] ${sourceCard.name} gives ${targetCard.name} ${powerMod >= 0 ? '+' : ''}${powerMod}/${toughnessMod >= 0 ? '+' : ''}${toughnessMod}`);
    GameLogger.logPump(state, sourceCard, targetCard, powerMod, toughnessMod);
    return true;
  }

  // ============================================
  // DRAW EFFECTS
  // ============================================

  static resolveDrawEffect(
    state: StrictGameState,
    oracleText: string,
    controllerId: string,
    sourceCard: CardObject
  ): boolean {
    // Match patterns like "draw a card", "draw two cards", "draw X cards"
    const drawPatterns = [
      /draw (\d+|a|two|three|four|five|six|seven) cards?/,
      /draws? (\d+|a|two|three|four) cards?/,
      /target player draws (\d+|a|two|three) cards?/
    ];

    let drawCount = 0;

    for (const pattern of drawPatterns) {
      const match = oracleText.match(pattern);
      if (match) {
        const countStr = match[1];
        drawCount = this.parseNumber(countStr);
        break;
      }
    }

    if (drawCount === 0) return false;

    // Determine who draws
    let drawerId = controllerId;
    if (oracleText.includes('target player') || oracleText.includes('target opponent')) {
      // For simplicity, controller draws unless it's "target opponent"
      if (oracleText.includes('target opponent')) {
        const oppId = state.turnOrder.find(id => id !== controllerId);
        if (oppId) drawerId = oppId;
      }
    }

    for (let i = 0; i < drawCount; i++) {
      ActionHandler.drawCard(state, drawerId);
    }

    console.log(`[OracleEffectResolver] ${sourceCard.name} causes ${state.players[drawerId]?.name} to draw ${drawCount} card(s)`);
    GameLogger.logDraw(state, sourceCard, state.players[drawerId]?.name || 'Unknown', drawCount);
    return true;
  }

  // ============================================
  // DISCARD EFFECTS
  // ============================================

  static resolveDiscardEffect(
    state: StrictGameState,
    oracleText: string,
    controllerId: string,
    targets: string[],
    _sourceCard: CardObject
  ): boolean {
    const discardPatterns = [
      /discards? (\d+|a|two|three) cards?/,
      /target (player|opponent) discards (\d+|a|two) cards?/,
      /each (player|opponent) discards (\d+|a|two) cards?/
    ];

    let discardCount = 0;

    for (const pattern of discardPatterns) {
      const match = oracleText.match(pattern);
      if (match) {
        if (match[2]) {
          discardCount = this.parseNumber(match[2]);
        } else {
          discardCount = this.parseNumber(match[1]);
        }
        break;
      }
    }

    if (discardCount === 0) return false;

    // Determine who discards
    const playersToDiscard: string[] = [];

    if (oracleText.includes('each opponent')) {
      Object.keys(state.players).forEach(id => {
        if (id !== controllerId) playersToDiscard.push(id);
      });
    } else if (oracleText.includes('each player')) {
      Object.keys(state.players).forEach(id => playersToDiscard.push(id));
    } else if (oracleText.includes('target opponent') || oracleText.includes('target player')) {
      if (targets.length > 0 && state.players[targets[0]]) {
        playersToDiscard.push(targets[0]);
      } else {
        const oppId = state.turnOrder.find(id => id !== controllerId);
        if (oppId) playersToDiscard.push(oppId);
      }
    }

    if (playersToDiscard.length === 0) return false;

    for (const playerId of playersToDiscard) {
      const hand = Object.values(state.cards).filter(c =>
        c.ownerId === playerId && c.zone === 'hand'
      );

      // Discard randomly (bot-friendly)
      for (let i = 0; i < discardCount && hand.length > 0; i++) {
        const randomIndex = Math.floor(Math.random() * hand.length);
        const cardToDiscard = hand.splice(randomIndex, 1)[0];
        ActionHandler.moveCardToZone(state, cardToDiscard.instanceId, 'graveyard');
        console.log(`[OracleEffectResolver] ${state.players[playerId]?.name} discards ${cardToDiscard.name}`);
      }
    }

    return true;
  }

  // ============================================
  // LIFE GAIN/LOSS EFFECTS
  // ============================================

  static resolveLifeEffect(
    state: StrictGameState,
    oracleText: string,
    controllerId: string,
    targets: string[],
    sourceCard: CardObject
  ): boolean {
    let effectResolved = false;

    // Life gain
    const gainPatterns = [
      /gain (\d+|life equal to)/,
      /gains? (\d+) life/,
      /you gain (\d+) life/
    ];

    for (const pattern of gainPatterns) {
      const match = oracleText.match(pattern);
      if (match && match[1] !== 'life equal to') {
        const amount = parseInt(match[1]);
        if (!isNaN(amount)) {
          const player = state.players[controllerId];
          if (player) {
            player.life += amount;
            console.log(`[OracleEffectResolver] ${sourceCard.name} causes ${player.name} to gain ${amount} life (now at ${player.life})`);
            GameLogger.logLifeGain(state, sourceCard, player.name, amount);
            effectResolved = true;
          }
        }
        break;
      }
    }

    // Life loss
    const lossPatterns = [
      /loses? (\d+) life/,
      /target (player|opponent) loses (\d+) life/,
      /each opponent loses (\d+) life/
    ];

    for (const pattern of lossPatterns) {
      const match = oracleText.match(pattern);
      if (match) {
        let amount = 0;

        if (match[2]) {
          amount = parseInt(match[2]);
        } else {
          amount = parseInt(match[1]);
        }

        if (!isNaN(amount)) {
          if (oracleText.includes('each opponent')) {
            Object.keys(state.players).forEach(id => {
              if (id !== controllerId) {
                state.players[id].life -= amount;
                console.log(`[OracleEffectResolver] ${state.players[id].name} loses ${amount} life`);
              }
            });
            effectResolved = true;
          } else if (targets.length > 0 && state.players[targets[0]]) {
            state.players[targets[0]].life -= amount;
            console.log(`[OracleEffectResolver] ${state.players[targets[0]].name} loses ${amount} life`);
            effectResolved = true;
          }
        }
        break;
      }
    }

    return effectResolved;
  }

  // ============================================
  // MILL EFFECTS
  // ============================================

  static resolveMillEffect(
    state: StrictGameState,
    oracleText: string,
    controllerId: string,
    targets: string[],
    sourceCard: CardObject
  ): boolean {
    const millPatterns = [
      /mills? (\d+|two|three|four|five) cards?/,
      /put the top (\d+|two|three) cards? .* into .* graveyard/,
      /target (player|opponent) mills (\d+) cards?/
    ];

    let millCount = 0;

    for (const pattern of millPatterns) {
      const match = oracleText.match(pattern);
      if (match) {
        const countStr = match[2] || match[1];
        millCount = this.parseNumber(countStr);
        break;
      }
    }

    if (millCount === 0) return false;

    // Determine who mills
    let targetId = controllerId;
    if (oracleText.includes('target opponent') || oracleText.includes('target player')) {
      if (targets.length > 0 && state.players[targets[0]]) {
        targetId = targets[0];
      } else {
        const oppId = state.turnOrder.find(id => id !== controllerId);
        if (oppId) targetId = oppId;
      }
    }

    // Get library and mill cards
    const library = Object.values(state.cards)
      .filter(c => c.ownerId === targetId && c.zone === 'library')
      .sort((a, b) => (b.position?.z || 0) - (a.position?.z || 0));

    const toMill = library.slice(0, millCount);
    toMill.forEach(card => {
      ActionHandler.moveCardToZone(state, card.instanceId, 'graveyard');
    });

    console.log(`[OracleEffectResolver] ${sourceCard.name} mills ${toMill.length} cards from ${state.players[targetId]?.name}`);
    return toMill.length > 0;
  }

  // ============================================
  // TAP/UNTAP EFFECTS
  // ============================================

  static resolveTapUntapEffect(
    state: StrictGameState,
    oracleText: string,
    _controllerId: string,
    targets: string[],
    sourceCard: CardObject
  ): boolean {
    let effectResolved = false;

    // Tap effects
    if (oracleText.includes('tap target') || oracleText.includes('taps target')) {
      if (targets.length > 0) {
        const targetCard = state.cards[targets[0]];
        if (targetCard && targetCard.zone === 'battlefield' && !targetCard.tapped) {
          targetCard.tapped = true;
          console.log(`[OracleEffectResolver] ${sourceCard.name} taps ${targetCard.name}`);
          GameLogger.logTap(state, sourceCard, targetCard);
          effectResolved = true;
        }
      }
    }

    // Tap all
    if (oracleText.includes('tap all creatures') || oracleText.includes('tap all permanents')) {
      Object.values(state.cards).forEach(card => {
        if (card.zone === 'battlefield' && !card.tapped) {
          if (oracleText.includes('creatures') &&
              (card.types?.includes('Creature') || card.typeLine?.includes('Creature'))) {
            card.tapped = true;
            effectResolved = true;
          }
        }
      });
    }

    // Untap effects
    if (oracleText.includes('untap target') || oracleText.includes('untaps target')) {
      if (targets.length > 0) {
        const targetCard = state.cards[targets[0]];
        if (targetCard && targetCard.zone === 'battlefield' && targetCard.tapped) {
          targetCard.tapped = false;
          console.log(`[OracleEffectResolver] ${sourceCard.name} untaps ${targetCard.name}`);
          effectResolved = true;
        }
      }
    }

    // "Doesn't untap" effect (set a modifier)
    if (oracleText.includes("doesn't untap") || oracleText.includes("does not untap")) {
      if (targets.length > 0) {
        const targetCard = state.cards[targets[0]];
        if (targetCard) {
          targetCard.modifiers = targetCard.modifiers || [];
          targetCard.modifiers.push({
            sourceId: sourceCard.instanceId,
            type: 'ability_grant',
            value: 'skip_untap',
            untilEndOfTurn: false
          });
          effectResolved = true;
        }
      }
    }

    return effectResolved;
  }

  // ============================================
  // TOKEN CREATION EFFECTS
  // ============================================

  static resolveTokenEffect(
    state: StrictGameState,
    oracleText: string,
    controllerId: string,
    sourceCard: CardObject
  ): boolean {
    // Match patterns like "create a 1/1 white Soldier creature token"
    const tokenPatterns = [
      /create (\d+|a|two|three|four|five) (\d+)\/(\d+) ([^.]+?) (creature )?tokens?/i,
      /creates? (\d+|a|an|two|three) (\d+)\/(\d+) ([^.]+?) tokens?/i,
      /put (\d+|a|two|three) (\d+)\/(\d+) ([^.]+?) creature tokens?/i
    ];

    for (const pattern of tokenPatterns) {
      const match = oracleText.match(pattern);
      if (match) {
        const count = this.parseNumber(match[1]);
        const power = parseInt(match[2]);
        const toughness = parseInt(match[3]);
        const description = match[4].trim();

        // Parse colors and creature type from description
        const colors: string[] = [];
        const colorWords = ['white', 'blue', 'black', 'red', 'green', 'colorless'];
        const colorMap: Record<string, string> = {
          'white': 'W', 'blue': 'U', 'black': 'B', 'red': 'R', 'green': 'G', 'colorless': 'C'
        };

        let creatureType = description;
        for (const colorWord of colorWords) {
          if (description.toLowerCase().includes(colorWord)) {
            colors.push(colorMap[colorWord]);
            creatureType = creatureType.replace(new RegExp(colorWord, 'i'), '').trim();
          }
        }

        // Clean up creature type
        creatureType = creatureType.replace(/creature/i, '').trim();
        // Filter out connector words like "and", "with" and capitalize each subtype
        const connectorWords = ['and', 'with', 'that', 'has', 'have', 'the', 'a', 'an'];
        const subtypes = creatureType.split(/\s+/)
          .filter(s => s.length > 0 && !connectorWords.includes(s.toLowerCase()))
          .map(s => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase());

        // Parse keywords from description
        const keywords: string[] = [];
        const keywordList = ['flying', 'haste', 'trample', 'lifelink', 'vigilance', 'deathtouch', 'first strike', 'double strike', 'menace', 'reach'];
        for (const kw of keywordList) {
          if (description.toLowerCase().includes(kw) || oracleText.includes(kw)) {
            keywords.push(kw.charAt(0).toUpperCase() + kw.slice(1));
          }
        }

        // Token name should be the last subtype, properly capitalized
        const tokenName = subtypes[subtypes.length - 1] || 'Token';

        // Try to find a real Scryfall token from cached tokens
        console.log(`[OracleEffectResolver] Looking for token: "${tokenName}" (${power}/${toughness}) from ${state.cachedTokens?.length || 0} cached tokens`);

        const realToken = this.findRealToken(state, {
          name: tokenName,
          power: power.toString(),
          toughness: toughness.toString(),
          subtypes,
          colors,
          isCreature: true
        }, sourceCard);

        for (let i = 0; i < count; i++) {
          if (realToken) {
            // Use real Scryfall token data
            console.log(`[OracleEffectResolver] Using real Scryfall token: ${realToken.name}`);
            ActionHandler.createToken(state, controllerId, realToken);
          } else {
            // Fallback to generic token creation with properly capitalized name
            // Include default placeholder image path
            console.log(`[OracleEffectResolver] No matching token found, creating generic: ${tokenName}`);
            ActionHandler.createToken(state, controllerId, {
              name: tokenName,
              types: ['Creature'],
              subtypes: subtypes,
              power: power.toString(),
              toughness: toughness.toString(),
              colors: colors,
              keywords: keywords,
              // Use a default token placeholder image
              imageUrl: '/images/token.jpg',
              type_line: `Token Creature — ${subtypes.join(' ')}`
            });
          }
        }

        const tokenSource = realToken ? '(Scryfall)' : '(generated)';
        console.log(`[OracleEffectResolver] ${sourceCard.name} creates ${count} ${power}/${toughness} ${subtypes.join(' ')} token(s) ${tokenSource}`);
        return true;
      }
    }

    // Handle treasure tokens
    if (oracleText.includes('create a treasure token') || oracleText.includes('create treasure token')) {
      const countMatch = oracleText.match(/create (\d+|a|two|three) treasure/);
      const count = countMatch ? this.parseNumber(countMatch[1]) : 1;

      // Try to find real Treasure token from cache
      const realTreasure = this.findRealToken(state, { name: 'Treasure', isArtifact: true }, sourceCard);

      for (let i = 0; i < count; i++) {
        if (realTreasure) {
          ActionHandler.createToken(state, controllerId, realTreasure);
        } else {
          ActionHandler.createToken(state, controllerId, {
            name: 'Treasure',
            types: ['Artifact'],
            subtypes: ['Treasure'],
            oracle_text: '{T}, Sacrifice this artifact: Add one mana of any color.'
          });
        }
      }
      const tokenSource = realTreasure ? '(Scryfall)' : '(generated)';
      console.log(`[OracleEffectResolver] ${sourceCard.name} creates ${count} Treasure token(s) ${tokenSource}`);
      return true;
    }

    // Handle food tokens
    if (oracleText.includes('create a food token') || oracleText.includes('create food token')) {
      const countMatch = oracleText.match(/create (\d+|a|two|three) food/);
      const count = countMatch ? this.parseNumber(countMatch[1]) : 1;

      const realFood = this.findRealToken(state, { name: 'Food', isArtifact: true }, sourceCard);

      for (let i = 0; i < count; i++) {
        if (realFood) {
          ActionHandler.createToken(state, controllerId, realFood);
        } else {
          ActionHandler.createToken(state, controllerId, {
            name: 'Food',
            types: ['Artifact'],
            subtypes: ['Food'],
            oracle_text: '{2}, {T}, Sacrifice this artifact: You gain 3 life.'
          });
        }
      }
      const tokenSource = realFood ? '(Scryfall)' : '(generated)';
      console.log(`[OracleEffectResolver] ${sourceCard.name} creates ${count} Food token(s) ${tokenSource}`);
      return true;
    }

    // Handle clue tokens
    if (oracleText.includes('create a clue token') || oracleText.includes('create clue token') || oracleText.includes('investigate')) {
      const countMatch = oracleText.match(/create (\d+|a|two|three) clue/);
      const count = countMatch ? this.parseNumber(countMatch[1]) : 1;

      const realClue = this.findRealToken(state, { name: 'Clue', isArtifact: true }, sourceCard);

      for (let i = 0; i < count; i++) {
        if (realClue) {
          ActionHandler.createToken(state, controllerId, realClue);
        } else {
          ActionHandler.createToken(state, controllerId, {
            name: 'Clue',
            types: ['Artifact'],
            subtypes: ['Clue'],
            oracle_text: '{2}, Sacrifice this artifact: Draw a card.'
          });
        }
      }
      const tokenSource = realClue ? '(Scryfall)' : '(generated)';
      console.log(`[OracleEffectResolver] ${sourceCard.name} creates ${count} Clue token(s) ${tokenSource}`);
      return true;
    }

    // Handle blood tokens
    if (oracleText.includes('create a blood token') || oracleText.includes('create blood token')) {
      const countMatch = oracleText.match(/create (\d+|a|two|three) blood/);
      const count = countMatch ? this.parseNumber(countMatch[1]) : 1;

      const realBlood = this.findRealToken(state, { name: 'Blood', isArtifact: true }, sourceCard);

      for (let i = 0; i < count; i++) {
        if (realBlood) {
          ActionHandler.createToken(state, controllerId, realBlood);
        } else {
          ActionHandler.createToken(state, controllerId, {
            name: 'Blood',
            types: ['Artifact'],
            subtypes: ['Blood'],
            oracle_text: '{1}, {T}, Discard a card, Sacrifice this artifact: Draw a card.'
          });
        }
      }
      const tokenSource = realBlood ? '(Scryfall)' : '(generated)';
      console.log(`[OracleEffectResolver] ${sourceCard.name} creates ${count} Blood token(s) ${tokenSource}`);
      return true;
    }

    return false;
  }

  /**
   * Helper to find a real Scryfall token from cached tokens in game state.
   * Also accepts sourceCard to try fetching tokens from the card's set if game cache is empty.
   * If game has no cached tokens, loads them synchronously from filesystem/Redis cache.
   */
  private static findRealToken(
    state: StrictGameState,
    criteria: {
      name?: string;
      power?: string;
      toughness?: string;
      subtypes?: string[];
      colors?: string[];
      isCreature?: boolean;
      isArtifact?: boolean;
    },
    sourceCard?: CardObject
  ): any | null {
    let tokensToSearch = state.cachedTokens || [];

    if (tokensToSearch.length === 0) {
      console.log(`[OracleEffectResolver] No cached tokens available for game ${state.id} (setCode: ${state.setCode || 'unknown'})`);

      // Try to get set code from source card or game state
      const cardSetCode = sourceCard?.setCode || sourceCard?.definition?.set || state.setCode;
      if (cardSetCode && cardSetCode !== 'unknown') {
        console.log(`[OracleEffectResolver] Loading tokens from cache for set: ${cardSetCode}`);

        // Load tokens synchronously from filesystem cache (which mirrors Redis)
        const loadedTokens = this.loadTokensFromCache(cardSetCode);
        if (loadedTokens && loadedTokens.length > 0) {
          // Cache in game state for subsequent calls
          state.cachedTokens = loadedTokens;
          state.setCode = cardSetCode;
          tokensToSearch = loadedTokens;
          console.log(`[OracleEffectResolver] Loaded ${loadedTokens.length} tokens from cache for set ${cardSetCode}`);
        }
      }

      if (tokensToSearch.length === 0) {
        return null;
      }
    }

    console.log(`[OracleEffectResolver] Searching ${tokensToSearch.length} cached tokens for: name="${criteria.name}", P/T=${criteria.power}/${criteria.toughness}`);

    // First try exact match by name
    if (criteria.name) {
      const exactMatch = tokensToSearch.find((t: any) => {
        const tokenName = (t.name || t.card_faces?.[0]?.name || '').toLowerCase();
        return tokenName === criteria.name!.toLowerCase();
      });

      if (exactMatch) {
        console.log(`[OracleEffectResolver] Found exact name match: ${exactMatch.name} (id: ${exactMatch.id})`);
        // Verify it has image data
        const hasImage = exactMatch.local_path_full || exactMatch.image_uris?.normal || exactMatch.card_faces?.[0]?.image_uris?.normal;
        if (hasImage) {
          return exactMatch;
        } else {
          console.log(`[OracleEffectResolver] Warning: Token found but has no image data`);
        }
      }
    }

    // Fall back to score-based matching
    const result = scryfallService.findMatchingToken(tokensToSearch, criteria);

    if (!result) {
      // Log available token names for debugging
      const tokenNames = tokensToSearch.slice(0, 15).map((t: any) => t.name || 'unknown').join(', ');
      console.log(`[OracleEffectResolver] No match found. Available tokens (first 15): ${tokenNames}`);
    } else {
      console.log(`[OracleEffectResolver] Found matching token: ${result.name} (id: ${result.id})`);
    }

    return result;
  }

  // ============================================
  // COUNTER PLACEMENT EFFECTS
  // ============================================

  static resolveCounterPlacementEffect(
    state: StrictGameState,
    oracleText: string,
    controllerId: string,
    targets: string[],
    sourceCard: CardObject
  ): boolean {
    // Match "+1/+1 counter" patterns
    const counterPatterns = [
      /put (\d+|a|two|three|four) \+1\/\+1 counters? on (target|it|each|all)/,
      /(\d+|a|two|three) \+1\/\+1 counters? on (target|it|that)/,
      /put (\d+|a) -1\/-1 counters? on (target|it|each)/
    ];

    for (const pattern of counterPatterns) {
      const match = oracleText.match(pattern);
      if (match) {
        const count = this.parseNumber(match[1]);
        const counterType = oracleText.includes('-1/-1') ? '-1/-1' : '+1/+1';
        const targetType = match[2];

        // Handle "each creature you control"
        if (targetType === 'each' || targetType === 'all') {
          const creatures = Object.values(state.cards).filter(c =>
            c.zone === 'battlefield' &&
            c.controllerId === controllerId &&
            (c.types?.includes('Creature') || c.typeLine?.includes('Creature'))
          );

          creatures.forEach(creature => {
            ActionHandler.addCounter(state, controllerId, creature.instanceId, counterType, count);
          });
          return creatures.length > 0;
        }

        // Handle targeted counters
        if (targets.length > 0) {
          const targetCard = state.cards[targets[0]];
          if (targetCard && targetCard.zone === 'battlefield') {
            ActionHandler.addCounter(state, controllerId, targetCard.instanceId, counterType, count);
            console.log(`[OracleEffectResolver] ${sourceCard.name} puts ${count} ${counterType} counter(s) on ${targetCard.name}`);
            return true;
          }
        }
      }
    }

    return false;
  }

  // ============================================
  // FIGHT EFFECTS
  // ============================================

  static resolveFightEffect(
    state: StrictGameState,
    oracleText: string,
    controllerId: string,
    targets: string[],
    _sourceCard: CardObject
  ): boolean {
    if (!oracleText.includes('fight') && !oracleText.includes('fights')) return false;

    // Need two creatures for fight
    if (targets.length < 2) {
      // Try to get our creature and opponent's creature
      const ourCreatures = Object.values(state.cards).filter(c =>
        c.controllerId === controllerId &&
        c.zone === 'battlefield' &&
        (c.types?.includes('Creature') || c.typeLine?.includes('Creature'))
      );
      const oppCreatures = Object.values(state.cards).filter(c =>
        c.controllerId !== controllerId &&
        c.zone === 'battlefield' &&
        (c.types?.includes('Creature') || c.typeLine?.includes('Creature'))
      );

      if (ourCreatures.length > 0 && oppCreatures.length > 0) {
        const our = ourCreatures[0];
        const opp = oppCreatures[0];

        // They deal damage equal to their power to each other
        this.dealDamageToCreature(state, opp, our.power || 0, our);
        this.dealDamageToCreature(state, our, opp.power || 0, opp);

        console.log(`[OracleEffectResolver] ${our.name} fights ${opp.name}`);
        return true;
      }
    }

    return false;
  }

  // ============================================
  // AURA EFFECTS
  // ============================================

  /**
   * Resolves aura-specific effects including ETB triggers and continuous effects
   */
  static resolveAuraEffects(
    state: StrictGameState,
    oracleText: string,
    _controllerId: string,
    card: CardObject
  ): boolean {
    // Only process if this is an aura
    const typeLine = (card.typeLine || card.definition?.type_line || '').toLowerCase();
    if (!typeLine.includes('aura')) return false;

    // Get the enchanted creature/permanent
    const attachedToId = card.attachedTo;
    if (!attachedToId) return false;

    const enchantedCard = state.cards[attachedToId];
    if (!enchantedCard || enchantedCard.zone !== 'battlefield') return false;

    let effectResolved = false;

    console.log(`[OracleEffectResolver] Resolving aura effects for "${card.name}" attached to "${enchantedCard.name}"`);

    // Initialize modifiers array if needed
    if (!enchantedCard.modifiers) {
      enchantedCard.modifiers = [];
    }

    // ETB: "When this Aura enters, tap enchanted creature"
    if (oracleText.includes('when this aura enters') && oracleText.includes('tap enchanted creature')) {
      if (!enchantedCard.tapped) {
        enchantedCard.tapped = true;
        console.log(`[OracleEffectResolver] ${card.name} tapped ${enchantedCard.name} on ETB`);
        GameLogger.logTap(state, card, enchantedCard);
        effectResolved = true;
      }
    }

    // ETB: "tap target creature" or "tap enchanted creature" (general)
    if (oracleText.includes('enters the battlefield') || oracleText.includes('enters,')) {
      if (oracleText.includes('tap') && (oracleText.includes('enchanted') || oracleText.includes('that creature'))) {
        if (!enchantedCard.tapped) {
          enchantedCard.tapped = true;
          console.log(`[OracleEffectResolver] ${card.name} tapped ${enchantedCard.name} on ETB`);
          GameLogger.logTap(state, card, enchantedCard);
          effectResolved = true;
        }
      }
    }

    // Continuous: "Enchanted creature can't untap" or "doesn't untap"
    if (oracleText.includes("can't untap") || oracleText.includes("can't become untapped") ||
        oracleText.includes("doesn't untap") || oracleText.includes("does not untap")) {
      // Add a modifier to prevent untapping
      const existingMod = enchantedCard.modifiers.find(m =>
        m.sourceId === card.instanceId && m.type === 'ability_grant' && m.value === 'cant_untap'
      );
      if (!existingMod) {
        enchantedCard.modifiers.push({
          sourceId: card.instanceId,
          type: 'ability_grant',
          value: 'cant_untap',
          untilEndOfTurn: false
        });
        console.log(`[OracleEffectResolver] ${card.name} prevents ${enchantedCard.name} from untapping`);
        effectResolved = true;
      }
    }

    // Continuous: "Enchanted creature can't attack"
    if (oracleText.includes("can't attack")) {
      const existingMod = enchantedCard.modifiers.find(m =>
        m.sourceId === card.instanceId && m.type === 'ability_grant' && m.value === 'cant_attack'
      );
      if (!existingMod) {
        enchantedCard.modifiers.push({
          sourceId: card.instanceId,
          type: 'ability_grant',
          value: 'cant_attack',
          untilEndOfTurn: false
        });
        console.log(`[OracleEffectResolver] ${card.name} prevents ${enchantedCard.name} from attacking`);
        effectResolved = true;
      }
    }

    // Continuous: "Enchanted creature can't block"
    if (oracleText.includes("can't block")) {
      const existingMod = enchantedCard.modifiers.find(m =>
        m.sourceId === card.instanceId && m.type === 'ability_grant' && m.value === 'cant_block'
      );
      if (!existingMod) {
        enchantedCard.modifiers.push({
          sourceId: card.instanceId,
          type: 'ability_grant',
          value: 'cant_block',
          untilEndOfTurn: false
        });
        console.log(`[OracleEffectResolver] ${card.name} prevents ${enchantedCard.name} from blocking`);
        effectResolved = true;
      }
    }

    // Continuous: "Enchanted creature can't attack or block"
    if (oracleText.includes("can't attack or block")) {
      const existingAttackMod = enchantedCard.modifiers.find(m =>
        m.sourceId === card.instanceId && m.type === 'ability_grant' && m.value === 'cant_attack'
      );
      const existingBlockMod = enchantedCard.modifiers.find(m =>
        m.sourceId === card.instanceId && m.type === 'ability_grant' && m.value === 'cant_block'
      );
      if (!existingAttackMod) {
        enchantedCard.modifiers.push({
          sourceId: card.instanceId,
          type: 'ability_grant',
          value: 'cant_attack',
          untilEndOfTurn: false
        });
        effectResolved = true;
      }
      if (!existingBlockMod) {
        enchantedCard.modifiers.push({
          sourceId: card.instanceId,
          type: 'ability_grant',
          value: 'cant_block',
          untilEndOfTurn: false
        });
        effectResolved = true;
      }
      if (effectResolved) {
        console.log(`[OracleEffectResolver] ${card.name} prevents ${enchantedCard.name} from attacking or blocking`);
      }
    }

    // Continuous: "can't have counters put on it"
    if (oracleText.includes("can't have counters")) {
      const existingMod = enchantedCard.modifiers.find(m =>
        m.sourceId === card.instanceId && m.type === 'ability_grant' && m.value === 'cant_have_counters'
      );
      if (!existingMod) {
        enchantedCard.modifiers.push({
          sourceId: card.instanceId,
          type: 'ability_grant',
          value: 'cant_have_counters',
          untilEndOfTurn: false
        });
        console.log(`[OracleEffectResolver] ${card.name} prevents counters on ${enchantedCard.name}`);
        effectResolved = true;
      }
    }

    // Continuous: Grant abilities (flying, lifelink, etc.)
    const abilityKeywords = ['flying', 'first strike', 'double strike', 'deathtouch', 'lifelink',
                            'vigilance', 'trample', 'menace', 'reach', 'hexproof', 'indestructible'];
    for (const keyword of abilityKeywords) {
      if (oracleText.includes(`enchanted creature has ${keyword}`) ||
          oracleText.includes(`enchanted creature gains ${keyword}`)) {
        const capitalizedKeyword = keyword.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        if (!enchantedCard.keywords) {
          enchantedCard.keywords = [];
        }
        if (!enchantedCard.keywords.includes(capitalizedKeyword)) {
          enchantedCard.keywords.push(capitalizedKeyword);
          // Also add as modifier for tracking
          enchantedCard.modifiers.push({
            sourceId: card.instanceId,
            type: 'ability_grant',
            value: capitalizedKeyword,
            untilEndOfTurn: false
          });
          console.log(`[OracleEffectResolver] ${card.name} grants ${capitalizedKeyword} to ${enchantedCard.name}`);
          effectResolved = true;
        }
      }
    }

    // Continuous: Power/Toughness modifications for auras
    const pumpMatch = oracleText.match(/enchanted creature gets? ([+-]\d+)\/([+-]\d+)/);
    if (pumpMatch) {
      const powerMod = parseInt(pumpMatch[1]);
      const toughnessMod = parseInt(pumpMatch[2]);

      // Check if we already applied this modifier
      const existingPTMod = enchantedCard.modifiers.find(m =>
        m.sourceId === card.instanceId && m.type === 'pt_boost'
      );

      if (!existingPTMod) {
        enchantedCard.modifiers.push({
          sourceId: card.instanceId,
          type: 'pt_boost',
          value: { power: powerMod, toughness: toughnessMod },
          untilEndOfTurn: false
        });

        // Recalculate power/toughness
        let totalPowerMod = 0;
        let totalToughnessMod = 0;
        for (const mod of enchantedCard.modifiers) {
          if (mod.type === 'pt_boost' && mod.value) {
            totalPowerMod += mod.value.power || 0;
            totalToughnessMod += mod.value.toughness || 0;
          }
        }
        enchantedCard.power = (enchantedCard.basePower || 0) + totalPowerMod;
        enchantedCard.toughness = (enchantedCard.baseToughness || 0) + totalToughnessMod;

        console.log(`[OracleEffectResolver] ${card.name} gives ${enchantedCard.name} ${powerMod >= 0 ? '+' : ''}${powerMod}/${toughnessMod >= 0 ? '+' : ''}${toughnessMod}`);
        effectResolved = true;
      }
    }

    return effectResolved;
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  static parseNumber(str: string): number {
    const numMap: Record<string, number> = {
      'a': 1, 'an': 1, 'one': 1, 'two': 2, 'three': 3, 'four': 4,
      'five': 5, 'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10
    };
    const lower = str.toLowerCase();
    if (numMap[lower] !== undefined) return numMap[lower];
    const parsed = parseInt(str);
    return isNaN(parsed) ? 1 : parsed;
  }

  static matchesTargetType(card: CardObject, targetType: string): boolean {
    const types = card.types || [];
    const typeLine = card.typeLine || '';

    switch (targetType.toLowerCase()) {
      case 'creature':
        return types.includes('Creature') || typeLine.includes('Creature');
      case 'permanent':
        return card.zone === 'battlefield';
      case 'artifact':
        return types.includes('Artifact') || typeLine.includes('Artifact');
      case 'enchantment':
        return types.includes('Enchantment') || typeLine.includes('Enchantment');
      case 'planeswalker':
        return types.includes('Planeswalker') || typeLine.includes('Planeswalker');
      default:
        return true;
    }
  }

  /**
   * Load tokens from filesystem cache (which mirrors Redis).
   * Tokens are stored in sets/t{setCode}.json files.
   */
  private static loadTokensFromCache(setCode: string): any[] {
    const tokenSetCode = `t${setCode}`.toLowerCase();
    const tokensCachePath = path.join(SETS_DIR, `${tokenSetCode}.json`);

    try {
      if (fs.existsSync(tokensCachePath)) {
        const content = fs.readFileSync(tokensCachePath, 'utf-8');
        const tokens = JSON.parse(content);

        // Normalize tokens to ensure they have local paths
        return tokens.map((token: any) => {
          if (token.set && token.id) {
            if (!token.local_path_full) {
              token.local_path_full = `/cards/images/${token.set}/full/${token.id}.jpg`;
            }
            if (!token.local_path_crop) {
              token.local_path_crop = `/cards/images/${token.set}/crop/${token.id}.jpg`;
            }
          }
          return token;
        });
      }
    } catch (e) {
      console.warn(`[OracleEffectResolver] Failed to load tokens from cache for ${tokenSetCode}:`, e);
    }

    return [];
  }

  // ============================================
  // CHOICE SYSTEM METHODS
  // ============================================

  /**
   * Checks if the effect requires choosing from opponent's hand.
   * Examples: "target opponent reveals their hand. You choose a nonland card from it."
   */
  static requiresOpponentHandChoice(oracleText: string, stackItem: StackObject): boolean {
    // Skip if we already have a choice made for this
    if (stackItem.resolutionState?.choicesMade?.length) return false;

    return /target opponent reveals (their|his or her) hand.*you choose/i.test(oracleText) ||
           /look at target (opponent's|player's) hand.*choose/i.test(oracleText) ||
           /target player reveals (their|his or her) hand.*you choose/i.test(oracleText);
  }

  /**
   * Checks if the spell is modal ("Choose one", "Choose two", etc.)
   */
  static requiresModeChoice(oracleText: string, stackItem: StackObject): boolean {
    // Skip if modes already selected or choice already made
    if (stackItem.modes?.length || stackItem.resolutionState?.choicesMade?.length) return false;

    return /choose (one|two|three|four|five)/i.test(oracleText);
  }

  /**
   * Handles effects that reveal opponent's hand and let caster choose a card.
   * Creates a PendingChoice and pauses resolution.
   */
  static handleHandRevealChoice(
    state: StrictGameState,
    card: CardObject,
    stackItem: StackObject,
    oracleText: string
  ): boolean {
    const controllerId = stackItem.controllerId;

    // Determine target player (opponent whose hand is revealed)
    let targetPlayerId: string | undefined = stackItem.targets?.[0];

    // If the target is a card (not a player), find the opponent
    if (!targetPlayerId || state.cards[targetPlayerId]) {
      targetPlayerId = state.turnOrder.find(id => id !== controllerId);
    }

    if (!targetPlayerId || !state.players[targetPlayerId]) {
      console.log(`[OracleEffectResolver] No valid target player for hand reveal effect`);
      return true; // Effect fizzles
    }

    // Get opponent's hand
    const opponentHand = Object.values(state.cards).filter(c =>
      c.ownerId === targetPlayerId && c.zone === 'hand'
    );

    if (opponentHand.length === 0) {
      console.log(`[OracleEffectResolver] ${state.players[targetPlayerId].name} has no cards in hand`);
      return true; // Effect resolves but does nothing
    }

    // Parse filter from oracle text (nonland, creature, instant/sorcery, etc.)
    let selectableCards = opponentHand;
    if (oracleText.includes('nonland permanent card') || oracleText.includes('nonland card')) {
      selectableCards = opponentHand.filter(c =>
        !c.types?.includes('Land') && !c.typeLine?.toLowerCase().includes('land')
      );
    } else if (oracleText.includes('creature card')) {
      selectableCards = opponentHand.filter(c =>
        c.types?.includes('Creature') || c.typeLine?.toLowerCase().includes('creature')
      );
    } else if (oracleText.includes('instant or sorcery')) {
      selectableCards = opponentHand.filter(c =>
        c.types?.includes('Instant') || c.types?.includes('Sorcery') ||
        c.typeLine?.toLowerCase().includes('instant') || c.typeLine?.toLowerCase().includes('sorcery')
      );
    }

    if (selectableCards.length === 0) {
      console.log(`[OracleEffectResolver] No valid cards to choose from ${state.players[targetPlayerId].name}'s hand`);
      return true; // Effect resolves but does nothing
    }

    // Create the pending choice
    ChoiceHandler.createChoice(state, stackItem, {
      type: 'card_selection',
      sourceStackId: stackItem.id,
      sourceCardId: card.instanceId,
      sourceCardName: card.name,
      choosingPlayerId: controllerId,
      controllingPlayerId: controllerId,
      constraints: { exactCount: 1 },
      selectableIds: selectableCards.map(c => c.instanceId),
      revealedCards: opponentHand.map(c => c.instanceId),
      prompt: `Choose a card from ${state.players[targetPlayerId].name}'s hand:`
    });

    // Reveal the hand to the choosing player
    state.revealedToPlayer = {
      playerId: controllerId,
      cardIds: opponentHand.map(c => c.instanceId)
    };

    console.log(`[OracleEffectResolver] Created hand reveal choice for ${card.name}, revealing ${opponentHand.length} cards`);
    return false; // Pause resolution, waiting for choice
  }

  /**
   * Handles modal spells ("Choose one", "Choose two", etc.)
   * Creates a PendingChoice with the available modes.
   */
  static handleModeChoice(
    state: StrictGameState,
    card: CardObject,
    stackItem: StackObject,
    oracleText: string
  ): boolean {
    const countMatch = oracleText.match(/choose (one|two|three|four|five)/i);
    const count = countMatch ? this.parseNumber(countMatch[1]) : 1;

    // Parse modes (lines starting with • or -)
    const modeMatches = oracleText.match(/[•\-]\s*([^•\-]+?)(?=\n|$|[•\-])/g);
    if (!modeMatches?.length) {
      console.log(`[OracleEffectResolver] No modes found in oracle text for ${card.name}`);
      return true; // Continue with standard resolution
    }

    const modes = modeMatches.map((m, i) => {
      const label = m.replace(/^[•\-]\s*/, '').trim();
      return {
        id: `mode-${i}`,
        label: label,
        description: label
      };
    });

    // Create the pending choice
    ChoiceHandler.createChoice(state, stackItem, {
      type: 'mode_selection',
      sourceStackId: stackItem.id,
      sourceCardId: card.instanceId,
      sourceCardName: card.name,
      choosingPlayerId: stackItem.controllerId,
      controllingPlayerId: stackItem.controllerId,
      options: modes,
      constraints: { exactCount: count },
      prompt: `Choose ${count === 1 ? 'one' : count === 2 ? 'two' : count.toString()} for ${card.name}:`
    });

    console.log(`[OracleEffectResolver] Created mode choice for ${card.name} with ${modes.length} options`);
    return false; // Pause resolution, waiting for choice
  }

  /**
   * Executes the effect after a choice has been made.
   * Called when resuming resolution with a completed choice.
   */
  static executeChoiceEffect(
    state: StrictGameState,
    card: CardObject,
    stackItem: StackObject,
    choice: ChoiceResult
  ): boolean {
    // Mark choice as executed to prevent re-execution
    choice._executed = true;

    console.log(`[OracleEffectResolver] Executing choice effect for ${card.name}, type: ${choice.type}`);

    if (choice.type === 'card_selection' && choice.selectedCardIds?.length) {
      const oracleText = (card.oracleText || card.definition?.oracle_text || '').toLowerCase();

      // Handle "that player discards that card"
      if (oracleText.includes('discards') || oracleText.includes('discard')) {
        for (const cardId of choice.selectedCardIds) {
          const targetCard = state.cards[cardId];
          if (targetCard?.zone === 'hand') {
            const ownerName = state.players[targetCard.ownerId]?.name || 'Unknown';
            ActionHandler.moveCardToZone(state, cardId, 'graveyard');
            console.log(`[OracleEffectResolver] ${targetCard.name} was discarded by ${card.name}`);
            GameLogger.log(state, `${ownerName} discards ${targetCard.name}`, 'action', card.name, [targetCard]);
          }
        }
        StateBasedEffects.process(state);
        return true;
      }

      // Handle "exile that card"
      if (oracleText.includes('exile')) {
        for (const cardId of choice.selectedCardIds) {
          const targetCard = state.cards[cardId];
          if (targetCard) {
            ActionHandler.moveCardToZone(state, cardId, 'exile');
            console.log(`[OracleEffectResolver] ${targetCard.name} was exiled by ${card.name}`);
            GameLogger.logExile(state, card, targetCard);
          }
        }
        StateBasedEffects.process(state);
        return true;
      }
    }

    if (choice.type === 'mode_selection' && choice.selectedOptionIds?.length) {
      // Store selected modes on the stack item
      stackItem.modes = choice.selectedOptionIds.map(id => parseInt(id.replace('mode-', '')));
      // Continue with mode-based resolution
      return this.resolveSelectedModes(state, card, stackItem);
    }

    // Handle blight target selection (Lorwyn Eclipsed)
    if (choice.type === 'target_selection' && (stackItem as any).blightAmount) {
      return this.processBlightChoiceResult(state, card, stackItem, choice);
    }

    // Default: continue with standard resolution
    return true;
  }

  /**
   * Resolves effects based on selected modes.
   * Only executes the effects corresponding to the selected modes.
   */
  static resolveSelectedModes(
    state: StrictGameState,
    card: CardObject,
    stackItem: StackObject
  ): boolean {
    const oracleText = (card.oracleText || card.definition?.oracle_text || '').toLowerCase();
    const modeMatches = oracleText.match(/[•\-]\s*([^•\-]+?)(?=\n|$|[•\-])/g) || [];
    const selectedModes = stackItem.modes || [];

    let effectResolved = false;

    for (const modeIndex of selectedModes) {
      const modeText = modeMatches[modeIndex]?.replace(/^[•\-]\s*/, '').trim() || '';
      if (!modeText) continue;

      console.log(`[OracleEffectResolver] Executing mode ${modeIndex}: ${modeText.substring(0, 60)}...`);

      // Use existing effect resolvers on mode text
      if (this.resolveDamageEffect(state, modeText, stackItem.controllerId, stackItem.targets, card)) {
        effectResolved = true;
      }
      if (this.resolveDestroyEffect(state, modeText, stackItem.controllerId, stackItem.targets, card)) {
        effectResolved = true;
      }
      if (this.resolveExileEffect(state, modeText, stackItem.controllerId, stackItem.targets, card)) {
        effectResolved = true;
      }
      if (this.resolveBounceEffect(state, modeText, stackItem.controllerId, stackItem.targets, card)) {
        effectResolved = true;
      }
      if (this.resolvePumpEffect(state, modeText, stackItem.controllerId, stackItem.targets, card)) {
        effectResolved = true;
      }
      if (this.resolveDrawEffect(state, modeText, stackItem.controllerId, card)) {
        effectResolved = true;
      }
      if (this.resolveDiscardEffect(state, modeText, stackItem.controllerId, stackItem.targets, card)) {
        effectResolved = true;
      }
      if (this.resolveLifeEffect(state, modeText, stackItem.controllerId, stackItem.targets, card)) {
        effectResolved = true;
      }
      if (this.resolveCounterPlacementEffect(state, modeText, stackItem.controllerId, stackItem.targets, card)) {
        effectResolved = true;
      }
    }

    // Run state-based effects after resolving
    StateBasedEffects.process(state);

    return effectResolved;
  }

  // ============================================
  // BLIGHT MECHANIC (Lorwyn Eclipsed)
  // ============================================

  /**
   * Checks if the effect requires a blight choice.
   * Blight: Put N -1/-1 counters on a creature you control as a cost.
   */
  static requiresBlightChoice(oracleText: string, stackItem: StackObject): boolean {
    // Skip if we already have a choice made for this
    if (stackItem.resolutionState?.choicesMade?.length) return false;

    // Check for "you may blight N" pattern (optional blight)
    if (/you may blight\s+\d+/i.test(oracleText)) return true;

    // Check for ETB with blight pattern
    if (/when .* enters.*blight\s+\d+/i.test(oracleText)) return true;

    return false;
  }

  /**
   * Handles blight choice creation for effects that require blighting.
   */
  static handleBlightChoice(
    state: StrictGameState,
    card: CardObject,
    stackItem: StackObject,
    _oracleText: string
  ): boolean {
    // Check if there are valid blight targets
    if (!LorwynMechanics.canPayBlightCost(state, stackItem.controllerId)) {
      console.log(`[OracleEffectResolver] No valid blight targets for ${card.name}`);
      return true; // Continue without blighting
    }

    // Create the blight choice
    if (LorwynMechanics.handleETBBlightEffect(state, card, stackItem)) {
      return false; // Waiting for choice
    }

    return true; // Continue with standard resolution
  }

  /**
   * Process blight choice result and continue with conditional effects.
   */
  static processBlightChoiceResult(
    state: StrictGameState,
    card: CardObject,
    stackItem: StackObject,
    choice: ChoiceResult
  ): boolean {
    const oracleText = (card.oracleText || card.definition?.oracle_text || '').toLowerCase();
    const blightAmount = (stackItem as any).blightAmount || 0;

    // Check if the player chose to skip blighting
    const skipped = choice.selectedOptionIds?.includes('skip') || false;

    if (skipped || !choice.selectedCardIds?.length) {
      console.log(`[OracleEffectResolver] Blight skipped for ${card.name}`);
      // Don't execute the "if you do" effect, but may continue with other effects
      return true;
    }

    // Apply the blight
    const targetId = choice.selectedCardIds[0];
    LorwynMechanics.applyBlight(state, stackItem.controllerId, targetId, blightAmount);

    // Now execute the "if you do" effect
    // Parse what happens after blighting
    const ifYouDoMatch = oracleText.match(/if you do,?\s+(.+?)(?:\.|$)/i);
    if (ifYouDoMatch) {
      const effectText = ifYouDoMatch[1].toLowerCase();
      console.log(`[OracleEffectResolver] Executing blight "if you do" effect: ${effectText}`);

      // Resolve the conditional effect
      this.resolveDamageEffect(state, effectText, stackItem.controllerId, stackItem.targets, card);
      this.resolveDestroyEffect(state, effectText, stackItem.controllerId, stackItem.targets, card);
      this.resolveDrawEffect(state, effectText, stackItem.controllerId, card);
      this.resolveLifeEffect(state, effectText, stackItem.controllerId, stackItem.targets, card);
      this.resolveTokenEffect(state, effectText, stackItem.controllerId, card);
      this.resolveCounterPlacementEffect(state, effectText, stackItem.controllerId, stackItem.targets, card);
    }

    StateBasedEffects.process(state);
    return true;
  }

  // ============================================
  // VIVID MECHANIC (Lorwyn Eclipsed)
  // ============================================

  /**
   * Get the vivid count (number of colors among permanents) for a player.
   */
  static getVividCount(state: StrictGameState, playerId: string): number {
    return LorwynMechanics.countVividColors(state, playerId);
  }

  /**
   * Resolve vivid-based effects where X equals the vivid count.
   */
  static resolveVividEffect(
    state: StrictGameState,
    oracleText: string,
    controllerId: string,
    targets: string[],
    sourceCard: CardObject
  ): boolean {
    if (!LorwynMechanics.hasVivid(oracleText)) return false;

    const vividCount = this.getVividCount(state, controllerId);
    console.log(`[OracleEffectResolver] Vivid count for ${controllerId}: ${vividCount}`);

    if (vividCount === 0) {
      console.log(`[OracleEffectResolver] Vivid effect has no impact (0 colors)`);
      return false;
    }

    let effectResolved = false;

    // Handle vivid pump effects (+X/+X where X is vivid)
    if (/gets?\s+\+x\/\+x/i.test(oracleText) || /equal to the number of colors/i.test(oracleText)) {
      if (targets.length > 0) {
        const targetCard = state.cards[targets[0]];
        if (targetCard && targetCard.zone === 'battlefield') {
          targetCard.modifiers = targetCard.modifiers || [];
          targetCard.modifiers.push({
            sourceId: sourceCard.instanceId,
            type: 'pt_boost',
            value: { power: vividCount, toughness: vividCount },
            untilEndOfTurn: true
          });

          targetCard.power = (targetCard.basePower || 0) + vividCount;
          targetCard.toughness = (targetCard.baseToughness || 0) + vividCount;

          console.log(`[OracleEffectResolver] Vivid: ${targetCard.name} gets +${vividCount}/+${vividCount}`);
          GameLogger.logPump(state, sourceCard, targetCard, vividCount, vividCount);
          effectResolved = true;
        }
      }
    }

    // Handle vivid damage effects
    if (/deals?\s+x\s+damage/i.test(oracleText) && /vivid|number of colors/i.test(oracleText)) {
      if (targets.length > 0) {
        const targetId = targets[0];
        if (state.players[targetId]) {
          this.dealDamageToPlayer(state, targetId, vividCount, sourceCard);
          effectResolved = true;
        } else {
          const targetCard = state.cards[targetId];
          if (targetCard && targetCard.zone === 'battlefield') {
            this.dealDamageToCreature(state, targetCard, vividCount, sourceCard);
            effectResolved = true;
          }
        }
      }
    }

    // Handle vivid draw/life effects
    if (/draw\s+x\s+cards?/i.test(oracleText) && /vivid|number of colors/i.test(oracleText)) {
      for (let i = 0; i < vividCount; i++) {
        ActionHandler.drawCard(state, controllerId);
      }
      console.log(`[OracleEffectResolver] Vivid: Draw ${vividCount} cards`);
      effectResolved = true;
    }

    if (/gain\s+x\s+life/i.test(oracleText) && /vivid|number of colors/i.test(oracleText)) {
      const player = state.players[controllerId];
      if (player) {
        player.life += vividCount;
        console.log(`[OracleEffectResolver] Vivid: Gain ${vividCount} life`);
        GameLogger.logLifeGain(state, sourceCard, player.name, vividCount);
        effectResolved = true;
      }
    }

    return effectResolved;
  }
}
