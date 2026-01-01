import { ScryfallCard } from './ScryfallService';

export interface DraftCard {
  id: string; // Internal UUID
  scryfallId: string;
  name: string;
  rarity: string;
  typeLine?: string; // Add typeLine to interface for sorting
  layout?: string; // Add layout
  colors: string[];
  image: string;
  imageArtCrop?: string;
  set: string;
  setCode: string;
  setType: string;
  finish?: 'foil' | 'normal';
  edhrecRank?: number; // Added EDHREC Rank
  // Extended Metadata
  cmc?: number;
  manaCost?: string;
  oracleText?: string;
  power?: string;
  toughness?: string;
  collectorNumber?: string;
  colorIdentity?: string[];
  keywords?: string[];
  booster?: boolean;
  promo?: boolean;
  reprint?: boolean;
  isLandSource?: boolean;

  // New Metadata
  legalities?: { [key: string]: string };
  finishes?: string[];
  games?: string[];
  produced_mana?: string[];
  artist?: string;
  released_at?: string;
  frame_effects?: string[];
  security_stamp?: string;
  promoTypes?: string[];
  cardFaces?: { name: string; image: string; manaCost: string; typeLine: string; oracleText?: string }[];
  fullArt?: boolean;
  textless?: boolean;
  variation?: boolean;
  scryfallUri?: string;
  definition: ScryfallCard;
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
  specialGuests: DraftCard[];
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
    specialGuests: DraftCard[];
  }
}

export interface PackGenerationSettings {
  mode: 'mixed' | 'by_set';
  rarityMode: 'peasant' | 'standard'; // Peasant: 10C/3U, Standard: 10C/3U/1R
  withReplacement?: boolean;
}

export class PackGeneratorService {

  processCards(cards: ScryfallCard[], filters: { ignoreBasicLands: boolean, ignoreCommander: boolean, ignoreTokens: boolean }, useLocalImages: boolean = false, setsMetadata: { [code: string]: { parent_set_code?: string } } = {}): { pools: ProcessedPools, sets: SetsMap } {
    const pools: ProcessedPools = { commons: [], uncommons: [], rares: [], mythics: [], lands: [], tokens: [], specialGuests: [] };
    const setsMap: SetsMap = {};

    // 1. First Pass: Organize into SetsMap
    cards.forEach(cardData => {
      const rarity = cardData.rarity;
      const typeLine = cardData.type_line || '';
      const setType = cardData.set_type;
      const layout = cardData.layout;

      // Filters
      // if (filters.ignoreBasicLands && typeLine.includes('Basic')) return; // Now collected in 'lands' pool
      if (filters.ignoreCommander) {
        if (['commander', 'starter', 'duel_deck', 'premium_deck', 'planechase', 'archenemy'].includes(setType)) return;
      }
      // if (filters.ignoreTokens) ... // Now collected in 'tokens' pool

      const cardObj: DraftCard = {
        id: this.generateUUID(),
        scryfallId: cardData.id,
        name: cardData.name,
        rarity: rarity,
        typeLine: typeLine,
        layout: layout,
        colors: cardData.colors || [],
        image: (useLocalImages && cardData.local_path_full)
          ? `${window.location.origin}${cardData.local_path_full}`
          : (cardData.image_uris?.normal || cardData.card_faces?.[0]?.image_uris?.normal || ''),
        imageArtCrop: (useLocalImages && cardData.local_path_crop)
          ? `${window.location.origin}${cardData.local_path_crop}`
          : (cardData.image_uris?.art_crop || cardData.card_faces?.[0]?.image_uris?.art_crop || ''),
        set: cardData.set_name,
        setCode: cardData.set,
        setType: setType,
        finish: cardData.finish,
        edhrecRank: cardData.edhrec_rank, // Map EDHREC Rank
        // Extended Metadata mapping
        cmc: cardData.cmc,
        manaCost: cardData.mana_cost,
        oracleText: cardData.oracle_text,
        power: cardData.power,
        toughness: cardData.toughness,
        collectorNumber: cardData.collector_number,
        colorIdentity: cardData.color_identity,
        keywords: cardData.keywords,
        booster: cardData.booster,
        promo: cardData.promo,
        reprint: cardData.reprint,
        // Extended Mapping
        legalities: cardData.legalities,
        finishes: cardData.finishes,
        games: cardData.games,
        produced_mana: cardData.produced_mana,
        artist: cardData.artist,
        released_at: cardData.released_at,
        frame_effects: cardData.frame_effects,
        security_stamp: cardData.security_stamp,
        promoTypes: cardData.promo_types,
        fullArt: cardData.full_art,
        textless: cardData.textless,
        variation: cardData.variation,
        scryfallUri: cardData.scryfall_uri,
        definition: cardData,
        cardFaces: cardData.card_faces ? cardData.card_faces.map(face => ({
          name: face.name,
          image: face.image_uris?.normal || '',
          manaCost: face.mana_cost || '',
          typeLine: face.type_line || '',
          oracleText: face.oracle_text
        })) : undefined
      };

      // Add to pools
      if (rarity === 'common') pools.commons.push(cardObj);
      else if (rarity === 'uncommon') pools.uncommons.push(cardObj);
      else if (rarity === 'rare') pools.rares.push(cardObj);
      else if (rarity === 'mythic') pools.mythics.push(cardObj);
      else pools.specialGuests.push(cardObj); // Catch-all for special/bonus

      // Add to Sets Map
      if (!setsMap[cardData.set]) {
        setsMap[cardData.set] = { name: cardData.set_name, code: cardData.set, commons: [], uncommons: [], rares: [], mythics: [], lands: [], tokens: [], specialGuests: [] };
      }
      const setEntry = setsMap[cardData.set];

      const isLand = typeLine.includes('Land');
      const isBasic = typeLine.includes('Basic');
      const isToken = layout === 'token' || typeLine.includes('Token') || layout === 'art_series' || layout === 'emblem';

      if (isToken) {
        pools.tokens.push(cardObj);
        setEntry.tokens.push(cardObj);
      } else if (isBasic || (isLand && rarity === 'common')) {
        // Slot 12 Logic: Basic or Common Dual Land
        pools.lands.push(cardObj);
        setEntry.lands.push(cardObj);
      } else {
        if (rarity === 'common') { pools.commons.push(cardObj); setEntry.commons.push(cardObj); }
        else if (rarity === 'uncommon') { pools.uncommons.push(cardObj); setEntry.uncommons.push(cardObj); }
        else if (rarity === 'rare') { pools.rares.push(cardObj); setEntry.rares.push(cardObj); }
        else if (rarity === 'mythic') { pools.mythics.push(cardObj); setEntry.mythics.push(cardObj); }
        else { pools.specialGuests.push(cardObj); setEntry.specialGuests.push(cardObj); } // Catch-all for special/bonus
      }
    });

    // 2. Second Pass: Merge Subsets (Masterpieces) into Parents
    Object.keys(setsMap).forEach(setCode => {
      const meta = setsMetadata[setCode];
      if (meta && meta.parent_set_code) {
        const parentCode = meta.parent_set_code;
        if (setsMap[parentCode]) {
          const parentSet = setsMap[parentCode];
          const childSet = setsMap[setCode];

          // Move ALL cards from child set to parent's 'specialGuests' pool
          // We iterate all pools of the child set
          const allChildCards = [
            ...childSet.commons,
            ...childSet.uncommons,
            ...childSet.rares,
            ...childSet.mythics,
            ...childSet.specialGuests, // Include explicit specials
            // ...childSet.lands, // usually keeps land separate? or special lands?
            // Let's treat everything non-token as special guest candidate
          ];

          parentSet.specialGuests.push(...allChildCards);
          pools.specialGuests.push(...allChildCards);

          // IMPORTANT: If we are in 'by_set' mode, we might NOT want to generate packs for the child set anymore?
          // Or we leave them there but they are ALSO in the parent's special pool?
          // The request implies "merged".
          // If we leave them in setsMap under their own code, they will generate their own packs in 'by_set' mode.
          // If the user selected BOTH, they probably want the "Special Guest" experience AND maybe separate packs?
          // Usually "Drafting WOT" separately is possible.
          // But "Drafting WOE" should include "WOT".
          // So copying is correct.
        }
      }
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
        mythics: this.shuffle(pools.mythics),
        lands: this.shuffle(pools.lands),
        tokens: this.shuffle(pools.tokens),
        specialGuests: this.shuffle(pools.specialGuests)
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
          mythics: this.shuffle(setData.mythics),
          lands: this.shuffle(setData.lands),
          tokens: this.shuffle(setData.tokens),
          specialGuests: this.shuffle(setData.specialGuests)
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

    if (rarityMode === 'peasant') {
      // 1. Slots 1-6: Commons (Color Balanced)
      const commonsNeeded = 6;
      const drawC = this.drawColorBalanced(currentPools.commons, commonsNeeded, namesInThisPack);

      if (!drawC.success && currentPools.commons.length >= commonsNeeded) {
        return null;
      } else if (currentPools.commons.length < commonsNeeded) {
        return null;
      }

      packCards.push(...drawC.selected);
      currentPools.commons = drawC.remainingPool;
      drawC.selected.forEach(c => namesInThisPack.add(c.name));

      // 2. Slot 7: Common / The List
      // 1-87: 1 Common from Main Set.
      // 88-97: 1 Card from "The List" (Common/Uncommon reprint).
      // 98-100: 1 Uncommon from "The List".
      const roll7 = Math.floor(Math.random() * 100) + 1;
      let slot7Card: DraftCard | undefined;

      if (roll7 <= 87) {
        // Common
        const res = this.drawUniqueCards(currentPools.commons, 1, namesInThisPack);
        if (res.success) { slot7Card = res.selected[0]; currentPools.commons = res.remainingPool; }
      } else if (roll7 <= 97) {
        // List (Common/Uncommon). Use SpecialGuests or 50/50 fallback
        if (currentPools.specialGuests.length > 0) {
          const res = this.drawUniqueCards(currentPools.specialGuests, 1, namesInThisPack);
          if (res.success) { slot7Card = res.selected[0]; currentPools.specialGuests = res.remainingPool; }
        } else {
          // Fallback
          const pool = Math.random() < 0.5 ? currentPools.commons : currentPools.uncommons;
          const res = this.drawUniqueCards(pool, 1, namesInThisPack);
          if (res.success) {
            slot7Card = res.selected[0];
            if (pool === currentPools.commons) currentPools.commons = res.remainingPool;
            else currentPools.uncommons = res.remainingPool;
          }
        }
      } else {
        // 98-100: Uncommon from "The List"
        if (currentPools.specialGuests.length > 0) {
          const res = this.drawUniqueCards(currentPools.specialGuests, 1, namesInThisPack);
          if (res.success) { slot7Card = res.selected[0]; currentPools.specialGuests = res.remainingPool; }
        } else {
          // Fallback
          const res = this.drawUniqueCards(currentPools.uncommons, 1, namesInThisPack);
          if (res.success) { slot7Card = res.selected[0]; currentPools.uncommons = res.remainingPool; }
        }
      }

      if (slot7Card) {
        packCards.push(slot7Card);
        namesInThisPack.add(slot7Card.name);
      }

      // 3. Slots 8-11: Uncommons (4 cards)
      const uncommonsNeeded = 4;
      const drawU = this.drawUniqueCards(currentPools.uncommons, uncommonsNeeded, namesInThisPack);
      packCards.push(...drawU.selected);
      currentPools.uncommons = drawU.remainingPool;
      drawU.selected.forEach(c => namesInThisPack.add(c.name));

      // 4. Slot 12: Land (Basic or Common Dual)
      const foilLandRoll = Math.random();
      const isFoilLand = foilLandRoll < 0.20;
      let landCard: DraftCard | undefined;

      if (currentPools.lands.length > 0) {
        const res = this.drawUniqueCards(currentPools.lands, 1, namesInThisPack);
        if (res.success) {
          landCard = { ...res.selected[0] };
          currentPools.lands = res.remainingPool;
        }
      }

      if (landCard) {
        if (isFoilLand) landCard.finish = 'foil';
        packCards.push(landCard);
        namesInThisPack.add(landCard.name);
      }

      // Helper for Wildcards (Peasant)
      const drawWildcard = (foil: boolean) => {
        // ~62% Common, ~37% Uncommon
        const wRoll = Math.random() * 100;
        let wRarity = 'common';
        if (wRoll > 62) wRarity = 'uncommon';

        let poolToUse: DraftCard[] = [];
        let updatePool = (_newPool: DraftCard[]) => { };

        if (wRarity === 'uncommon') { poolToUse = currentPools.uncommons; updatePool = (p) => currentPools.uncommons = p; }
        else { poolToUse = currentPools.commons; updatePool = (p) => currentPools.commons = p; }

        if (poolToUse.length === 0) {
          if (currentPools.commons.length > 0) { poolToUse = currentPools.commons; updatePool = (p) => currentPools.commons = p; }
        }

        if (poolToUse.length > 0) {
          const res = this.drawUniqueCards(poolToUse, 1, namesInThisPack);
          if (res.success) {
            const card = { ...res.selected[0] };
            if (foil) card.finish = 'foil';
            packCards.push(card);
            updatePool(res.remainingPool);
            namesInThisPack.add(card.name);
          }
        }
      };

      // 5. Slot 13: Non-Foil Wildcard
      drawWildcard(false);

      // 6. Slot 14: Foil Wildcard
      drawWildcard(true);

      // 7. Slot 15: Marketing / Token
      if (currentPools.tokens.length > 0) {
        const res = this.drawUniqueCards(currentPools.tokens, 1, namesInThisPack);
        if (res.success) {
          packCards.push(res.selected[0]);
          currentPools.tokens = res.remainingPool;
        }
      }

    } else {
      // --- NEW ALGORITHM (Standard / Play Booster) ---

      // 1. Slots 1-6: Commons (Color Balanced)
      const commonsNeeded = 6;
      const drawC = this.drawColorBalanced(currentPools.commons, commonsNeeded, namesInThisPack);
      if (!drawC.success) return null;
      packCards.push(...drawC.selected);
      currentPools.commons = drawC.remainingPool;
      drawC.selected.forEach(c => namesInThisPack.add(c.name));

      // 2. Slots 8-10: Uncommons (3 cards)
      const uncommonsNeeded = 3;
      const drawU = this.drawUniqueCards(currentPools.uncommons, uncommonsNeeded, namesInThisPack);
      if (!drawU.success) return null;
      packCards.push(...drawU.selected);
      currentPools.uncommons = drawU.remainingPool;
      drawU.selected.forEach(c => namesInThisPack.add(c.name));

      // 3. Slot 11: Main Rare/Mythic (1/8 Mythic, 7/8 Rare)
      const isMythic = Math.random() < 0.125;
      let rarePicked = false;

      if (isMythic && currentPools.mythics.length > 0) {
        const drawM = this.drawUniqueCards(currentPools.mythics, 1, namesInThisPack);
        if (drawM.success) {
          packCards.push(...drawM.selected);
          currentPools.mythics = drawM.remainingPool;
          drawM.selected.forEach(c => namesInThisPack.add(c.name));
          rarePicked = true;
        }
      }

      if (!rarePicked && currentPools.rares.length > 0) {
        const drawR = this.drawUniqueCards(currentPools.rares, 1, namesInThisPack);
        if (drawR.success) {
          packCards.push(...drawR.selected);
          currentPools.rares = drawR.remainingPool;
          drawR.selected.forEach(c => namesInThisPack.add(c.name));
          rarePicked = true;
        }
      }

      // 4. Slot 7: Common / The List / Special Guest
      // 1-87: 1 Common from Main Set.
      // 88-97: 1 Card from "The List" (Common/Uncommon reprint).
      // 98-99: 1 Rare/Mythic from "The List".
      // 100: 1 Special Guest (High Value).
      const roll7 = Math.floor(Math.random() * 100) + 1;
      let slot7Card: DraftCard | undefined;

      if (roll7 <= 87) {
        // Common
        const res = this.drawUniqueCards(currentPools.commons, 1, namesInThisPack);
        if (res.success) { slot7Card = res.selected[0]; currentPools.commons = res.remainingPool; }
      } else if (roll7 <= 97) {
        // List (Common/Uncommon)
        if (currentPools.specialGuests.length > 0) {
          const res = this.drawUniqueCards(currentPools.specialGuests, 1, namesInThisPack);
          if (res.success) { slot7Card = res.selected[0]; currentPools.specialGuests = res.remainingPool; }
        } else {
          const pool = Math.random() < 0.5 ? currentPools.commons : currentPools.uncommons;
          const res = this.drawUniqueCards(pool, 1, namesInThisPack);
          if (res.success) {
            slot7Card = res.selected[0];
            if (pool === currentPools.commons) currentPools.commons = res.remainingPool;
            else currentPools.uncommons = res.remainingPool;
          }
        }
      } else if (roll7 <= 99) {
        // List (Rare/Mythic)
        if (currentPools.specialGuests.length > 0) {
          const res = this.drawUniqueCards(currentPools.specialGuests, 1, namesInThisPack);
          if (res.success) { slot7Card = res.selected[0]; currentPools.specialGuests = res.remainingPool; }
        } else {
          const pool = Math.random() < 0.125 ? currentPools.mythics : currentPools.rares;
          const res = this.drawUniqueCards(pool, 1, namesInThisPack);
          if (res.success) {
            slot7Card = res.selected[0];
            if (pool === currentPools.mythics) currentPools.mythics = res.remainingPool;
            else currentPools.rares = res.remainingPool;
          }
        }
      } else {
        // 100: Special Guest
        if (currentPools.specialGuests.length > 0) {
          const res = this.drawUniqueCards(currentPools.specialGuests, 1, namesInThisPack);
          if (res.success) { slot7Card = res.selected[0]; currentPools.specialGuests = res.remainingPool; }
        } else {
          // Fallback Mythic
          const res = this.drawUniqueCards(currentPools.mythics, 1, namesInThisPack);
          if (res.success) { slot7Card = res.selected[0]; currentPools.mythics = res.remainingPool; }
        }
      }

      if (slot7Card) {
        packCards.push(slot7Card);
        namesInThisPack.add(slot7Card.name);
      }

      // 5. Slot 12: Land (Basic or Common Dual)
      const foilLandRoll = Math.random();
      const isFoilLand = foilLandRoll < 0.20;

      let landCard: DraftCard | undefined;
      // Prioritize 'lands' pool
      if (currentPools.lands.length > 0) {
        const res = this.drawUniqueCards(currentPools.lands, 1, namesInThisPack);
        if (res.success) {
          landCard = { ...res.selected[0] }; // Clone to set foil
          currentPools.lands = res.remainingPool;
        }
      } else {
        // Fallback: Pick a Common if no lands
        // const res = this.drawUniqueCards(currentPools.commons, 1, namesInThisPack);
        // if (res.success) { landCard = { ...res.selected[0] }; ... }
      }

      if (landCard) {
        if (isFoilLand) landCard.finish = 'foil';
        packCards.push(landCard);
        namesInThisPack.add(landCard.name);
      }

      // 6. Slot 13: Wildcard (Non-Foil)
      // Weights: ~49% C, ~24% U, ~13% R, ~13% M
      const drawWildcard = (foil: boolean) => {
        const wRoll = Math.random() * 100;
        let wRarity = 'common';
        if (wRoll > 87) wRarity = 'mythic';
        else if (wRoll > 74) wRarity = 'rare';
        else if (wRoll > 50) wRarity = 'uncommon';
        else wRarity = 'common';

        let poolToUse: DraftCard[] = [];
        let updatePool = (_newPool: DraftCard[]) => { };

        if (wRarity === 'mythic') { poolToUse = currentPools.mythics; updatePool = (p) => currentPools.mythics = p; }
        else if (wRarity === 'rare') { poolToUse = currentPools.rares; updatePool = (p) => currentPools.rares = p; }
        else if (wRarity === 'uncommon') { poolToUse = currentPools.uncommons; updatePool = (p) => currentPools.uncommons = p; }
        else { poolToUse = currentPools.commons; updatePool = (p) => currentPools.commons = p; }

        if (poolToUse.length === 0) {
          if (currentPools.commons.length > 0) { poolToUse = currentPools.commons; updatePool = (p) => currentPools.commons = p; }
        }

        if (poolToUse.length > 0) {
          const res = this.drawUniqueCards(poolToUse, 1, namesInThisPack);
          if (res.success) {
            const card = { ...res.selected[0] };
            if (foil) card.finish = 'foil';
            packCards.push(card);
            updatePool(res.remainingPool);
            namesInThisPack.add(card.name);
          }
        }
      };

      drawWildcard(false); // Slot 13

      // 7. Slot 14: Wildcard (Foil)
      drawWildcard(true); // Slot 14

      // 8. Slot 15: Marketing / Token
      if (currentPools.tokens.length > 0) {
        const res = this.drawUniqueCards(currentPools.tokens, 1, namesInThisPack);
        if (res.success) {
          packCards.push(res.selected[0]);
          currentPools.tokens = res.remainingPool;
        }
      }
    }

    // Sort: Mythic -> Rare -> Uncommon -> Common -> Land -> Token
    const getWeight = (c: DraftCard) => {
      if (c.layout === 'token' || c.typeLine?.includes('Token')) return 0;
      if (c.typeLine?.includes('Land') && (c.rarity === 'common' || c.rarity === 'basic')) return 1;
      if (c.rarity === 'common') return 2;
      if (c.rarity === 'uncommon') return 3;
      if (c.rarity === 'rare') return 4;
      if (c.rarity === 'mythic') return 5;
      return 1;
    }

    packCards.sort((a, b) => getWeight(b) - getWeight(a));

    return { pack: { id: packId, setName, cards: packCards }, remainingPools: currentPools };
  }

  private drawColorBalanced(pool: DraftCard[], count: number, existingNames: Set<string>) {
    // Attempt to include at least 3 distinct colors
    // Naive approach: Just draw distinct. If diversity < 3, accept it anyway to avoid stalling, 
    // or try to pick specifically.
    // Given constraints, let's try to pick a set that satisfies it.

    const res = this.drawUniqueCards(pool, count, existingNames);
    // For now, accept the draw. Implementing strict color balancing with limited pools is hard.
    // A simple heuristic: Sort pool by color? No, we need randomness.
    // With 6 cards from a large pool, 3 colors is highly probable.
    return res;
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

  generateCsv(packs: Pack[]): string {
    const header = "Pack ID,Name,Set Code,Rarity,Finish,Scryfall ID\n";
    const rows = packs.flatMap(pack =>
      pack.cards.map(card => {
        const finish = card.finish || 'normal';
        // Escape quotes in name if necessary
        const safeName = card.name.includes(',') ? `"${card.name}"` : card.name;
        return `${pack.id},${safeName},${card.setCode},${card.rarity},${finish},${card.scryfallId}`;
      })
    );
    return header + rows.join('\n');
  }
}
