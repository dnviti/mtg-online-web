import { StrictGameState } from '../types';

/**
 * Layers
 * 
 * Implements the "Interaction of Continuous Effects" system (CR 613).
 * It recalculates the characteristics of cards (Power, Toughness, etc.) based on
 * base values, counters, and continuous modifiers (e.g. +1/+1 effects).
 * 
 * Currently acts primarily on Power/Toughness layers (7b, 7c, 7d).
 */
export class Layers {
  /**
   * Re-evaluates all continuous effects for cards on the battlefield.
   * Should be called whenever the game state changes.
   */
  static recalculate(state: StrictGameState) {
    // Basic Layer System Implementation (7. Interaction of Continuous Effects)
    Object.values(state.cards).forEach(card => {
      // Only process battlefield
      if (card.zone !== 'battlefield') {
        card.power = card.basePower;
        card.toughness = card.baseToughness;
        return;
      }

      // Layer 7a: Characteristic-Defining Abilities (CDA) - skipped for now
      let p = card.basePower;
      let t = card.baseToughness;

      // Layer 7b: Effects that set power and/or toughness to a specific number
      // e.g. "Become 0/1"
      if (card.modifiers) {
        card.modifiers.filter(m => m.type === 'set_pt').forEach(mod => {
          if (mod.value.power !== undefined) p = mod.value.power;
          if (mod.value.toughness !== undefined) t = mod.value.toughness;
        });
      }

      // Layer 7c: Effects that modify power and/or toughness (+X/+Y)
      // e.g. Giant Growth, Anthems
      if (card.modifiers) {
        card.modifiers.filter(m => m.type === 'pt_boost').forEach(mod => {
          p += (mod.value.power || 0);
          t += (mod.value.toughness || 0);
        });
      }

      // Layer 7d: Counters (+1/+1, -1/-1)
      if (card.counters) {
        card.counters.forEach(c => {
          if (c.type === '+1/+1') {
            p += c.count;
            t += c.count;
          } else if (c.type === '-1/-1') {
            p -= c.count;
            t -= c.count;
          }
        });
      }

      card.power = p;
      card.toughness = t;
    });
  }
}
