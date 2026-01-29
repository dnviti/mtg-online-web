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
