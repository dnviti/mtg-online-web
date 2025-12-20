
interface Card {
  id: string;
  name: string;
  manaCost?: string;
  typeLine?: string;
  colors?: string[]; // e.g. ['W', 'U']
  colorIdentity?: string[];
  rarity?: string;
  cmc?: number;
}

export class BotDeckBuilderService {

  buildDeck(pool: Card[], basicLands: Card[]): Card[] {
    console.log(`[BotDeckBuilder] 🤖 Building deck for bot (Pool: ${pool.length} cards)...`);
    // 1. Analyze Colors to find top 2 archetypes
    const colorCounts = { W: 0, U: 0, B: 0, R: 0, G: 0 };

    pool.forEach(card => {
      // Simple heuristic: Count cards by color identity
      // Weighted by Rarity: Mythic=4, Rare=3, Uncommon=2, Common=1
      const weight = this.getRarityWeight(card.rarity);

      if (card.colors && card.colors.length > 0) {
        card.colors.forEach(c => {
          if (colorCounts[c as keyof typeof colorCounts] !== undefined) {
            colorCounts[c as keyof typeof colorCounts] += weight;
          }
        });
      }
    });

    // Sort colors by count desc
    const sortedColors = Object.entries(colorCounts)
      .sort(([, a], [, b]) => b - a)
      .map(([color]) => color);

    const mainColors = sortedColors.slice(0, 2); // Top 2 colors

    // 2. Filter Pool for On-Color + Artifacts
    const candidates = pool.filter(card => {
      if (!card.colors || card.colors.length === 0) return true; // Artifacts/Colorless
      // Check if card fits within main colors
      return card.colors.every(c => mainColors.includes(c));
    });

    // 3. Separate Lands and Spells
    const lands = candidates.filter(c => c.typeLine?.includes('Land')); // Non-basic lands in pool
    const spells = candidates.filter(c => !c.typeLine?.includes('Land'));

    // 4. Select Spells (Curve + Power)
    // Sort by Weight + slight curve preference (lower cmc preferred for consistency)
    spells.sort((a, b) => {
      const weightA = this.getRarityWeight(a.rarity);
      const weightB = this.getRarityWeight(b.rarity);
      return weightB - weightA;
    });

    const deckSpells = spells.slice(0, 23);
    const deckNonBasicLands = lands.slice(0, 4); // Take up to 4 non-basics if available (simple cap)

    // 5. Fill with Basic Lands
    const cardsNeeded = 40 - (deckSpells.length + deckNonBasicLands.length);
    const deckLands: Card[] = [];

    if (cardsNeeded > 0 && basicLands.length > 0) {
      // Calculate ratio of colors in spells
      let whitePips = 0;
      let bluePips = 0;
      let blackPips = 0;
      let redPips = 0;
      let greenPips = 0;

      deckSpells.forEach(c => {
        if (c.colors?.includes('W')) whitePips++;
        if (c.colors?.includes('U')) bluePips++;
        if (c.colors?.includes('B')) blackPips++;
        if (c.colors?.includes('R')) redPips++;
        if (c.colors?.includes('G')) greenPips++;
      });

      const totalPips = whitePips + bluePips + blackPips + redPips + greenPips || 1;

      // Allocate lands
      const landAllocation = {
        W: Math.round((whitePips / totalPips) * cardsNeeded),
        U: Math.round((bluePips / totalPips) * cardsNeeded),
        B: Math.round((blackPips / totalPips) * cardsNeeded),
        R: Math.round((redPips / totalPips) * cardsNeeded),
        G: Math.round((greenPips / totalPips) * cardsNeeded),
      };

      // Fix rounding errors
      const allocatedTotal = Object.values(landAllocation).reduce((a, b) => a + b, 0);
      if (allocatedTotal < cardsNeeded) {
        // Add to main color
        landAllocation[mainColors[0] as keyof typeof landAllocation] += (cardsNeeded - allocatedTotal);
      }

      // Add actual land objects
      // We need a source of basic lands. Passed in argument.
      Object.entries(landAllocation).forEach(([color, count]) => {
        const landName = this.getBasicLandName(color);
        const landCard = basicLands.find(l => l.name === landName) || basicLands[0]; // Fallback

        if (landCard) {
          for (let i = 0; i < count; i++) {
            deckLands.push({ ...landCard, id: `land-${Date.now()}-${Math.random()}` }); // clone with new ID
          }
        }
      });
    }

    return [...deckSpells, ...deckNonBasicLands, ...deckLands];
  }

  private getRarityWeight(rarity?: string): number {
    switch (rarity) {
      case 'mythic': return 5;
      case 'rare': return 4;
      case 'uncommon': return 2;
      default: return 1;
    }
  }

  private getBasicLandName(color: string): string {
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
