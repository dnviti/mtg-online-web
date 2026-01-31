
// Local interface reused from the original service to ensure type compatibility with runtime objects
// This extends the loose shape checking that was present.
export interface AlgorithmCard {
  id: string;
  name: string;
  manaCost?: string;
  mana_cost?: string; // Add this since it's referenced in generateBasicLands
  typeLine?: string; // Standard Scryfall
  type_line?: string;
  types?: string[];
  colors?: string[]; // e.g. ['W', 'U']
  colorIdentity?: string[];
  rarity?: string;
  cmc?: number;
  edhrecRank?: number;
  power?: string;
  toughness?: string;
  image_uris?: { normal: string };
  // Allow flexible properties
  [key: string]: any;
}

/**
 * Builds a deck from a pool of cards using available basic lands.
 * Implements a heuristic-based deck building strategy:
 * 1. Identifies best 2-color combination based on card quality and synergy
 * 2. Selects spells fitting those colors (plus artifacts)
 * 3. Fills a curve (CMC 2-6) with best available cards
 * 4. Adds appropriate basic lands to reach 40 cards
 */
export const buildDeck = (pool: AlgorithmCard[], basicLands: AlgorithmCard[]): AlgorithmCard[] => {
  console.log(`[DeckBuildingAlgorithm] 🤖 Building deck (Pool: ${pool.length} cards)...`);

  // Ensure we have basic lands to work with
  const landsPool = ensureBasicLands(basicLands);

  // Heuristic Logic

  // 1. Identify best 2-color combination
  const bestPair = findBestColorPair(pool);
  console.log(`[DeckBuildingAlgorithm] 🎨 Best pair: ${bestPair.join('/')}`);

  // 2. Filter available spells for that pair + Artifacts
  const mainColors = bestPair;
  let candidates = pool.filter(c => {
    if (isBasicLand(c)) return false; // Exclude basic lands from spell selection
    const colors = c.colors || [];
    if (colors.length === 0) return true; // Artifacts
    return colors.every(col => mainColors.includes(col)); // On-color
  });

  // 3. Score and Select Spells
  const scoredCandidates = candidates.map(c => ({
    card: c,
    score: calculateCardScore(c, mainColors)
  }));

  // Sort Descending
  scoredCandidates.sort((a, b) => b.score - a.score);

  const deckSpells: AlgorithmCard[] = [];
  const TARGET_SPELL_COUNT = 23;

  // Helper for CMC bucketing
  const getCmcBucket = (c: AlgorithmCard) => {
    const val = c.cmc || 0;
    if (val <= 2) return 2;
    if (val >= 6) return 6;
    return val;
  };
  const curveCounts: Record<number, number> = { 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
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

  // Pass 2: Fill remaining slots with best available ignoring curve
  if (deckSpells.length < TARGET_SPELL_COUNT) {
    const remaining = scoredCandidates.filter(item => !deckSpells.includes(item.card));
    for (const item of remaining) {
      if (deckSpells.length >= TARGET_SPELL_COUNT) break;
      deckSpells.push(item.card);
    }
  }

  // 4. Lands
  const deckLands = generateBasicLands(deckSpells, landsPool, 40 - deckSpells.length);

  console.log(`[DeckBuildingAlgorithm] Deck complete: ${deckSpells.length} Spells + ${deckLands.length} Lands.`);
  return [...deckSpells, ...deckLands];
};

// --- Helpers ---

const ensureBasicLands = (provided: AlgorithmCard[]): AlgorithmCard[] => {
  // If we have lands, verify we have at least one of each type if possible, or just return them.
  if (provided && provided.length > 0) return provided;

  // Fallback: Generate dummy basic lands
  console.warn(`[DeckBuildingAlgorithm] ⚠️ No basic lands provided. Generating fallbacks.`);
  const colors = ['W', 'U', 'B', 'R', 'G'];
  const lands: AlgorithmCard[] = [];

  colors.forEach(c => {
    const name = getBasicLandName(c);
    lands.push({
      id: `fallback-land-${c}`,
      name: name,
      typeLine: `Basic Land — ${name}`,
      colors: [],
      rarity: 'common',
      image_uris: { normal: "" },
      scryfallId: `basic-${c}`,
      oracleId: `oracle-basic-${c}`,
      cmc: 0,
      set: 'lea'
    });
  });

  return lands;
};

const findBestColorPair = (pool: AlgorithmCard[]): string[] => {
  const colors = ['W', 'U', 'B', 'R', 'G'];
  const pairs: string[][] = [];

  for (let i = 0; i < colors.length; i++) {
    for (let j = i + 1; j < colors.length; j++) {
      pairs.push([colors[i], colors[j]]);
    }
  }

  let bestPair = ['W', 'U'];
  let maxScore = -1;

  pairs.forEach(pair => {
    const score = evaluateColorPair(pool, pair);
    if (score > maxScore) {
      maxScore = score;
      bestPair = pair;
    }
  });

  return bestPair;
};

const evaluateColorPair = (pool: AlgorithmCard[], pair: string[]): number => {
  let score = 0;
  pool.forEach(c => {
    if (isLand(c)) return;

    const cardColors = c.colors || [];
    if (cardColors.length === 0) {
      score += 0.5; // Artifact
      return;
    }

    const fits = cardColors.every(col => pair.includes(col));
    if (!fits) return;

    let cardVal = 1;
    if (c.rarity === 'uncommon') cardVal += 1.5;
    if (c.rarity === 'rare') cardVal += 3.5;
    if (c.rarity === 'mythic') cardVal += 4.5;

    // Gold/Signpost Boost
    if (cardColors.length === 2 && cardColors.includes(pair[0]) && cardColors.includes(pair[1])) {
      cardVal += 2;
    }

    score += cardVal;
  });
  return score;
};

const calculateCardScore = (c: AlgorithmCard, mainColors: string[]): number => {
  let score = 0;

  // Rarity
  switch (c.rarity) {
    case 'mythic': score = 5.0; break;
    case 'rare': score = 4.0; break;
    case 'uncommon': score = 2.5; break;
    default: score = 1.0; break;
  }

  // Removal Heuristic (Simple text/type check)
  const typeLine = c.typeLine || c.type_line || '';
  if (typeLine.includes('Instant') || typeLine.includes('Sorcery')) {
    score += 0.5;
  }

  // Synergy
  const colors = c.colors || [];
  if (colors.length > 1) {
    score += 0.5;
    if (mainColors.length === 2 && colors.includes(mainColors[0]) && colors.includes(mainColors[1])) {
      score += 1.0;
    }
  }

  // CMC Penalty
  if ((c.cmc || 0) > 6) score -= 0.5;

  // EDHREC
  if (c.edhrecRank !== undefined && c.edhrecRank !== null) {
    const rank = c.edhrecRank;
    if (rank < 10000) {
      score += (3 * (1 - (rank / 10000)));
    }
  }

  return score;
};

const generateBasicLands = (deckSpells: AlgorithmCard[], basicLandPool: AlgorithmCard[], countNeeded: number): AlgorithmCard[] => {
  const deckLands: AlgorithmCard[] = [];
  if (countNeeded <= 0) return deckLands;

  const pips = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  deckSpells.forEach(c => {
    const cost = c.manaCost || c.mana_cost || '';
    if (cost.includes('W')) pips.W += (cost.match(/W/g) || []).length;
    if (cost.includes('U')) pips.U += (cost.match(/U/g) || []).length;
    if (cost.includes('B')) pips.B += (cost.match(/B/g) || []).length;
    if (cost.includes('R')) pips.R += (cost.match(/R/g) || []).length;
    if (cost.includes('G')) pips.G += (cost.match(/G/g) || []).length;
  });

  const totalPips = Object.values(pips).reduce((a, b) => a + b, 0) || 1;

  const allocation = {
    W: Math.round((pips.W / totalPips) * countNeeded),
    U: Math.round((pips.U / totalPips) * countNeeded),
    B: Math.round((pips.B / totalPips) * countNeeded),
    R: Math.round((pips.R / totalPips) * countNeeded),
    G: Math.round((pips.G / totalPips) * countNeeded),
  };

  // Adjust rounding
  let currentTotal = Object.values(allocation).reduce((a, b) => a + b, 0);
  while (currentTotal < countNeeded) {
    const topColor = Object.entries(allocation).sort((a, b) => b[1] - a[1])[0][0];
    allocation[topColor as keyof typeof allocation]++;
    currentTotal++;
  }
  while (currentTotal > countNeeded) {
    const topColor = Object.entries(allocation).sort((a, b) => b[1] - a[1])[0][0];
    if (allocation[topColor as keyof typeof allocation] > 0) {
      allocation[topColor as keyof typeof allocation]--;
    } else {
      // Just pick first non-zero
      const any = Object.keys(allocation).find(k => allocation[k as keyof typeof allocation] > 0);
      if (any) allocation[any as keyof typeof allocation]--;
    }
    currentTotal--;
  }

  // Create Cards
  Object.entries(allocation).forEach(([color, qty]) => {
    if (qty <= 0) return;
    const landName = getBasicLandName(color);

    // Find source
    let source = basicLandPool.find(l => l.name === landName)
      || basicLandPool.find(l => l.name.includes(landName))
      || basicLandPool[0]; // Absolute fallback

    for (let i = 0; i < qty; i++) {
      deckLands.push({
        ...source,
        name: landName, // Ensure name correctness
        typeLine: `Basic Land — ${landName}`,
        id: `bot-land-${color}-${Date.now()}-${Math.random().toString(36).substring(7)}`,
        // Ensure critical props
        cmc: 0,
        rarity: 'common'
      });
    }
  });

  return deckLands;
};

const isLand = (c: AlgorithmCard): boolean => {
  const t = c.typeLine || c.type_line || '';
  return t.includes('Land');
};

const isBasicLand = (c: AlgorithmCard): boolean => {
  const t = c.typeLine || c.type_line || '';
  return t.includes('Basic Land');
};

const getBasicLandName = (color: string): string => {
  switch (color) {
    case 'W': return 'Plains';
    case 'U': return 'Island';
    case 'B': return 'Swamp';
    case 'R': return 'Mountain';
    case 'G': return 'Forest';
    default: return 'Wastes';
  }
};
