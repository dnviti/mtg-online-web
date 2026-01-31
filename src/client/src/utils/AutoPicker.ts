
interface Card {
  id: string;
  name: string;
  manaCost?: string;
  typeLine?: string;
  type_line?: string;
  colors?: string[];
  colorIdentity?: string[];
  rarity?: string;
  cmc?: number;
  [key: string]: any;
}

export class AutoPicker {

  static async pickBestCardAsync(pack: Card[], pool: Card[]): Promise<Card | null> {
    if (!pack || pack.length === 0) return null;

    console.log('[AutoPicker] 🧠 Calculating Heuristic Pick...');
    // 1. Calculate Heuristic (Local)
    console.log(`[AutoPicker] 🏁 Starting Best Card Calculation for pack of ${pack.length} cards...`);

    // 1. Analyze Pool to find top 2 colors
    const colorCounts = { W: 0, U: 0, B: 0, R: 0, G: 0 };
    pool.forEach(card => {
      const weight = this.getRarityWeight(card.rarity);
      const colors = card.colors || [];
      colors.forEach(c => {
        if (colorCounts[c as keyof typeof colorCounts] !== undefined) {
          colorCounts[c as keyof typeof colorCounts] += weight;
        }
      });
    });

    const sortedColors = Object.entries(colorCounts)
      .sort(([, a], [, b]) => b - a)
      .map(([color]) => color);
    const mainColors = sortedColors.slice(0, 2);

    let bestCard: Card | null = null;
    let maxScore = -1;

    pack.forEach(card => {
      let score = 0;
      score += this.getRarityWeight(card.rarity);
      const colors = card.colors || [];
      if (colors.length === 0) {
        score += 2;
      } else {
        const matches = colors.filter(c => mainColors.includes(c)).length;
        if (matches === colors.length) score += 4;
        else if (matches > 0) score += 1;
        else score -= 10;
      }
      if ((card.typeLine || card.type_line || '').includes('Basic Land')) score -= 20;
      if (score > maxScore) {
        maxScore = score;
        bestCard = card;
      }
    });

    const heuristicPick = bestCard || pack[0];
    console.log(`[AutoPicker] 🤖 Heuristic Suggestion: ${heuristicPick.name} (Score: ${maxScore})`);

    // 2. Return Heuristic
    return heuristicPick;

  }

  private static getRarityWeight(rarity?: string): number {
    switch (rarity) {
      case 'mythic': return 5;
      case 'rare': return 4;
      case 'uncommon': return 2;
      default: return 1;
    }
  }
}
