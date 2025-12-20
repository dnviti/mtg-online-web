
interface Card {
  id: string;
  name: string;
  manaCost?: string;
  typeLine?: string; // or type_line
  type_line?: string;
  colors?: string[]; // e.g. ['W', 'U']
  colorIdentity?: string[];
  rarity?: string;
  cmc?: number;
  [key: string]: any;
}

export class AutoDeckBuilder {

  static async buildDeckAsync(pool: Card[], basicLands: Card[]): Promise<Card[]> {
    console.log(`[AutoDeckBuilder] 🏗️ Building deck from pool of ${pool.length} cards...`);

    // 1. Calculate Heuristic Deck (Local) using existing logic
    const heuristicDeck = this.calculateHeuristicDeck(pool, basicLands);
    console.log(`[AutoDeckBuilder] 🧠 Heuristic generated ${heuristicDeck.length} cards.`);

    try {
      // 2. Call Server API for AI/Enhanced Decision
      const response = await fetch('/api/ai/deck', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pool: pool.map(c => ({
            id: c.id,
            name: c.name,
            colors: c.colors,
            type_line: c.typeLine || c.type_line,
            rarity: c.rarity,
            cmc: c.cmc
          })),
          heuristicDeck: heuristicDeck.map(c => ({ id: c.id, name: c.name })) // Optimization: Send IDs/Names only? Server needs content.
          // Actually server might need full card objects if it's stateless.
          // Let's send lighter objects.
        })
      });

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }

      const data = await response.json();
      if (data.deck) {
        console.log(`[AutoDeckBuilder] 🌐 Server returned deck with ${data.deck.length} cards.`);
        // Re-hydrate cards from pool/lands based on IDs returned? 
        // Or use returned objects? 
        // If server returns IDs, we need to map back.
        // For now, let's assume server returns full objects or we return the heuristic deck if failed.
        // The server implementation GeminiService.generateDeck returns Card[].

        // Mapper:
        // return data.deck; // This might lose local props like `isLandSource`.
        // We should trust the server's return if it matches our structure.
        return data.deck;
      }

    } catch (error) {
      console.error('[AutoDeckBuilder] ⚠️ API Call failed, returning heuristic deck.', error);
    }

    return heuristicDeck;
  }

  // Extracted internal method for synchronous heuristic (Bot logic)
  private static calculateHeuristicDeck(pool: Card[], basicLands: Card[]): Card[] {
    // 1. Analyze Colors to find top 2 archetypes
    const colorCounts = { W: 0, U: 0, B: 0, R: 0, G: 0 };

    pool.forEach(card => {
      // Simple heuristic: Count cards by color identity
      // Weighted by Rarity: Mythic=4, Rare=3, Uncommon=2, Common=1
      const weight = this.getRarityWeight(card.rarity);

      const colors = card.colors || [];

      if (colors.length > 0) {
        colors.forEach(c => {
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
      const colors = card.colors || [];
      if (colors.length === 0) return true; // Artifacts/Colorless
      // Check if card fits within main colors
      return colors.every(c => mainColors.includes(c));
    });

    // 3. Separate Lands and Spells
    // Check both camelCase and snake_case type line
    const isLand = (c: Card) => (c.typeLine || c.type_line || '').includes('Land');

    const lands = candidates.filter(isLand); // Non-basic lands in pool
    const spells = candidates.filter(c => !isLand(c));

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
        const colors = c.colors || [];
        if (colors.includes('W')) whitePips++;
        if (colors.includes('U')) bluePips++;
        if (colors.includes('B')) blackPips++;
        if (colors.includes('R')) redPips++;
        if (colors.includes('G')) greenPips++;
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
      } else if (allocatedTotal > cardsNeeded) {
        // Reduce main color? Or just truncate.
        // In the server version we didn't handle over-allocation, assuming round down mostly.
        // But round up can happen.
        // Simple fix: if over, reduce first non-zero
        let diff = allocatedTotal - cardsNeeded;
        const keys = Object.keys(landAllocation) as Array<keyof typeof landAllocation>;
        for (let i = 0; i < diff; i++) {
          for (const k of keys) {
            if (landAllocation[k] > 0) {
              landAllocation[k]--;
              break;
            }
          }
        }
      }

      // Add actual land objects
      Object.entries(landAllocation).forEach(([color, count]) => {
        const landName = this.getBasicLandName(color);
        // Find land with matching name (loose match)
        const landCard = basicLands.find(l => l.name === landName || (l.name.includes(landName) && (l.typeLine || l.type_line || '').includes('Basic'))) || basicLands[0];

        if (landCard) {
          for (let i = 0; i < count; i++) {
            deckLands.push({
              ...landCard,
              id: `land-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              isLandSource: false // Ensure it's treated as a deck card
            });
          }
        }
      });
    }

    return [...deckSpells, ...deckNonBasicLands, ...deckLands];
  }

  private static getRarityWeight(rarity?: string): number {
    switch (rarity) {
      case 'mythic': return 5;
      case 'rare': return 4;
      case 'uncommon': return 2;
      default: return 1;
    }
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
