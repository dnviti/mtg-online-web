import { StrictGameState } from '../types';
import { Layers } from './Layers';
import { GameLogger } from './GameLogger';

/**
 * StateBasedEffects (SBA) - Manual Play Mode
 *
 * In manual play mode, most state-based effects are handled by players.
 * This module only handles:
 * - Token cleanup (tokens cease to exist outside battlefield)
 * - Layer recalculation (for continuous effects like +1/+1 counters)
 *
 * Players manually handle:
 * - Creature death from lethal damage/zero toughness
 * - Planeswalker death from zero loyalty
 * - Aura/equipment detachment
 * - Player loss conditions
 */
export class StateBasedEffects {

  /**
   * Minimal SBA check - only handles automatic cleanup.
   * Returns true if any change was made.
   */
  static check(state: StrictGameState): boolean {
    let sbaPerformed = false;
    const { cards } = state;

    // Token Ceasing to Exist (Rule 704.5d)
    // Tokens that are in a zone other than the battlefield cease to exist
    // This is the only truly automatic SBA we enforce
    const tokensToRemove: string[] = [];
    Object.entries(cards).forEach(([id, c]) => {
      if (c.isToken && c.zone !== 'battlefield') {
        console.log(`SBA: Token ${c.name} ceased to exist (left battlefield to ${c.zone}).`);
        GameLogger.log(state, `{${c.name}} token ceased to exist`, 'zone', 'Game', [c]);
        tokensToRemove.push(id);
        sbaPerformed = true;
      }
    });
    tokensToRemove.forEach(id => delete state.cards[id]);

    return sbaPerformed;
  }

  /**
   * Process SBA loop and recalculate layers.
   * In manual mode, this is minimal - mainly for layer recalculation.
   */
  static process(state: StrictGameState) {
    // Recalculate continuous effects (layers)
    Layers.recalculate(state);

    // Run minimal SBA check
    let loops = 0;
    while (this.check(state)) {
      loops++;
      if (loops > 10) {
        console.warn("SBA loop exceeded 10 iterations");
        break;
      }
      Layers.recalculate(state);
    }
  }
}
