
import { CardInstance, PlayerState } from '../types/game';

// Helper to determine land color identity from type line or name
export const getLandColor = (card: CardInstance): string | null => {
  const typeLine = card.typeLine || '';
  const types = card.types || [];

  if (!typeLine.includes('Land') && !types.includes('Land')) return null;

  if (typeLine.includes('Plains')) return 'W';
  if (typeLine.includes('Island')) return 'U';
  if (typeLine.includes('Swamp')) return 'B';
  if (typeLine.includes('Mountain')) return 'R';
  if (typeLine.includes('Forest')) return 'G';

  // TODO: Wastes
  return null;
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
        cost.colors[content]++;
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
  // We only consider lands that haven't been marked for tap yet (initially none)
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
      const producers = availableLands.filter(l => !landsToTap.has(l.instanceId) && getLandColor(l) === color);
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
      const land = availableLands.find(l => !landsToTap.has(l.instanceId) && getLandColor(l) === color);
      if (land) {
        landsToTap.add(land.instanceId);
        paid = true;
        break;
      }
    }
    // If greedy fail, we might fail overall. 
    // Real auto-tapper might backtrack, but for preview/MVP we match server greedy logic.
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
      const unusedLands = availableLands.filter(l => !landsToTap.has(l.instanceId) && getLandColor(l) !== null);
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
