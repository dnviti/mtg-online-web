
import { ScryfallCard } from './ScryfallService';

export interface DraftCard {
  id: string; // Internal UUID
  scryfallId: string;
  name: string;
  rarity: string;
  typeLine?: string;
  layout?: string;
  colors: string[];
  image: string;
  imageArtCrop?: string;
  set: string;
  setCode: string;
  setType: string;
  finish?: 'foil' | 'normal';
  [key: string]: any; // Allow extended props
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
  lands: DraftCard[];
  tokens: DraftCard[];
}

export interface SetsMap {
  [code: string]: {
    name: string;
    code: string;
    commons: DraftCard[];
    uncommons: DraftCard[];
    rares: DraftCard[];
    mythics: DraftCard[];
    lands: DraftCard[];
    tokens: DraftCard[];
  }
}

export interface PackGenerationSettings {
  mode: 'mixed' | 'by_set';
  rarityMode: 'peasant' | 'standard'; // Peasant: 10C/3U, Standard: 10C/3U/1R
  withReplacement?: boolean; // If true, pools are refilled/reshuffled for each pack (unlimited generation)
}

export class PackGeneratorService {

  processCards(cards: ScryfallCard[], filters: { ignoreBasicLands: boolean, ignoreCommander: boolean, ignoreTokens: boolean }): { pools: ProcessedPools, sets: SetsMap } {
    console.time('processCards');
    const pools: ProcessedPools = { commons: [], uncommons: [], rares: [], mythics: [], lands: [], tokens: [] };
    const setsMap: SetsMap = {};

    let processedCount = 0;

    // Server side doesn't need "useLocalImages" flag logic typically, or we construct local URL here.
    // For now, we assume we return absolute URLs or relative to server.
    // Use Scryfall URLs by default or if cached locally, point to /cards/images/ID.jpg

    // We'll point to /cards/images/ID.jpg if we assume they are cached.
    // But safely: return scryfall URL if not sure?
    // User requested "optimize", serving local static files is usually faster than hotlinking if network is slow, 
    // but hotlinking scryfall is zero-load on our server IO.
    // Let's stick to what the client code did: accept a flag or default. 
    // Let's default to standard URLs for now to minimize complexity, or local if we are sure.
    // We'll stick to Scryfall URLs to ensure images load immediately even if not cached yet. 
    // Optimization is requested for GENERATION speed (algorithm), not image loading speed per se (though related).

    cards.forEach(cardData => {
      const rarity = cardData.rarity;
      const typeLine = cardData.type_line || '';
      const setType = cardData.set_type;
      const layout = cardData.layout;

      // Filters
      if (filters.ignoreCommander) {
        if (['commander', 'starter', 'duel_deck', 'premium_deck', 'planechase', 'archenemy'].includes(setType)) return;
      }

      const cardObj: DraftCard = {
        // Copy base properties first
        ...cardData,
        // Overwrite/Set specific Draft properties
        id: crypto.randomUUID(),
        scryfallId: cardData.id,
        name: cardData.name,
        rarity: rarity,
        typeLine: typeLine,
        layout: layout,
        colors: cardData.colors || [],
        image: cardData.image_uris?.normal || cardData.card_faces?.[0]?.image_uris?.normal || '',
        imageArtCrop: cardData.image_uris?.art_crop || cardData.card_faces?.[0]?.image_uris?.art_crop || '',
        set: cardData.set_name,
        setCode: cardData.set,
        setType: setType,
        finish: cardData.finish || 'normal',
      };

      // Add to pools
      if (rarity === 'common') pools.commons.push(cardObj);
      else if (rarity === 'uncommon') pools.uncommons.push(cardObj);
      else if (rarity === 'rare') pools.rares.push(cardObj);
      else if (rarity === 'mythic') pools.mythics.push(cardObj);

      // Add to Sets Map
      if (!setsMap[cardData.set]) {
        setsMap[cardData.set] = { name: cardData.set_name, code: cardData.set, commons: [], uncommons: [], rares: [], mythics: [], lands: [], tokens: [] };
      }
      const setEntry = setsMap[cardData.set];

      const isLand = typeLine.includes('Land');
      const isBasic = typeLine.includes('Basic');
      const isToken = layout === 'token' || typeLine.includes('Token') || layout === 'art_series' || layout === 'emblem';

      if (isToken) {
        if (!filters.ignoreTokens) {
          pools.tokens.push(cardObj);
          setEntry.tokens.push(cardObj);
        }
      } else if (isBasic || (isLand && rarity === 'common')) {
        // Slot 12 Logic: Basic or Common Dual Land
        if (filters.ignoreBasicLands && isBasic) {
          // Skip basic lands if ignored
        } else {
          pools.lands.push(cardObj);
          setEntry.lands.push(cardObj);
        }
      } else {
        if (rarity === 'common') { pools.commons.push(cardObj); setEntry.commons.push(cardObj); }
        else if (rarity === 'uncommon') { pools.uncommons.push(cardObj); setEntry.uncommons.push(cardObj); }
        else if (rarity === 'rare') { pools.rares.push(cardObj); setEntry.rares.push(cardObj); }
        else if (rarity === 'mythic') { pools.mythics.push(cardObj); setEntry.mythics.push(cardObj); }
      }

      processedCount++;
    });

    console.log(`[PackGenerator] Processed ${processedCount} cards.`);
    console.timeEnd('processCards');
    return { pools, sets: setsMap };
  }

  generatePacks(pools: ProcessedPools, sets: SetsMap, settings: PackGenerationSettings, numPacks: number): Pack[] {
    console.time('generatePacks');
    console.log('[PackGenerator] Starting generation:', { mode: settings.mode, rarity: settings.rarityMode, count: numPacks, infinite: settings.withReplacement });

    // Optimize: Deep clone only what's needed? 
    // Actually, we destructively modify lists in the algo (shifting/drawing), so we must clone the arrays of specific pools we use.
    // The previous implementation cloned inside the loop or function.

    let newPacks: Pack[] = [];

    if (settings.mode === 'mixed') {
      // Mixed Mode (Chaos)
      // Initial Shuffle of the master pools
      let currentPools = {
        commons: this.shuffle([...pools.commons]),
        uncommons: this.shuffle([...pools.uncommons]),
        rares: this.shuffle([...pools.rares]),
        mythics: this.shuffle([...pools.mythics]),
        lands: this.shuffle([...pools.lands]),
        tokens: this.shuffle([...pools.tokens])
      };

      // Log pool sizes
      console.log('[PackGenerator] Pool stats:', {
        c: currentPools.commons.length,
        u: currentPools.uncommons.length,
        r: currentPools.rares.length,
        m: currentPools.mythics.length
      });

      for (let i = 1; i <= numPacks; i++) {
        // If infinite, we reset the pools for every pack (using a fresh shuffle of original pools)
        let packPools = currentPools;
        if (settings.withReplacement) {
          packPools = {
            commons: this.shuffle([...pools.commons]),
            uncommons: this.shuffle([...pools.uncommons]),
            rares: this.shuffle([...pools.rares]),
            mythics: this.shuffle([...pools.mythics]),
            lands: this.shuffle([...pools.lands]),
            tokens: this.shuffle([...pools.tokens])
          };
        }

        const result = this.buildSinglePack(packPools, i, 'Chaos Pack', settings.rarityMode, settings.withReplacement);

        if (result) {
          newPacks.push(result);
          if (!settings.withReplacement) {
            // If not infinite, we must persist the depleting state
            // This assumes buildSinglePack MODIFIED packPools in place (via reassigning properties).
            // However, packPools is a shallow clone of currentPools if (settings.infinite) was false?
            // Wait. 'let packPools = currentPools' is a reference copy.
            // buildSinglePack reassigns properties of packPools.
            // e.g. packPools.commons = ...
            // This mutates the object 'packPools'.
            // If 'packPools' IS 'currentPools', then 'currentPools' is mutated. Correct.
          }
        } else {
          if (!settings.withReplacement) {
            console.warn(`[PackGenerator] Warning: ran out of cards at pack ${i}`);
            break;
          } else {
            // Should not happen with replacement unless pools are intrinsically empty
            console.warn(`[PackGenerator] Infinite mode but failed to generate pack ${i} (empty source?)`);
          }
        }

        if (i % 50 === 0) console.log(`[PackGenerator] Built ${i} packs...`);
      }

    } else {
      // By Set
      // Logic: Distribute requested numPacks across available sets? Or generate boxes per set?
      // Usage usually implies: "Generate X packs form these selected sets".
      // If 3 boxes selected, caller calls this per set? Or calls with total?
      // The client code previously iterated selectedSets.
      // Helper "generateBoosterBox" exists.

      // We will assume "pools" contains ALL cards, and "sets" contains partitioned.
      // If the user wants specific sets, they filtering "sets" map before passing or we iterate keys of "sets".

      const setKeys = Object.keys(sets);
      if (setKeys.length === 0) return [];

      const packsPerSet = Math.ceil(numPacks / setKeys.length);

      let packId = 1;
      for (const setCode of setKeys) {
        const data = sets[setCode];
        console.log(`[PackGenerator] Generating ${packsPerSet} packs for set ${data.name}`);

        // Initial Shuffle
        let currentPools = {
          commons: this.shuffle([...data.commons]),
          uncommons: this.shuffle([...data.uncommons]),
          rares: this.shuffle([...data.rares]),
          mythics: this.shuffle([...data.mythics]),
          lands: this.shuffle([...data.lands]),
          tokens: this.shuffle([...data.tokens])
        };

        let packsGeneratedForSet = 0;
        let attempts = 0;
        const maxAttempts = packsPerSet * 5; // Prevent infinite loop

        while (packsGeneratedForSet < packsPerSet && attempts < maxAttempts) {
          if (packId > numPacks) break;
          attempts++;

          let packPools = currentPools;
          if (settings.withReplacement) {
            // Refresh pools for every pack from the source data
            packPools = {
              commons: this.shuffle([...data.commons]),
              uncommons: this.shuffle([...data.uncommons]),
              rares: this.shuffle([...data.rares]),
              mythics: this.shuffle([...data.mythics]),
              lands: this.shuffle([...data.lands]),
              tokens: this.shuffle([...data.tokens])
            };
          }

          const result = this.buildSinglePack(packPools, packId, data.name, settings.rarityMode, settings.withReplacement);
          if (result) {
            newPacks.push(result);
            packId++;
            packsGeneratedForSet++;
          } else {
            // only warn occasionally or if persistent
            if (!settings.withReplacement) {
              console.warn(`[PackGenerator] Set ${data.name} depleted at pack ${packId}`);
              break; // Cannot generate more from this set
            }
          }
        }
      }
    }

    console.log(`[PackGenerator] Generated ${newPacks.length} packs total.`);
    console.timeEnd('generatePacks');
    return newPacks;
  }

  private buildSinglePack(pools: ProcessedPools, packId: number, setName: string, rarityMode: 'peasant' | 'standard', withReplacement: boolean = false): Pack | null {
    const packCards: DraftCard[] = [];
    const namesInPack = new Set<string>();

    // Standard: 14 cards exactly. Peasant: 13 cards exactly.
    const targetSize = rarityMode === 'peasant' ? 13 : 14;

    // Helper to abstract draw logic
    const draw = (pool: DraftCard[], count: number, poolKey: keyof ProcessedPools) => {
      const result = this.drawCards(pool, count, namesInPack, withReplacement);
      if (result.selected.length > 0) {
        packCards.push(...result.selected);
        if (!withReplacement) {
          // @ts-ignore
          pools[poolKey] = result.remainingPool; // Update ref only if not infinite
          result.selected.forEach(c => namesInPack.add(c.name));
        }
      }
      return result.selected;
    };

    // 1. Commons (6)
    draw(pools.commons, 6, 'commons');

    // 2. Slot 7 (Common or List)
    const roll7 = Math.random() * 100;
    if (roll7 < 87) {
      // Common
      draw(pools.commons, 1, 'commons');
    } else {
      // Uncommon/List
      // If pool empty, try fallback if standard? No, strict as per previous instruction.
      draw(pools.uncommons, 1, 'uncommons');
    }

    // 3. Uncommons (3 or 4 dependent on PEASANT vs STANDARD)
    const uNeeded = rarityMode === 'peasant' ? 4 : 3;
    draw(pools.uncommons, uNeeded, 'uncommons');

    // 4. Rare/Mythic (Standard Only)
    if (rarityMode === 'standard') {
      const isMythic = Math.random() < 0.125;
      let pickedR = false;

      if (isMythic && pools.mythics.length > 0) {
        const sel = draw(pools.mythics, 1, 'mythics');
        if (sel.length) pickedR = true;
      }

      if (!pickedR && pools.rares.length > 0) {
        draw(pools.rares, 1, 'rares');
      }
    }

    // 5. Land
    const isFoilLand = Math.random() < 0.2;
    if (pools.lands.length > 0) {
      // For lands, we generally want random basic lands anyway even in finite cubes if possible?
      // But adhering to 'withReplacement' logic strictly.
      const res = this.drawCards(pools.lands, 1, namesInPack, withReplacement);
      if (res.selected.length) {
        const l = { ...res.selected[0] };
        if (isFoilLand) l.finish = 'foil';
        packCards.push(l);
        if (!withReplacement) {
          pools.lands = res.remainingPool;
          namesInPack.add(l.name);
        }
      }
    }

    // 6. Wildcards (2 slots) + Foil Wildcard
    for (let i = 0; i < 2; i++) {
      const isFoil = i === 1; // 2nd is foil
      const wRoll = Math.random() * 100;
      let targetPool = pools.commons;
      let targetKey: keyof ProcessedPools = 'commons';

      if (rarityMode === 'peasant') {
        if (wRoll > 60) { targetPool = pools.uncommons; targetKey = 'uncommons'; }
        else { targetPool = pools.commons; targetKey = 'commons'; }
      } else {
        if (wRoll > 87) { targetPool = pools.mythics; targetKey = 'mythics'; }
        else if (wRoll > 74) { targetPool = pools.rares; targetKey = 'rares'; }
        else if (wRoll > 50) { targetPool = pools.uncommons; targetKey = 'uncommons'; }
      }

      let res = this.drawCards(targetPool, 1, namesInPack, withReplacement);

      // FALLBACK LOGIC for Wildcards (Standard Only mostly)
      // If we failed to get a card from target pool (e.g. rolled Mythic but set has none), try lower rarity
      if (!res.success && rarityMode === 'standard') {
        if (targetKey === 'mythics' && pools.rares.length) { res = this.drawCards(pools.rares, 1, namesInPack, withReplacement); targetKey = 'rares'; }
        else if (targetKey === 'rares' && pools.uncommons.length) { res = this.drawCards(pools.uncommons, 1, namesInPack, withReplacement); targetKey = 'uncommons'; }
        else if (targetKey === 'uncommons' && pools.commons.length) { res = this.drawCards(pools.commons, 1, namesInPack, withReplacement); targetKey = 'commons'; }
      }

      if (res.selected.length) {
        const c = { ...res.selected[0] };
        if (isFoil) c.finish = 'foil';
        packCards.push(c);
        if (!withReplacement) {
          // @ts-ignore
          pools[targetKey] = res.remainingPool;
          namesInPack.add(c.name);
        }
      }
    }

    // 7. Token (Slot 15)
    if (pools.tokens.length > 0) {
      draw(pools.tokens, 1, 'tokens');
    }

    // Sort
    const getWeight = (c: DraftCard) => {
      if (c.layout === 'token') return 0;
      if (c.typeLine?.includes('Land')) return 1;
      if (c.rarity === 'common') return 2;
      if (c.rarity === 'uncommon') return 3;
      if (c.rarity === 'rare') return 4;
      if (c.rarity === 'mythic') return 5;
      return 1;
    }

    packCards.sort((a, b) => getWeight(b) - getWeight(a));

    // ENFORCE SIZE STRICTLY
    const finalCards = packCards.slice(0, targetSize);

    // Strict Validation
    if (finalCards.length < targetSize) {
      return null;
    }

    return {
      id: packId,
      setName: setName,
      cards: finalCards
    };
  }

  // Unified Draw Method
  private drawCards(pool: DraftCard[], count: number, existingNames: Set<string>, withReplacement: boolean) {
    if (pool.length === 0) return { selected: [], remainingPool: pool, success: false };

    if (withReplacement) {
      // Infinite Mode: Pick random cards, allow duplicates, do not modify pool
      const selected: DraftCard[] = [];
      for (let i = 0; i < count; i++) {
        const randomIndex = Math.floor(Math.random() * pool.length);
        // Deep clone to ensure unique IDs if picking same card twice?
        // Service assigns unique ID during processCards, but if we pick same object ref twice...
        // We should clone to be safe, especially if we mutate it later (foil).
        const card = { ...pool[randomIndex] };
        card.id = crypto.randomUUID(); // Ensure unique ID for this instance in pack
        selected.push(card);
      }
      return { selected, remainingPool: pool, success: true };
    } else {
      // Finite Mode: Unique, remove from pool
      const selected: DraftCard[] = [];
      const skipped: DraftCard[] = [];
      let poolIndex = 0;

      while (selected.length < count && poolIndex < pool.length) {
        const card = pool[poolIndex];
        poolIndex++;

        if (!existingNames.has(card.name)) {
          selected.push(card);
          existingNames.add(card.name);
        } else {
          skipped.push(card);
        }
      }

      const remaining = pool.slice(poolIndex).concat(skipped);
      return { selected, remainingPool: remaining, success: selected.length === count };
    }
  }

  private shuffle(array: any[]) {
    let currentIndex = array.length, randomIndex;
    while (currentIndex !== 0) {
      randomIndex = Math.floor(Math.random() * currentIndex);
      currentIndex--;
      [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
    }
    return array;
  }
}
