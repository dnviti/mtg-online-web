import { Card } from '../interfaces/DraftInterfaces';

/**
 * Selects the best card from a pack based on the current pool.
 * Uses a heuristic combining rarity, popularity (EDHREC), and color commitment.
 */
export const selectBestCard = (cards: Card[], pool: Card[]): { card: Card, score: number, topColors: string[] } | null => {
  if (cards.length === 0) return null;

  // 1. Analyze Pool Colors
  const colorCounts: Record<string, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  pool.forEach(card => {
    if (card.colors) {
      card.colors.forEach(c => {
        if (colorCounts[c] !== undefined) colorCounts[c]++;
      });
    }
  });

  // Sort colors by frequency
  const sortedColors = Object.entries(colorCounts).sort(([, a], [, b]) => b - a);
  const topColors = sortedColors.slice(0, 2).map(([c]) => c); // Best 2 colors
  const hasCommitment = pool.length >= 5; // Start committing after 5 picks

  // 2. Score Cards
  const scoredCards = cards.map(c => {
    let score = 0;

    // Base: Rarity
    if (c.rarity === 'mythic') score += 5;
    else if (c.rarity === 'rare') score += 4;
    else if (c.rarity === 'uncommon') score += 2;
    else score += 1;

    // Base: EDHREC Rank (Popularity)
    if (c.edhrecRank !== undefined && c.edhrecRank !== null) {
      const rank = c.edhrecRank;
      if (rank < 10000) {
        // Normalize rank 0-10000 to 0-5 points
        score += (5 * (1 - (rank / 10000)));
      }
    }

    // Context: Color Synergy
    if (c.colors && c.colors.length > 0) {
      const matchesTopColor = c.colors.some(col => topColors.includes(col));

      if (hasCommitment) {
        // Heavy bias towards top colors
        if (matchesTopColor) score += 4;

        // Penalize off-color slightly if strict? Or just don't bonus.
        const isOffColor = c.colors.some(col => !topColors.includes(col));
        if (isOffColor && c.colors.length > 1) score -= 1; // Slight penalty for splashing
      } else {
        // Early game: slight bias towards what we have started picking
        if (matchesTopColor) score += 1.5;
      }
    } else {
      // Artifacts/Colorless: always good filler
      score += 2;
    }

    return { card: c, score };
  });

  // 3. Pick Best
  scoredCards.sort((a, b) => b.score - a.score);
  const bestPick = scoredCards[0];

  return { card: bestPick.card, score: bestPick.score, topColors };
};
