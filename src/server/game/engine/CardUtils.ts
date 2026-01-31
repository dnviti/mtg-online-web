/**
 * CardUtils
 * 
 * Helper functions for inspecting card types and properties.
 * Provides consistent checks for identifying Auras, Equipment, Creatures,
 * and valid attachment targets.
 */
export class CardUtils {
  static isAura(card: any): boolean {
    return card.types && card.types.includes('Enchantment') && card.subtypes && card.subtypes.includes('Aura');
  }

  static isEquipment(card: any): boolean {
    return card.types && card.types.includes('Artifact') && card.subtypes && card.subtypes.includes('Equipment');
  }

  static isCreature(card: any): boolean {
    return card.types && card.types.includes('Creature');
  }

  static canAttach(source: any, target: any): boolean {
    if (this.isAura(source)) {
      const oracleText = (source.oracleText || source.definition?.oracle_text || '').toLowerCase();

      // Parse "Enchant X" from oracle text
      if (oracleText.includes('enchant land')) return target.types?.includes('Land') ?? false;
      if (oracleText.includes('enchant artifact')) return target.types?.includes('Artifact') ?? false;
      if (oracleText.includes('enchant planeswalker')) return target.types?.includes('Planeswalker') ?? false;
      if (oracleText.includes('enchant permanent')) return target.zone === 'battlefield';
      if (oracleText.includes('enchant player')) return false; // Players handled separately

      // Default: Enchant creature (most common)
      return target.types?.includes('Creature') ?? false;
    }
    return true;
  }

  /**
   * Gets all valid targets for an Aura on the battlefield
   */
  static getValidAuraTargets(state: any, aura: any): string[] {
    const validTargets: string[] = [];
    const oracleText = (aura.oracleText || aura.definition?.oracle_text || '').toLowerCase();

    // Check for "Enchant player" - return player IDs
    if (oracleText.includes('enchant player')) {
      return Object.keys(state.players);
    }

    // For permanents, check all cards on battlefield
    for (const card of Object.values(state.cards) as any[]) {
      if (card.zone !== 'battlefield') continue;
      if (this.canAttach(aura, card)) {
        validTargets.push(card.instanceId);
      }
    }

    return validTargets;
  }

  static isBattle(card: any): boolean {
    return card.types && card.types.includes('Battle');
  }

  static isPlaneswalker(card: any): boolean {
    return card.types && card.types.includes('Planeswalker');
  }

  /**
   * Checks if a card has the Bestow keyword ability.
   * Bestow allows an Enchantment Creature to be cast as an Aura.
   * When the enchanted creature leaves the battlefield, the Bestow aura
   * becomes a creature instead of going to the graveyard.
   */
  static hasBestow(card: any): boolean {
    // Check keywords array
    if (card.keywords?.some((k: string) => k.toLowerCase() === 'bestow')) {
      return true;
    }
    // Check oracle text for bestow cost
    const oracleText = (card.oracleText || card.definition?.oracle_text || '').toLowerCase();
    return /bestow\s+\{/.test(oracleText);
  }

  /**
   * Checks if an aura has a "return to hand" trigger when put into graveyard.
   * Examples: Rancor, Dragon Mantle, Rune of Might, etc.
   * Pattern: "When this Aura is put into a graveyard from the battlefield, return it to its owner's hand."
   */
  static hasReturnToHandOnGraveyard(card: any): boolean {
    const oracleText = (card.oracleText || card.definition?.oracle_text || '').toLowerCase();
    // Match patterns like:
    // "When this Aura is put into a graveyard from the battlefield, return it to its owner's hand"
    // "When ~ is put into a graveyard from the battlefield, return ~ to its owner's hand"
    return /when (?:this aura|~|it) is put into a graveyard from the battlefield,?\s*return (?:it|~|this card) to its owner's hand/i.test(oracleText);
  }

  /**
   * Checks if an aura has a "return to hand when enchanted creature dies" trigger.
   * Examples: Angelic Destiny, Nurgle's Rot
   * Pattern: "When enchanted creature dies, return this card to its owner's hand."
   */
  static hasReturnToHandOnEnchantedCreatureDies(card: any): boolean {
    const oracleText = (card.oracleText || card.definition?.oracle_text || '').toLowerCase();
    // Match patterns like:
    // "When enchanted creature dies, return this card to its owner's hand"
    // "When enchanted creature dies, return ~ to its owner's hand"
    return /when enchanted creature dies,?\s*return (?:this card|~|it) to its owner's hand/i.test(oracleText);
  }

  /**
   * Parses the effect that should happen when the enchanted creature dies.
   * Returns the effect text if the aura has such a trigger, null otherwise.
   * This handles more complex patterns like Nurgle's Rot which creates tokens.
   */
  static getEnchantedCreatureDiesEffect(card: any): string | null {
    const oracleText = (card.oracleText || card.definition?.oracle_text || '').toLowerCase();

    // Match "When enchanted creature dies, [effect]"
    const match = oracleText.match(/when enchanted creature dies,?\s*(.+?)(?:\.|$)/i);
    if (match) {
      return match[1].trim();
    }
    return null;
  }

  /**
   * Gets the creature types/stats that a Bestow aura should become when detaching.
   * Returns the base creature characteristics from the card definition.
   */
  static getBestowCreatureStats(card: any): { power: number; toughness: number; types: string[]; subtypes: string[] } | null {
    if (!this.hasBestow(card)) return null;

    // When bestow ends, the card reverts to its creature form
    // The card should have Enchantment and Creature types
    const types = card.types || [];
    const subtypes = card.subtypes || [];

    // Parse power/toughness from card
    const power = card.basePower ?? card.power ?? 0;
    const toughness = card.baseToughness ?? card.toughness ?? 0;

    return {
      power,
      toughness,
      types: types.includes('Creature') ? types : [...types, 'Creature'],
      subtypes
    };
  }

  static isPermanent(card: any): boolean {
    if (card.types && card.types.length > 0) {
      return card.types.some((t: string) =>
        ['Creature', 'Artifact', 'Enchantment', 'Planeswalker', 'Land', 'Battle'].includes(t)
      );
    }
    // Fallback to typeLine check if types array is empty/missing
    if (card.typeLine) {
      // Simple string inclusion is risky for things like "Creature token" or "Non-creature", but Standard types are capitalized in typeLine generally.
      // However, safest is to check for presence of the words.
      return /Creature|Artifact|Enchantment|Planeswalker|Land|Battle/i.test(card.typeLine);
    }
    return false;
  }
}
