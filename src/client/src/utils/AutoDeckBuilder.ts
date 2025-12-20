
export interface Card {
  id: string;
  name: string;
  mana_cost?: string; // Standard Scryfall
  manaCost?: string; // Legacy support
  type_line?: string; // Standard Scryfall
  typeLine?: string; // Legacy support
  colors?: string[]; // e.g. ['W', 'U']
  colorIdentity?: string[];
  rarity?: 'common' | 'uncommon' | 'rare' | 'mythic' | string;
  cmc?: number;
  power?: string;
  toughness?: string;
  edhrecRank?: number; // Added EDHREC Rank
  card_faces?: any[];
  [key: string]: any;
}

export class AutoDeckBuilder {

  /**
   * Main entry point to build a deck from a pool.
   * Now purely local and synchronous in execution (wrapped in Promise for API comp).
   */
  static async buildDeckAsync(pool: Card[], basicLands: Card[]): Promise<Card[]> {
    console.log(`[AutoDeckBuilder] 🏗️ Building deck from pool of ${pool.length} cards...`);

    // We force a small delay to not block UI thread if it was heavy, though for 90 cards it's fast.
    await new Promise(r => setTimeout(r, 10));

    return this.calculateHeuristicDeck(pool, basicLands);
  }

  // --- Core Heuristic Logic ---

  private static calculateHeuristicDeck(pool: Card[], basicLands: Card[]): Card[] {
    const TARGET_SPELL_COUNT = 23;

    // 1. Identify best 2-color combination
    const bestPair = this.findBestColorPair(pool);
    console.log(`[AutoDeckBuilder] 🎨 Best pair identified: ${bestPair.join('/')}`);

    // 2. Filter available spells for that pair + Artifacts
    const mainColors = bestPair;
    let candidates = pool.filter(c => {
      // Exclude Basic Lands from pool (they are added later)
      if (this.isBasicLand(c)) return false;

      const colors = c.colors || [];
      if (colors.length === 0) return true; // Artifacts
      return colors.every(col => mainColors.includes(col)); // On-color
    });

    // 3. Score and Select Spells
    // Logic:
    // a. Score every candidate
    // b. Sort by score
    // c. Fill Curve:
    //    - Ensure minimum 2-drops, 3-drops?
    //    - Or just pick best cards?
    //    - Let's do a weighted curve approach: Fill slots with best cards for that slot.

    const scoredCandidates = candidates.map(c => ({
      card: c,
      score: this.calculateCardScore(c, mainColors)
    }));

    // Sort Descending
    scoredCandidates.sort((a, b) => b.score - a.score);

    // Curve Buckets (Min-Max goal)
    // 1-2 CMC: 4-6
    // 3 CMC: 4-6
    // 4 CMC: 4-5
    // 5 CMC: 2-3
    // 6+ CMC: 1-2
    // Creatures check: Ensure at least ~13 creatures
    const deckSpells: Card[] = [];
    // const creatureCount = () => deckSpells.filter(c => c.typeLine?.includes('Creature')).length;


    // Simple pass: Just take top 23?
    // No, expensive cards might clog.
    // Let's iterate and enforce limits.

    const curveCounts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
    const getCmcBucket = (c: Card) => {
      const val = c.cmc || 0;
      if (val <= 2) return 2; // Merge 0,1,2 for simplicity
      if (val >= 6) return 6;
      return val;
    };

    // Soft caps for each bucket to ensure distribution
    const curveLimits: Record<number, number> = { 2: 8, 3: 7, 4: 6, 5: 4, 6: 3 };

    // Pass 1: Fill using curve limits
    for (const item of scoredCandidates) {
      if (deckSpells.length >= TARGET_SPELL_COUNT) break;
      const bucket = getCmcBucket(item.card);
      if (curveCounts[bucket] < curveLimits[bucket]) {
        deckSpells.push(item.card);
        curveCounts[bucket]++;
      }
    }

    // Pass 2: Fill remaining slots with best available ignoring curve (to reach 23)
    if (deckSpells.length < TARGET_SPELL_COUNT) {
      const remaining = scoredCandidates.filter(item => !deckSpells.includes(item.card));
      for (const item of remaining) {
        if (deckSpells.length >= TARGET_SPELL_COUNT) break;
        deckSpells.push(item.card);
      }
    }

    // Creature Balance Check (Simplistic)
    // If creatures < 12, swap worst non-creatures for best available creatures?
    // Skipping for now to keep it deterministic and simple.

    // 4. Lands
    // Fetch Basic Lands based on piping
    const deckLands = this.generateBasicLands(deckSpells, basicLands, 40 - deckSpells.length);

    return [...deckSpells, ...deckLands];
  }


  // --- Helper: Find Best Pair ---

  private static findBestColorPair(pool: Card[]): string[] {
    const colors = ['W', 'U', 'B', 'R', 'G'];
    const pairs: string[][] = [];

    // Generating all unique pairs
    for (let i = 0; i < colors.length; i++) {
      for (let j = i + 1; j < colors.length; j++) {
        pairs.push([colors[i], colors[j]]);
      }
    }

    let bestPair = ['W', 'U'];
    let maxScore = -1;

    pairs.forEach(pair => {
      const score = this.evaluateColorPair(pool, pair);
      // console.log(`Pair ${pair.join('')} Score: ${score}`);
      if (score > maxScore) {
        maxScore = score;
        bestPair = pair;
      }
    });

    return bestPair;
  }

  private static evaluateColorPair(pool: Card[], pair: string[]): number {
    // Score based on:
    // 1. Quantity of playable cards in these colors
    // 2. Specific bonuses for Rares/Mythics

    let score = 0;

    pool.forEach(c => {
      // Skip lands for archetype selection power (mostly)
      if (this.isLand(c)) return;

      const cardColors = c.colors || [];

      // Artifacts count for everyone but less
      if (cardColors.length === 0) {
        score += 0.5;
        return;
      }

      // Check if card fits in pair
      const fits = cardColors.every(col => pair.includes(col));
      if (!fits) return;

      // Base score
      let cardVal = 1;

      // Rarity Bonus
      if (c.rarity === 'uncommon') cardVal += 1.5;
      if (c.rarity === 'rare') cardVal += 3.5;
      if (c.rarity === 'mythic') cardVal += 4.5;

      // Gold Card Bonus (Signpost) - If it uses BOTH colors, it's a strong signal
      if (cardColors.length === 2 && cardColors.includes(pair[0]) && cardColors.includes(pair[1])) {
        cardVal += 2;
      }

      score += cardVal;
    });

    return score;
  }

  // --- Helper: Card Scoring ---

  private static calculateCardScore(c: Card, mainColors: string[]): number {
    let score = 0;

    // 1. Rarity Base
    switch (c.rarity) {
      case 'mythic': score = 5.0; break;
      case 'rare': score = 4.0; break;
      case 'uncommon': score = 2.5; break;
      default: score = 1.0; break; // Common
    }

    // 2. Removal Bonus (Heuristic based on type + text is hard, so just type for now)
    // Instants/Sorceries tend to be removal or interaction
    const typeLine = c.typeLine || c.type_line || '';
    if (typeLine.includes('Instant') || typeLine.includes('Sorcery')) {
      score += 0.5;
    }

    // 3. Gold Card Synergy
    const colors = c.colors || [];
    if (colors.length > 1) {
      score += 0.5; // Multicolored cards are usually stronger rate-wise

      // Bonus if it perfectly matches our main colors (Signpost)
      if (mainColors.length === 2 && colors.includes(mainColors[0]) && colors.includes(mainColors[1])) {
        score += 1.0;
      }
    }

    // 4. CMC Check (Penalty for very high cost)
    if ((c.cmc || 0) > 6) score -= 0.5;

    // 5. EDHREC Score (Mild Influence)
    // Rank 1000 => +2.0, Rank 5000 => +1.0
    // Formula: 3 * (1 - (rank/10000)) limited to 0
    if (c.edhrecRank !== undefined && c.edhrecRank !== null) {
      const rank = c.edhrecRank;
      if (rank < 10000) {
        score += (3 * (1 - (rank / 10000)));
      }
    }

    return score;
  }

  // --- Helper: Lands ---

  private static generateBasicLands(deckSpells: Card[], basicLandPool: Card[], countNeeded: number): Card[] {
    const deckLands: Card[] = [];
    if (countNeeded <= 0) return deckLands;

    // Count pips
    const pips = { W: 0, U: 0, B: 0, R: 0, G: 0 };
    deckSpells.forEach(c => {
      const cost = c.mana_cost || c.manaCost || '';
      if (cost.includes('W')) pips.W += (cost.match(/W/g) || []).length;
      if (cost.includes('U')) pips.U += (cost.match(/U/g) || []).length;
      if (cost.includes('B')) pips.B += (cost.match(/B/g) || []).length;
      if (cost.includes('R')) pips.R += (cost.match(/R/g) || []).length;
      if (cost.includes('G')) pips.G += (cost.match(/G/g) || []).length;
    });

    const totalPips = Object.values(pips).reduce((a, b) => a + b, 0) || 1;

    // Allocate
    const allocation = {
      W: Math.round((pips.W / totalPips) * countNeeded),
      U: Math.round((pips.U / totalPips) * countNeeded),
      B: Math.round((pips.B / totalPips) * countNeeded),
      R: Math.round((pips.R / totalPips) * countNeeded),
      G: Math.round((pips.G / totalPips) * countNeeded),
    };

    // Adjust for rounding errors
    let currentTotal = Object.values(allocation).reduce((a, b) => a + b, 0);

    // 1. If we are short, add to the color with most pips
    while (currentTotal < countNeeded) {
      const topColor = Object.entries(allocation).sort((a, b) => b[1] - a[1])[0][0];
      allocation[topColor as keyof typeof allocation]++;
      currentTotal++;
    }

    // 2. If we are over, subtract from the color with most lands (that has > 0)
    while (currentTotal > countNeeded) {
      const topColor = Object.entries(allocation).sort((a, b) => b[1] - a[1])[0][0];
      if (allocation[topColor as keyof typeof allocation] > 0) {
        allocation[topColor as keyof typeof allocation]--;
        currentTotal--;
      } else {
        // Fallback to remove from anyone
        const anyColor = Object.keys(allocation).find(k => allocation[k as keyof typeof allocation] > 0);
        if (anyColor) allocation[anyColor as keyof typeof allocation]--;
        currentTotal--;
      }
    }

    // Generate Objects
    Object.entries(allocation).forEach(([color, qty]) => {
      if (qty <= 0) return;
      const landName = this.getBasicLandName(color);

      // Find source
      let source = basicLandPool.find(l => l.name === landName)
        || basicLandPool.find(l => l.name.includes(landName)); // Fuzzy

      if (!source && basicLandPool.length > 0) source = basicLandPool[0]; // Fallback?

      // If we have a source, clone it. If not, we might be in trouble but let's assume source exists or we make a dummy.
      for (let i = 0; i < qty; i++) {
        deckLands.push({
          ...source!,
          name: landName, // Ensure correct name
          typeLine: `Basic Land — ${landName}`,
          id: `land-${color}-${Date.now()}-${Math.random().toString(36).substring(7)}`,
          isLandSource: false
        });
      }
    });

    return deckLands;
  }

  // --- Utilities ---

  private static isLand(c: Card): boolean {
    const t = c.typeLine || c.type_line || '';
    return t.includes('Land');
  }

  private static isBasicLand(c: Card): boolean {
    const t = c.typeLine || c.type_line || '';
    return t.includes('Basic Land');
  }

  private static getBasicLandName(color: string): string {
    switch (color) {
      case 'W': return 'Plains';
      case 'U': return 'Island';
      case 'B': return 'Swamp';
      case 'R': return 'Mountain';
      case 'G': return 'Forest';
      default: return 'Wastes';
    }
  }
}
