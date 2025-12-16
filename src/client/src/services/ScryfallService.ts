export interface ScryfallCard {
  id: string;
  name: string;
  rarity: string;
  set: string;
  set_name: string;
  set_type: string;
  layout: string;
  type_line: string;
  colors?: string[];
  image_uris?: { normal: string };
  card_faces?: { image_uris: { normal: string } }[];
  finish?: 'foil' | 'normal'; // Manual override from import
}

export class ScryfallService {
  private cacheById = new Map<string, ScryfallCard>();
  private cacheByName = new Map<string, ScryfallCard>();

  async fetchCollection(identifiers: { id?: string; name?: string }[], onProgress?: (current: number, total: number) => void): Promise<ScryfallCard[]> {
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
          ['core', 'expansion', 'masters', 'draft_innovation'].includes(s.set_type)
        ).map((s: any) => ({
          code: s.code,
          name: s.name,
          set_type: s.set_type,
          released_at: s.released_at,
          icon_svg_uri: s.icon_svg_uri
        }));
      }
    } catch (e) {
      console.error("Error fetching sets", e);
    }
    return [];
  }

  async fetchSetCards(setCode: string, onProgress?: (current: number) => void): Promise<ScryfallCard[]> {
    let cards: ScryfallCard[] = [];
    let url = `https://api.scryfall.com/cards/search?q=set:${setCode}&unique=cards`;

    while (url) {
      try {
        const res = await fetch(url);
        const data = await res.json();
        if (data.data) {
          // Should we filter here strictly? The API query 'set:code' + 'unique=cards' is usually correct.
          // We might want to filter out Basics if we don't want them in booster generation, but standard boosters contain basics.
          // However, user setting for "Ignore Basic Lands" is handled in PackGeneratorService.processCards.
          // So here we should fetch everything.
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
    return cards;
  }
}

export interface ScryfallSet {
  code: string;
  name: string;
  set_type: string;
  released_at: string;
  icon_svg_uri: string;
}
