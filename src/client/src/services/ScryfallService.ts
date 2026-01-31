export interface ScryfallCardFace {
  name: string;
  type_line?: string;
  mana_cost?: string;
  oracle_text?: string;
  colors?: string[];
  power?: string;
  toughness?: string;
  image_uris?: { normal: string; small?: string; large?: string; png?: string; art_crop?: string; border_crop?: string };
}

export interface ScryfallCard {
  id: string;
  name: string;
  local_path_full?: string;
  local_path_crop?: string;
  rarity: string;
  set: string;
  set_name: string;
  set_type: string;
  layout: string;
  type_line: string;
  colors?: string[];
  image_uris?: { normal: string; small?: string; large?: string; png?: string; art_crop?: string; border_crop?: string };
  card_faces?: ScryfallCardFace[];
  finish?: 'foil' | 'normal'; // Manual override from import
  // Extended Metadata
  cmc?: number;
  mana_cost?: string;
  oracle_text?: string;
  power?: string;
  toughness?: string;
  collector_number?: string;
  color_identity?: string[];
  keywords?: string[];
  booster?: boolean;
  promo?: boolean;
  reprint?: boolean;

  // Rich Metadata for precise generation
  legalities?: { [format: string]: 'legal' | 'not_legal' | 'restricted' | 'banned' };
  finishes?: string[]; // e.g. ["foil", "nonfoil"]
  games?: string[]; // e.g. ["paper", "arena", "mtgo"]
  produced_mana?: string[];
  artist?: string;
  released_at?: string;
  frame_effects?: string[];
  security_stamp?: string;
  promo_types?: string[];
  full_art?: boolean;
  textless?: boolean;
  variation?: boolean;
  variation_of?: string;
  scryfall_uri?: string;

  // Index signature to allow all other properties from API
  [key: string]: any;
}

import { db } from '../utils/db';

export class ScryfallService {
  private cacheById = new Map<string, ScryfallCard>();
  private cacheByName = new Map<string, ScryfallCard>();
  private initPromise: Promise<void> | null = null;

  constructor() {
    this.initPromise = this.initializeCache();
  }

  private async initializeCache() {
    try {
      const cards = await db.getAllCards();
      cards.forEach(card => {
        this.cacheById.set(card.id, card);
        if (card.name) this.cacheByName.set(card.name.toLowerCase(), card);
      });
      console.log(`[ScryfallService] Loaded ${cards.length} cards from persistence.`);
    } catch (e) {
      console.error("[ScryfallService] Failed to load cache", e);
    }
  }

  async fetchCollection(identifiers: { id?: string; name?: string }[], onProgress?: (current: number, total: number) => void): Promise<ScryfallCard[]> {
    if (this.initPromise) await this.initPromise;

    // Deduplicate
    const uniqueRequests: { id?: string; name?: string }[] = [];
    const seen = new Set<string>();

    identifiers.forEach(item => {
      const key = item.id ? `id:${item.id}` : `name:${item.name?.toLowerCase()}`;
      // Check internal cache or seen
      if (item.id && this.cacheById.has(item.id)) return;
      if (item.name && this.cacheByName.has(item.name.toLowerCase())) return;

      if (!seen.has(key)) {
        seen.add(key);
        uniqueRequests.push(item);
      }
    });

    const fetchedCards: ScryfallCard[] = [];
    const chunks = [];
    for (let i = 0; i < uniqueRequests.length; i += 75) chunks.push(uniqueRequests.slice(i, i + 75));

    let totalFetched = 0;

    for (const chunk of chunks) {
      if (onProgress) onProgress(totalFetched, uniqueRequests.length);

      try {
        const response = await fetch('https://api.scryfall.com/cards/collection', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identifiers: chunk })
        });

        const data = await response.json();
        if (data.data) {
          data.data.forEach((card: ScryfallCard) => {
            this.cacheById.set(card.id, card);
            if (card.name) this.cacheByName.set(card.name.toLowerCase(), card);
            fetchedCards.push(card);
          });
        }
      } catch (error) {
        console.error("Scryfall fetch error:", error);
      }

      totalFetched += chunk.length;
      await new Promise(r => setTimeout(r, 75)); // Rate limit respect
    }

    // Persist new cards
    if (fetchedCards.length > 0) {
      await db.bulkPutCards(fetchedCards);
    }

    // Return everything requested (from cache included)
    const result: ScryfallCard[] = [];
    identifiers.forEach(item => {
      if (item.id) {
        const c = this.cacheById.get(item.id);
        if (c) result.push(c);
      } else if (item.name) {
        const c = this.cacheByName.get(item.name.toLowerCase());
        if (c) result.push(c);
      }
    });

    return result;
  }

  getCachedCard(identifier: { id?: string; name?: string }): ScryfallCard | undefined {
    if (identifier.id) return this.cacheById.get(identifier.id);
    if (identifier.name) return this.cacheByName.get(identifier.name.toLowerCase());
    return undefined;
  }

  async fetchSets(): Promise<ScryfallSet[]> {
    try {
      const response = await fetch('https://api.scryfall.com/sets');
      const data = await response.json();
      if (data.data) {
        return data.data.filter((s: any) =>
          ['core', 'expansion', 'masters', 'draft_innovation', 'commander', 'funny', 'masterpiece', 'eternal'].includes(s.set_type)
        ).map((s: any) => ({
          code: s.code,
          name: s.name,
          set_type: s.set_type,
          released_at: s.released_at,
          icon_svg_uri: s.icon_svg_uri,
          digital: s.digital,
          parent_set_code: s.parent_set_code,
          card_count: s.card_count
        }));
      }
    } catch (e) {
      console.error("Error fetching sets", e);
    }
    return [];
  }

  async fetchSetCards(setCode: string, relatedSets: string[] = [], onProgress?: (current: number) => void): Promise<ScryfallCard[]> {
    if (this.initPromise) await this.initPromise;

    // Check if we already have a significant number of cards from this set in cache?
    // Hard to know strict completeness without tracking sets. 
    // But for now, we just fetch and merge.

    let cards: ScryfallCard[] = [];
    const setClause = `e:${setCode}` + relatedSets.map(s => ` OR e:${s}`).join('');
    // User requested pattern: (e:main or e:sub) and is:booster unique=prints
    let url = `https://api.scryfall.com/cards/search?q=(${setClause}) unique=prints is:booster`;

    while (url) {
      try {
        const res = await fetch(url);
        const data = await res.json();
        if (data.data) {
          cards.push(...data.data);
          if (onProgress) onProgress(cards.length);
        }
        if (data.has_more && data.next_page) {
          url = data.next_page;
          await new Promise(r => setTimeout(r, 100)); // Respect API limits
        } else {
          url = '';
        }
      } catch (e) {
        console.error(e);
        break;
      }
    }

    // Cache everything
    if (cards.length > 0) {
      cards.forEach(card => {
        this.cacheById.set(card.id, card);
        if (card.name) this.cacheByName.set(card.name.toLowerCase(), card);
      });
      await db.bulkPutCards(cards);
    }

    return cards;
  }
}

export interface ScryfallSet {
  code: string;
  name: string;
  set_type: string;
  released_at: string;
  icon_svg_uri: string;
  digital: boolean;
  parent_set_code?: string;
  card_count: number;
}
