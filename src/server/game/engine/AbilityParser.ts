import { StrictGameState, CardObject } from '../types';

/**
 * AbilityParser
 *
 * Parses oracle text to extract and categorize abilities:
 * - Activated abilities: [Cost]: [Effect]
 * - Triggered abilities: When/Whenever/At [trigger], [effect]
 * - Static abilities: Continuous effects
 * - Keyword abilities: Flying, Haste, Lifelink, etc.
 */

export interface ParsedAbilityCost {
  tap?: boolean;           // {T} - Requires tapping
  untap?: boolean;         // {Q} - Requires untapping
  mana?: string;           // Mana cost (e.g., "{2}{R}")
  life?: number;           // Pay life
  sacrifice?: string;      // Sacrifice pattern (e.g., "a creature", "this permanent")
  discard?: string;        // Discard pattern (e.g., "a card", "two cards")
  exile?: string;          // Exile from graveyard/hand pattern
  removeCounters?: { type: string; count: number }; // Remove counters
  loyaltyCost?: number;    // Loyalty cost: positive for +X, negative for -X, 0 for 0:
  other?: string;          // Other costs as raw text
}

export interface ParsedAbility {
  id: string;
  type: 'activated' | 'triggered' | 'static' | 'mana';
  text: string;            // Full ability text
  costText?: string;       // Cost portion for activated abilities
  effectText: string;      // Effect portion
  cost?: ParsedAbilityCost;

  // Targeting info
  requiresTarget?: boolean;
  targetFilter?: string;   // E.g., "target creature", "target player"

  // Timing restrictions
  sorcerySpeed?: boolean;  // "Activate only as a sorcery"
  oncePerTurn?: boolean;   // "Activate only once each turn"

  // For triggered abilities
  trigger?: string;        // "When", "Whenever", "At"

  // Mana ability flag (doesn't use the stack)
  isManaAbility?: boolean;

  // Loyalty ability flag (for planeswalkers)
  isLoyaltyAbility?: boolean;
}

export class AbilityParser {

  /**
   * Parses all abilities from a card's oracle text
   */
  static parseAbilities(card: CardObject): ParsedAbility[] {
    const oracleText = card.oracleText || card.definition?.oracle_text || '';
    console.log(`[AbilityParser] Parsing ${card.name}, oracleText: "${oracleText.substring(0, 100)}${oracleText.length > 100 ? '...' : ''}"`);
    if (!oracleText) return [];

    const abilities: ParsedAbility[] = [];

    // Split by paragraphs (single or double newline, or bullet points)
    // Scryfall oracle text uses single newlines between abilities
    const paragraphs = oracleText.split(/\n\n|\n/);

    let abilityIndex = 0;
    for (const paragraph of paragraphs) {
      const trimmed = paragraph.trim().replace(/^[•\-]\s*/, '');
      if (!trimmed) continue;

      // Check if it's a keyword line (Flying, Haste, Lifelink, etc.)
      if (this.isKeywordLine(trimmed)) {
        // Keywords are handled separately, skip
        continue;
      }

      // Check for loyalty ability: +X: or -X: or 0: patterns (planeswalkers)
      // Must check before activated abilities since they also use ":" pattern
      const loyaltyMatch = trimmed.match(/^([+−-]?\d+):\s*(.+)$/s);
      if (loyaltyMatch) {
        const loyaltyCostStr = loyaltyMatch[1].replace('−', '-'); // Normalize minus sign (Unicode vs ASCII)
        const loyaltyCost = parseInt(loyaltyCostStr);
        const effectText = loyaltyMatch[2];

        const ability: ParsedAbility = {
          id: `loyalty-${abilityIndex++}`,
          type: 'activated',
          text: trimmed,
          costText: `${loyaltyCostStr}:`,
          effectText: effectText.trim(),
          cost: {
            loyaltyCost: loyaltyCost
          },
          isLoyaltyAbility: true,
          sorcerySpeed: true,  // Rule 606.3 - only during main phase when stack is empty
        };

        // Check for targeting
        const targetMatch = effectText.match(/target\s+([\w\s,]+?)(?:\.|,|$)/i);
        if (targetMatch) {
          ability.requiresTarget = true;
          ability.targetFilter = targetMatch[1].trim();
        }

        abilities.push(ability);
        continue;
      }

      // Check for activated ability: [Cost]: [Effect]
      const activatedMatch = trimmed.match(/^(.+?):\s*(.+)$/s);
      if (activatedMatch && this.looksLikeCost(activatedMatch[1])) {
        const ability = this.parseActivatedAbility(trimmed, activatedMatch[1], activatedMatch[2], abilityIndex++);
        if (ability) abilities.push(ability);
        continue;
      }

      // Check for triggered ability: When/Whenever/At
      if (/^(When|Whenever|At)\b/i.test(trimmed)) {
        const ability = this.parseTriggeredAbility(trimmed, abilityIndex++);
        if (ability) abilities.push(ability);
        continue;
      }

      // Otherwise it's a static ability or effect text
      // (These are typically part of ETB effects or continuous effects)
    }

    return abilities;
  }

  /**
   * Gets only activated abilities that the player can currently activate
   */
  static getActivatableAbilities(state: StrictGameState, card: CardObject, playerId: string): ParsedAbility[] {
    const abilities = this.parseAbilities(card);

    return abilities.filter(ability => {
      if (ability.type !== 'activated' && ability.type !== 'mana') return false;

      // Check if card is controlled by player
      if (card.controllerId !== playerId) return false;

      // Check zone requirements (most abilities require battlefield)
      if (card.zone !== 'battlefield') {
        // Some abilities can be activated from other zones (e.g., Cycling from hand)
        const effectLower = ability.effectText.toLowerCase();
        if (effectLower.includes('cycling') && card.zone === 'hand') {
          return true;
        }
        return false;
      }

      // Check timing restrictions
      if (ability.sorcerySpeed) {
        if (state.activePlayerId !== playerId) return false;
        if (state.phase !== 'main1' && state.phase !== 'main2') return false;
        if (state.stack.length > 0) return false;
      }

      // Check if cost can be paid
      if (ability.cost) {
        // Check tap cost
        if (ability.cost.tap && card.tapped) return false;

        // Check summoning sickness for tap abilities on creatures
        if (ability.cost.tap && card.types?.includes('Creature')) {
          const hasHaste = card.keywords?.includes('Haste');
          if (card.controlledSinceTurn === state.turnCount && !hasHaste) {
            return false;
          }
        }

        // TODO: Add mana availability check, sacrifice availability, etc.
      }

      return true;
    });
  }

  /**
   * Parses an activated ability from its cost and effect text
   */
  private static parseActivatedAbility(fullText: string, costText: string, effectText: string, index: number): ParsedAbility | null {
    const cost = this.parseCost(costText);
    const isManaAbility = this.isManaAbility(effectText, cost);

    const ability: ParsedAbility = {
      id: `ability-${index}`,
      type: isManaAbility ? 'mana' : 'activated',
      text: fullText,
      costText: costText,
      effectText: effectText.trim(),
      cost,
      isManaAbility
    };

    // Check for targeting
    const targetMatch = effectText.match(/target\s+([\w\s,]+?)(?:\.|,|$)/i);
    if (targetMatch) {
      ability.requiresTarget = true;
      ability.targetFilter = targetMatch[1].trim();
    }

    // Check for timing restrictions
    if (/activate.+as a sorcery/i.test(fullText) || /only as a sorcery/i.test(fullText)) {
      ability.sorcerySpeed = true;
    }
    if (/activate.+only once/i.test(fullText) || /only once each turn/i.test(fullText)) {
      ability.oncePerTurn = true;
    }

    return ability;
  }

  /**
   * Parses a triggered ability
   */
  private static parseTriggeredAbility(text: string, index: number): ParsedAbility {
    const triggerMatch = text.match(/^(When|Whenever|At)\s+(.+?),\s*(.+)$/is);

    return {
      id: `trigger-${index}`,
      type: 'triggered',
      text: text,
      effectText: triggerMatch ? triggerMatch[3].trim() : text,
      trigger: triggerMatch ? triggerMatch[1] : undefined,
      requiresTarget: /target/i.test(text)
    };
  }

  /**
   * Parses the cost portion of an activated ability
   */
  static parseCost(costText: string): ParsedAbilityCost {
    const cost: ParsedAbilityCost = {};
    const parts = costText.split(/,\s*/);

    for (const part of parts) {
      const trimmed = part.trim();

      // Tap symbol
      if (/^\{T\}$/i.test(trimmed) || /^tap$/i.test(trimmed)) {
        cost.tap = true;
        continue;
      }

      // Untap symbol
      if (/^\{Q\}$/i.test(trimmed) || /^untap$/i.test(trimmed)) {
        cost.untap = true;
        continue;
      }

      // Mana cost (contains mana symbols)
      if (/\{[WUBRGCX\d]+\}/i.test(trimmed)) {
        cost.mana = trimmed;
        continue;
      }

      // Pay life
      const lifeMatch = trimmed.match(/pay\s+(\d+)\s+life/i);
      if (lifeMatch) {
        cost.life = parseInt(lifeMatch[1]);
        continue;
      }

      // Sacrifice
      if (/^sacrifice\b/i.test(trimmed)) {
        cost.sacrifice = trimmed.replace(/^sacrifice\s*/i, '');
        continue;
      }

      // Discard
      if (/^discard\b/i.test(trimmed)) {
        cost.discard = trimmed.replace(/^discard\s*/i, '');
        continue;
      }

      // Exile from graveyard
      if (/^exile\b/i.test(trimmed)) {
        cost.exile = trimmed.replace(/^exile\s*/i, '');
        continue;
      }

      // Remove counters
      const counterMatch = trimmed.match(/remove\s+(a|\d+)\s+(.+?)\s+counter/i);
      if (counterMatch) {
        cost.removeCounters = {
          count: counterMatch[1] === 'a' ? 1 : parseInt(counterMatch[1]),
          type: counterMatch[2]
        };
        continue;
      }

      // Store as other cost if not recognized
      if (trimmed && !cost.other) {
        cost.other = trimmed;
      } else if (trimmed && cost.other) {
        cost.other += ', ' + trimmed;
      }
    }

    return cost;
  }

  /**
   * Determines if an ability is a mana ability (doesn't use the stack)
   */
  private static isManaAbility(effectText: string, cost: ParsedAbilityCost): boolean {
    // A mana ability:
    // 1. Adds mana to the mana pool
    // 2. Doesn't target
    // 3. Isn't a loyalty ability (Rule 606.2)

    const addsMana = /add\s+(\{[WUBRGC]\}|one mana|mana)/i.test(effectText);
    const hasTarget = /target/i.test(effectText);
    const isLoyalty = cost.loyaltyCost !== undefined;

    return addsMana && !hasTarget && !isLoyalty;
  }

  /**
   * Checks if text looks like a cost (for distinguishing activated abilities)
   */
  private static looksLikeCost(text: string): boolean {
    const costIndicators = [
      /\{T\}/i,           // Tap symbol
      /\{Q\}/i,           // Untap symbol
      /\{[WUBRGCX\d]+\}/i, // Mana symbols
      /^tap$/i,
      /^sacrifice\b/i,
      /^discard\b/i,
      /^pay\s+\d+\s+life/i,
      /^exile\b/i,
      /^remove\b/i,
      /^[+−-]?\d+$/       // Loyalty cost patterns (+1, -3, 0, etc.)
    ];

    // Also short texts are often costs
    const isShort = text.length < 50;
    const hasCostIndicator = costIndicators.some(pattern => pattern.test(text));

    return hasCostIndicator || (isShort && !text.includes('.'));
  }

  /**
   * Checks if text is just a keyword line (Flying, Haste, etc.)
   */
  private static isKeywordLine(text: string): boolean {
    const keywordPatterns = [
      /^(flying|first strike|double strike|deathtouch|lifelink|vigilance|trample|menace|reach|hexproof|indestructible|haste|flash|defender|prowess)(\s*,\s*(flying|first strike|double strike|deathtouch|lifelink|vigilance|trample|menace|reach|hexproof|indestructible|haste|flash|defender|prowess))*$/i,
      /^ward\s+/i,
      /^protection from\s+/i,
      /^landwalk$/i,
      /^(forestwalk|islandwalk|mountainwalk|plainswalk|swampwalk)$/i
    ];

    return keywordPatterns.some(pattern => pattern.test(text.trim()));
  }

  /**
   * Extracts keyword abilities from oracle text
   */
  static parseKeywords(card: CardObject): string[] {
    const keywords: string[] = [...(card.keywords || [])];
    const oracleText = card.oracleText || card.definition?.oracle_text || '';

    // Common keywords to extract from oracle text if not in keywords array
    const keywordList = [
      'Flying', 'First Strike', 'Double Strike', 'Deathtouch', 'Lifelink',
      'Vigilance', 'Trample', 'Menace', 'Reach', 'Hexproof', 'Indestructible',
      'Haste', 'Flash', 'Defender', 'Prowess', 'Fear', 'Intimidate'
    ];

    for (const keyword of keywordList) {
      const pattern = new RegExp(`\\b${keyword}\\b`, 'i');
      if (pattern.test(oracleText) && !keywords.some(k => k.toLowerCase() === keyword.toLowerCase())) {
        keywords.push(keyword);
      }
    }

    // Extract Ward with its cost
    const wardMatch = oracleText.match(/ward\s+(\{[^}]+\}|\d+)/i);
    if (wardMatch && !keywords.some(k => k.toLowerCase().startsWith('ward'))) {
      keywords.push(`Ward ${wardMatch[1]}`);
    }

    return keywords;
  }

  /**
   * Parses firebreathing-style abilities (e.g., "{R}: +1/+0")
   */
  static parseFirebreathingAbility(ability: ParsedAbility): { power: number; toughness: number } | null {
    const match = ability.effectText.match(/([+-]?\d+)\/([+-]?\d+)/);
    if (match) {
      return {
        power: parseInt(match[1]),
        toughness: parseInt(match[2])
      };
    }

    // Also check for "gets +X/+Y" pattern
    const getsMatch = ability.effectText.match(/gets?\s+([+-]?\d+)\/([+-]?\d+)/i);
    if (getsMatch) {
      return {
        power: parseInt(getsMatch[1]),
        toughness: parseInt(getsMatch[2])
      };
    }

    return null;
  }

  /**
   * Checks if ability is a pump ability (firebreathing-style)
   */
  static isPumpAbility(ability: ParsedAbility): boolean {
    const effectLower = ability.effectText.toLowerCase();
    return /gets?\s+[+-]?\d+\/[+-]?\d+/i.test(effectLower) ||
           /[+-]?\d+\/[+-]?\d+\s+until/i.test(effectLower);
  }
}
