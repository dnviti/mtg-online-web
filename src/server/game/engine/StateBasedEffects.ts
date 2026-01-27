import { StrictGameState } from '../types';
import { Layers } from './Layers';

/**
 * StateBasedEffects (SBA)
 * 
 * responsible for checking and applying automatic game rules that happen continuously.
 * This includes:
 * - A player losing the game (0 life).
 * - Creatures dying from lethal damage or 0 toughness.
 * - Auras/Equipment falling off invalid targets.
 * 
 * This module runs in a loop until no more effects occur (StateBasedEffects.process).
 */
export class StateBasedEffects {

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

    // 2. Creature Death (Zero Toughness or Lethal Damage)
    const creatures = Object.values(cards).filter(c => c.zone === 'battlefield' && c.types?.includes('Creature'));

    for (const c of creatures) {
      // 704.5f Toughness 0 or less
      if (c.toughness <= 0) {
        console.log(`SBA: ${c.name} put to GY (Zero Toughness).`);
        c.zone = 'graveyard';
        sbaPerformed = true;
        continue;
      }

      // 704.5g Lethal Damage
      if (c.damageMarked >= c.toughness && !c.supertypes?.includes('Indestructible')) {
        console.log(`SBA: ${c.name} destroyed (Lethal Damage: ${c.damageMarked}/${c.toughness}).`);
        c.zone = 'graveyard';
        sbaPerformed = true;
      }
    }

    // 3. Legend Rule (704.5j) - Skipped for now (Placeholder from original)

    // 4. Aura Validity (704.5n)
    Object.values(cards).forEach(c => {
      if (c.zone === 'battlefield' && c.types?.includes('Enchantment') && c.subtypes?.includes('Aura')) {
        if (!c.attachedTo) {
          console.log(`SBA: ${c.name} (Aura) unattached. Destroyed.`);
          c.zone = 'graveyard';
          sbaPerformed = true;
        } else {
          const target = cards[c.attachedTo];
          if (!target || target.zone !== 'battlefield') {
            console.log(`SBA: ${c.name} (Aura) target invalid. Destroyed.`);
            c.zone = 'graveyard';
            sbaPerformed = true;
          }
        }
      }
    });

    // 5. Equipment Validity
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

    // 6. Token Ceasing to Exist (704.5d)
    // Tokens that are in a zone other than the battlefield cease to exist
    const tokensToRemove: string[] = [];
    Object.entries(cards).forEach(([id, c]) => {
      if (c.isToken && c.zone !== 'battlefield') {
        console.log(`SBA: Token ${c.name} ceased to exist (left battlefield to ${c.zone}).`);
        tokensToRemove.push(id);
        sbaPerformed = true;
      }
    });
    tokensToRemove.forEach(id => delete state.cards[id]);

    return sbaPerformed;
  }

  // This method encapsulates the SBA loop and recalculation of layers
  static process(state: StrictGameState) {
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
  }
}
