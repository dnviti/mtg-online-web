import { StrictGameState } from '../types';


/**
 * ManaUtils
 * 
 * Handles all mana-related logic including:
 * - Parsing mana strings (e.g. "{1}{U}{U}") into cost objects.
 * - Auto-tapping lands to pay for costs (greedy algorithm).
 * - Managing player mana pools.
 */
export class ManaUtils {

  /**
   * Parses a mana cost string into a structured object containing generic, colored, and hybrid requirements.
   */
  static parseManaCost(manaCost: string): { generic: number, colors: Record<string, number>, hybrids: string[][] } {
    const cost = { generic: 0, colors: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 } as Record<string, number>, hybrids: [] as string[][] };

    if (!manaCost) return cost;

    // Use regex to match {X} blocks
    const matches = manaCost.match(/{[^{}]+}/g);
    if (!matches) return cost;

    matches.forEach(symbol => {
      const content = symbol.replace(/[{}]/g, '');

      // Check for generic number
      if (!isNaN(Number(content))) {
        cost.generic += Number(content);
      }
      // Check for Hybrid (contains /)
      else if (content.includes('/')) {
        // e.g. W/U, 2/W
        const parts = content.split('/');
        const options = parts.filter(p => ['W', 'U', 'B', 'R', 'G', 'C'].includes(p));

        if (options.length >= 2) {
          cost.hybrids.push(options);
        } else if (options.length === 1 && !isNaN(Number(parts[0]))) {
          cost.hybrids.push(options); // treat as just the color requirement if regex fails strictly
        }
      }
      else {
        // Standard colors
        if (['W', 'U', 'B', 'R', 'G', 'C'].includes(content)) {
          cost.colors[content]++;
        }
      }
    });

    return cost;
  }

  static payManaCost(state: StrictGameState, playerId: string, manaCostStr: string): void {
    const player = state.players[playerId];
    const cost = this.parseManaCost(manaCostStr);

    // 1. Gather Resources
    const pool = { ...player.manaPool }; // Copy pool
    const lands = Object.values(state.cards).filter(c =>
      c.controllerId === playerId &&
      c.zone === 'battlefield' &&
      !c.tapped &&
      (c.types?.includes('Land') || c.typeLine?.includes('Land'))
    );

    const landsToTap: string[] = []; // List of IDs

    // 2. Pay Colored Costs
    for (const color of ['W', 'U', 'B', 'R', 'G', 'C']) {
      let required = cost.colors[color];
      if (required <= 0) continue;

      // a. Pay from Pool first
      if (pool[color] >= required) {
        pool[color] -= required;
        required = 0;
      } else {
        required -= pool[color];
        pool[color] = 0;
      }

      // b. Pay from Lands
      if (required > 0) {
        // Find lands producing this color
        const producers = lands.filter(l => !landsToTap.includes(l.instanceId) && this.getAvailableManaColors(l).includes(color));

        if (producers.length >= required) {
          // Mark first N as used
          for (let i = 0; i < required; i++) {
            landsToTap.push(producers[i].instanceId);
          }
          required = 0;
        } else {
          // Use all we have, but it's not enough
          throw new Error(`Insufficient ${color} mana.`);
        }
      }
    }

    // 2.5 Pay Hybrid Costs (Greedy Strategy)
    for (const options of cost.hybrids) {
      let paid = false;
      // Try each color option
      for (const color of options) {
        // Check Pool
        if (pool[color] > 0) {
          pool[color]--;
          paid = true;
          break;
        }
        // Check Lands
        const land = lands.find(l => !landsToTap.includes(l.instanceId) && this.getAvailableManaColors(l).includes(color));
        if (land) {
          landsToTap.push(land.instanceId);
          paid = true;
          break;
        }
      }

      if (!paid) {
        throw new Error(`Insufficient mana for hybrid cost {${options.join('/')}}.`);
      }
    }

    // 3. Pay Generic Cost
    let genericRequired = cost.generic;

    if (genericRequired > 0) {
      // a. Consume any remaining pools (greedy)
      for (const color of Object.keys(pool)) {
        if (genericRequired <= 0) break;
        const available = pool[color];
        if (available > 0) {
          const params = Math.min(available, genericRequired);
          pool[color] -= params;
          genericRequired -= params;
        }
      }

      // b. Tap remaining unused lands
      if (genericRequired > 0) {
        const unusedLands = lands.filter(l => !landsToTap.includes(l.instanceId) && this.getAvailableManaColors(l).length > 0);

        if (unusedLands.length >= genericRequired) {
          for (let i = 0; i < genericRequired; i++) {
            landsToTap.push(unusedLands[i].instanceId);
          }
          genericRequired = 0;
        } else {
          throw new Error("Insufficient mana for generic cost.");
        }
      }
    }

    // 4. Commit Payments
    // Update Pool
    player.manaPool = pool;
    // Tap Lands
    landsToTap.forEach(lid => {
      const land = state.cards[lid];
      land.tapped = true;
      console.log(`Auto-tapped ${land.name} for mana.`);
    });
    console.log(`Paid mana cost ${manaCostStr}. Remaining Pool:`, pool);
  }

  // Helper: Get ALL colors a card can produce
  static getAvailableManaColors(card: any): string[] {
    // 0. Type Guard for Land
    if (!card.typeLine?.includes('Land') && !card.types?.includes('Land')) return [];

    // 1. Check Definition (Scryfall Data)
    if (card.definition?.produced_mana && Array.isArray(card.definition.produced_mana)) {
      return card.definition.produced_mana;
    }

    const symbols: Set<string> = new Set();
    const lowerType = (card.typeLine || '').toLowerCase();
    const lowerText = (card.definition?.oracle_text || card.oracleText || '').toLowerCase();

    // 2. Basic Land Types
    if (lowerType.includes('plains')) symbols.add('W');
    if (lowerType.includes('island')) symbols.add('U');
    if (lowerType.includes('swamp')) symbols.add('B');
    if (lowerType.includes('mountain')) symbols.add('R');
    if (lowerType.includes('forest')) symbols.add('G');
    if (lowerType.includes('waste')) symbols.add('C');

    // 3. Oracle Text Fallback
    if (symbols.size === 0) {
      if (lowerText.includes('{w}')) symbols.add('W');
      if (lowerText.includes('{u}')) symbols.add('U');
      if (lowerText.includes('{b}')) symbols.add('B');
      if (lowerText.includes('{r}')) symbols.add('R');
      if (lowerText.includes('{g}')) symbols.add('G');
      if (lowerText.includes('{c}')) symbols.add('C');
      if (lowerText.includes('any color')) {
        ['W', 'U', 'B', 'R', 'G'].forEach(c => symbols.add(c));
      }
    }

    return Array.from(symbols);
  }

  static addMana(state: StrictGameState, playerId: string, mana: { color: string, amount: number }) {
    const validColors = ['W', 'U', 'B', 'R', 'G', 'C'];
    if (!validColors.includes(mana.color)) throw new Error("Invalid mana color.");

    const player = state.players[playerId];
    if (!player) throw new Error("Invalid player.");

    if (!player.manaPool) player.manaPool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };

    player.manaPool[mana.color] = (player.manaPool[mana.color] || 0) + mana.amount;

    console.log(`Player ${playerId} added ${mana.amount}${mana.color} to pool.`, player.manaPool);
    return true;
  }
}
