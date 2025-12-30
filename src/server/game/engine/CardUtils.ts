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
      if (source.oracleText?.toLowerCase().includes('enchant land')) return target.types.includes('Land');
      return target.types.includes('Creature');
    }
    return true;
  }
}
