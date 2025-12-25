
import { CardInstance, PlayerState } from '../types/game';

// Helper to determine ALL colors a card can produce (Universal)
export const getAvailableManaColors = (card: CardInstance): string[] => {
  // 0. Type Guard for Land (Auto-Tap usually restricts to lands)
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
};

export const parseManaCost = (manaCost: string): { generic: number, colors: Record<string, number>, hybrids: string[][] } => {
  const cost = { generic: 0, colors: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 } as Record<string, number>, hybrids: [] as string[][] };

  if (!manaCost) return cost;

  const matches = manaCost.match(/{[^{}]+}/g);
  if (!matches) return cost;

  matches.forEach(symbol => {
    const content = symbol.replace(/[{}]/g, '');

    if (!isNaN(Number(content))) {
      cost.generic += Number(content);
    }
    else if (content.includes('/')) {
      const parts = content.split('/');
      const options = parts.filter(p => ['W', 'U', 'B', 'R', 'G', 'C'].includes(p));
      if (options.length >= 1) {
        cost.hybrids.push(options);
      }
    }
    else {
      if (['W', 'U', 'B', 'R', 'G', 'C'].includes(content)) {
        cost.colors[content]; // Bug in original: logic was accessing but not incrementing?
        // Wait, original file had: cost.colors[content]++;
        // I must match that.
        if (cost.colors[content] !== undefined) {
          cost.colors[content]++;
        }
      }
    }
  });

  return cost;
};

// Returns a set of card IDs to tap
export const calculateAutoTap = (
  costStr: string,
  player: PlayerState,
  myLands: CardInstance[]
): Set<string> => {
  const landsToTap = new Set<string>();
  const cost = parseManaCost(costStr);

  // Clone pool so we don't mutate state locally
  const pool = { ...player.manaPool };
  if (!pool.W) pool.W = 0; if (!pool.U) pool.U = 0; if (!pool.B) pool.B = 0;
  if (!pool.R) pool.R = 0; if (!pool.G) pool.G = 0; if (!pool.C) pool.C = 0;

  // Filter usable lands (untapped)
  const availableLands = myLands.filter(l => !l.tapped);

  // 1. Pay Colored Costs
  for (const color of ['W', 'U', 'B', 'R', 'G', 'C']) {
    let required = cost.colors[color];
    if (required <= 0) continue;

    // Pool First
    if (pool[color] >= required) {
      pool[color] -= required;
      required = 0;
    } else {
      required -= pool[color];
      pool[color] = 0;
    }

    // Lands
    if (required > 0) {
      // Find producers using Universal Logic
      const producers = availableLands.filter(l => !landsToTap.has(l.instanceId) && getAvailableManaColors(l).includes(color));

      if (producers.length >= required) {
        for (let i = 0; i < required; i++) {
          landsToTap.add(producers[i].instanceId);
        }
        required = 0;
      } else {
        // Cannot pay strictly
        return new Set(); // Fail
      }
    }
  }

  // 2. Pay Hybrid (Greedy)
  for (const options of cost.hybrids) {
    let paid = false;
    for (const color of options) {
      if (pool[color] > 0) {
        pool[color]--;
        paid = true;
        break;
      }
      const land = availableLands.find(l => !landsToTap.has(l.instanceId) && getAvailableManaColors(l).includes(color));
      if (land) {
        landsToTap.add(land.instanceId);
        paid = true;
        break;
      }
    }
    if (!paid) return new Set();
  }

  // 3. Pay Generic
  let genericRequired = cost.generic;
  if (genericRequired > 0) {
    // Pool
    for (const color of Object.keys(pool)) {
      if (genericRequired <= 0) break;
      const available = pool[color];
      if (available > 0) {
        const take = Math.min(available, genericRequired);
        pool[color] -= take;
        genericRequired -= take;
      }
    }
    // Lands
    if (genericRequired > 0) {
      // Filter lands not yet marked for tap that produce ANY valid mana color
      const unusedLands = availableLands.filter(l => !landsToTap.has(l.instanceId) && getAvailableManaColors(l).length > 0);

      if (unusedLands.length >= genericRequired) {
        for (let i = 0; i < genericRequired; i++) {
          landsToTap.add(unusedLands[i].instanceId);
        }
      } else {
        return new Set(); // Fail
      }
    }
  }

  return landsToTap;
};
