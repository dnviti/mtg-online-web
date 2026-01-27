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
      if (source.oracleText?.toLowerCase().includes('enchant land')) return target.types?.includes('Land') ?? false;
      return target.types?.includes('Creature') ?? false;
    }
    return true;
  }

  static isBattle(card: any): boolean {
    return card.types && card.types.includes('Battle');
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
