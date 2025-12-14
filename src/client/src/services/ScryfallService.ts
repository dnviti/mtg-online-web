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
}
