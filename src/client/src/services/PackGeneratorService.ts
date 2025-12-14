import { ScryfallCard } from './ScryfallService';

export interface DraftCard {
  id: string; // Internal UUID
  scryfallId: string;
  name: string;
  rarity: string;
  colors: string[];
  image: string;
  set: string;
  setCode: string;
  setType: string;
}

export interface Pack {
  id: number;
  setName: string;
  cards: DraftCard[];
}

export interface ProcessedPools {
  commons: DraftCard[];
  uncommons: DraftCard[];
  rares: DraftCard[];
  mythics: DraftCard[];
}

export interface SetsMap {
  [code: string]: {
    name: string;
    code: string;
    commons: DraftCard[];
    uncommons: DraftCard[];
    rares: DraftCard[];
    mythics: DraftCard[];
  }
}

export interface PackGenerationSettings {
  mode: 'mixed' | 'by_set';
  rarityMode: 'peasant' | 'standard'; // Peasant: 10C/3U, Standard: 10C/3U/1R
}

export class PackGeneratorService {

  processCards(cards: ScryfallCard[], filters: { ignoreBasicLands: boolean, ignoreCommander: boolean, ignoreTokens: boolean }): { pools: ProcessedPools, sets: SetsMap } {
    const pools: ProcessedPools = { commons: [], uncommons: [], rares: [], mythics: [] };
    const setsMap: SetsMap = {};

    cards.forEach(cardData => {
      const rarity = cardData.rarity;
      const typeLine = cardData.type_line || '';
      const setType = cardData.set_type;
      const layout = cardData.layout;

      // Filters
      if (filters.ignoreBasicLands && typeLine.includes('Basic')) return;
      if (filters.ignoreCommander) {
        if (['commander', 'starter', 'duel_deck', 'premium_deck', 'planechase', 'archenemy'].includes(setType)) return;
      }
      if (filters.ignoreTokens) {
        if (layout === 'token' || layout === 'art_series' || layout === 'emblem') return;
      }

      const cardObj: DraftCard = {
        id: this.generateUUID(),
        scryfallId: cardData.id,
        name: cardData.name,
        rarity: rarity,
        colors: cardData.colors || [],
        image: cardData.image_uris?.normal || cardData.card_faces?.[0]?.image_uris?.normal || '',
        set: cardData.set_name,
        setCode: cardData.set,
        setType: setType
      };

      // Add to pools
      if (rarity === 'common') pools.commons.push(cardObj);
      else if (rarity === 'uncommon') pools.uncommons.push(cardObj);
      else if (rarity === 'rare') pools.rares.push(cardObj);
      else if (rarity === 'mythic') pools.mythics.push(cardObj);

      // Add to Sets Map
      if (!setsMap[cardData.set]) {
        setsMap[cardData.set] = { name: cardData.set_name, code: cardData.set, commons: [], uncommons: [], rares: [], mythics: [] };
      }
      const setEntry = setsMap[cardData.set];
      if (rarity === 'common') setEntry.commons.push(cardObj);
      else if (rarity === 'uncommon') setEntry.uncommons.push(cardObj);
      else if (rarity === 'rare') setEntry.rares.push(cardObj);
      else if (rarity === 'mythic') setEntry.mythics.push(cardObj);
    });

    return { pools, sets: setsMap };
  }

  generatePacks(pools: ProcessedPools, sets: SetsMap, settings: PackGenerationSettings): Pack[] {
    let newPacks: Pack[] = [];

    if (settings.mode === 'mixed') {
      let currentPools = {
        commons: this.shuffle(pools.commons),
        uncommons: this.shuffle(pools.uncommons),
        rares: this.shuffle(pools.rares),
        mythics: this.shuffle(pools.mythics)
      };

      let packId = 1;
      while (true) {
        const result = this.buildSinglePack(currentPools, packId, 'Chaos / Mixed', settings.rarityMode);
        if (!result) {
          break;
        }
        newPacks.push(result.pack);
        currentPools = result.remainingPools;
        packId++;
      }
    } else {
      // By Set
      let packId = 1;
      const sortedSetKeys = Object.keys(sets).sort();

      sortedSetKeys.forEach(setCode => {
        const setData = sets[setCode];
        let currentPools = {
          commons: this.shuffle(setData.commons),
          uncommons: this.shuffle(setData.uncommons),
          rares: this.shuffle(setData.rares),
          mythics: this.shuffle(setData.mythics)
        };

        while (true) {
          const result = this.buildSinglePack(currentPools, packId, setData.name, settings.rarityMode);
          if (!result) break;
          newPacks.push(result.pack);
          currentPools = result.remainingPools;
          packId++;
        }
      });
    }

    return newPacks;
  }

  private buildSinglePack(pools: ProcessedPools, packId: number, setName: string, rarityMode: 'peasant' | 'standard') {
    const packCards: DraftCard[] = [];
    let currentPools = { ...pools };
    const namesInThisPack = new Set<string>();

    const COMMONS_COUNT = 10;
    const UNCOMMONS_COUNT = 3;

    if (rarityMode === 'standard') {
      const isMythicDrop = Math.random() < 0.125;
      let rareSuccess = false;

      if (isMythicDrop && currentPools.mythics.length > 0) {
        const drawM = this.drawUniqueCards(currentPools.mythics, 1, namesInThisPack);
        if (drawM.success) {
          packCards.push(...drawM.selected);
          currentPools.mythics = drawM.remainingPool;
          drawM.selected.forEach(c => namesInThisPack.add(c.name));
          rareSuccess = true;
        }
      } else if (!rareSuccess && currentPools.rares.length > 0) {
        const drawR = this.drawUniqueCards(currentPools.rares, 1, namesInThisPack);
        if (drawR.success) {
          packCards.push(...drawR.selected);
          currentPools.rares = drawR.remainingPool;
          drawR.selected.forEach(c => namesInThisPack.add(c.name));
          rareSuccess = true;
        }
      } else if (currentPools.mythics.length > 0) {
        // Fallback to mythic if no rare available
        const drawM = this.drawUniqueCards(currentPools.mythics, 1, namesInThisPack);
        if (drawM.success) {
          packCards.push(...drawM.selected);
          currentPools.mythics = drawM.remainingPool;
          drawM.selected.forEach(c => namesInThisPack.add(c.name));
        }
      }
    }

    const drawU = this.drawUniqueCards(currentPools.uncommons, UNCOMMONS_COUNT, namesInThisPack);
    if (!drawU.success) return null;
    packCards.push(...drawU.selected);
    currentPools.uncommons = drawU.remainingPool;
    drawU.selected.forEach(c => namesInThisPack.add(c.name));

    const drawC = this.drawUniqueCards(currentPools.commons, COMMONS_COUNT, namesInThisPack);
    if (!drawC.success) return null;
    packCards.push(...drawC.selected);
    currentPools.commons = drawC.remainingPool;

    const rarityWeight: { [key: string]: number } = { 'mythic': 4, 'rare': 3, 'uncommon': 2, 'common': 1 };
    packCards.sort((a, b) => rarityWeight[b.rarity] - rarityWeight[a.rarity]);

    return { pack: { id: packId, setName, cards: packCards }, remainingPools: currentPools };
  }

  private drawUniqueCards(pool: DraftCard[], count: number, existingNames: Set<string>) {
    const selected: DraftCard[] = [];
    const skipped: DraftCard[] = [];
    const namesInPack = new Set(existingNames);
    const workingPool = [...pool];

    while (selected.length < count && workingPool.length > 0) {
      const card = workingPool.shift()!;
      if (!namesInPack.has(card.name)) {
        selected.push(card);
        namesInPack.add(card.name);
      } else {
        skipped.push(card);
      }
    }
    const remainingPool = [...workingPool, ...skipped];
    return { selected, remainingPool, success: selected.length === count };
  }

  generateBoosterBox(setCards: ProcessedPools, numberOfPacks: number, settings: PackGenerationSettings): Pack[] {
    const packs: Pack[] = [];
    for (let i = 1; i <= numberOfPacks; i++) {
      const newPack = this.buildTokenizedPack(setCards, i, 'Booster', settings.rarityMode);
      if (newPack) packs.push(newPack);
    }
    return packs;
  }

  private buildTokenizedPack(pools: ProcessedPools, packId: number, setName: string, rarityMode: 'peasant' | 'standard'): Pack | null {
    const packCards: DraftCard[] = [];
    const namesInThisPack = new Set<string>();

    const COMMONS_COUNT = 10;
    const UNCOMMONS_COUNT = 3;

    if (rarityMode === 'standard') {
      // Rare/Mythic logic
      const isMythic = Math.random() < 0.125;
      let rPool = isMythic ? pools.mythics : pools.rares;
      if (rPool.length === 0) rPool = pools.rares; // Fallback
      if (rPool.length === 0) rPool = pools.mythics; // Fallback

      if (rPool.length > 0) {
        const pick = this.sampleUnique(rPool, 1, namesInThisPack);
        if (pick.length) {
          packCards.push(...pick);
          namesInThisPack.add(pick[0].name);
        }
      }
    }

    // Uncommons
    const uPicks = this.sampleUnique(pools.uncommons, UNCOMMONS_COUNT, namesInThisPack);
    packCards.push(...uPicks);
    uPicks.forEach(p => namesInThisPack.add(p.name));

    // Commons
    const cPicks = this.sampleUnique(pools.commons, COMMONS_COUNT, namesInThisPack);
    packCards.push(...cPicks);

    if (packCards.length < (rarityMode === 'standard' ? 14 : 13)) return null;

    // Sort
    const rarityWeight: { [key: string]: number } = { 'mythic': 4, 'rare': 3, 'uncommon': 2, 'common': 1 };
    packCards.sort((a, b) => (rarityWeight[b.rarity] || 0) - (rarityWeight[a.rarity] || 0));

    return { id: packId, setName: setName, cards: packCards };
  }

  private sampleUnique(pool: DraftCard[], count: number, excludeNames: Set<string>): DraftCard[] {
    // Filter out excluded names
    const candidates = pool.filter(c => !excludeNames.has(c.name));
    if (candidates.length < count) {
      // Not enough unique cards, just take what we have
      return candidates;
    }

    const picked: DraftCard[] = [];
    const indices = new Set<number>();

    while (picked.length < count) {
      const idx = Math.floor(Math.random() * candidates.length);
      if (!indices.has(idx)) {
        indices.add(idx);
        picked.push(candidates[idx]);
      }
    }
    return picked;
  }

  private shuffle(array: any[]) {
    let currentIndex = array.length, randomIndex;
    const newArray = [...array];
    while (currentIndex !== 0) {
      randomIndex = Math.floor(Math.random() * currentIndex);
      currentIndex--;
      [newArray[currentIndex], newArray[randomIndex]] = [newArray[randomIndex], newArray[currentIndex]];
    }
    return newArray;
  }

  private generateUUID(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    // Fallback for insecure contexts or older browsers
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
}
