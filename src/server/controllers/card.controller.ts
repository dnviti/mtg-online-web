import { Request, Response } from 'express';
import { cardParserService, cardService, scryfallService } from '../singletons';

export class CardController {

  static async getSets(_req: Request, res: Response) {
    const sets = await scryfallService.fetchSets();
    res.json(sets);
  }

  static async getSetCards(req: Request, res: Response) {
    try {
      const related = req.query.related ? (req.query.related as string).split(',') : [];
      const cards = await scryfallService.fetchSetCards(req.params.code, related);

      if (cards.length > 0) {
        console.log(`[API] Triggering image cache for set ${req.params.code} (${cards.length} potential images)...`);
        await cardService.cacheImages(cards);
      }

      res.json(cards);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  }

  static async getFallbackLands(_req: Request, res: Response) {
    try {
      const lands = await scryfallService.getFoundationLands();
      if (lands.length > 0) {
        await cardService.cacheImages(lands).catch(e => console.error('Failed to cache fallback land images', e));
      }
      res.json(lands);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  }

  static async search(req: Request, res: Response) {
    try {
      const query = req.query.q as string;
      if (!query) return res.json([]);

      // 1. Local Search
      const localResults = scryfallService.searchLocal(query);
      console.log(`[API] Search '${query}': Found ${localResults.length} local matches.`);

      // 2. API Search
      let apiResults: any[] = [];
      try {
        const resp = await fetch(`https://api.scryfall.com/cards/search?q=${encodeURIComponent(query)}&unique=prints`);
        if (resp.ok) {
          const data = await resp.json();
          apiResults = data.data || [];

          if (apiResults.length > 0) {
            (async () => {
              try {
                await scryfallService.cacheCards(apiResults);
                console.log(`[API] Triggering background image cache for ${apiResults.length} search results...`);
                await cardService.cacheImages(apiResults);
                const setCodes = apiResults.map(c => c.set).filter(Boolean);
                if (setCodes.length > 0) {
                  await scryfallService.cacheSetsMetadata(setCodes);
                }
              } catch (err) {
                console.error("Auto-cache failed", err);
              }
            })();
          }
        } else if (resp.status !== 404) {
          console.warn(`[API] Scryfall search failed: ${resp.statusText}`);
        }
      } catch (e) {
        console.warn(`[API] Scryfall search offline/error`, e);
      }

      // 4. Merge & Prioritize
      const mergedMap = new Map();
      apiResults.forEach(c => mergedMap.set(c.id, c));
      localResults.forEach(c => mergedMap.set(c.id, c));

      const finalResults = Array.from(mergedMap.values());
      console.log(`[API] Search '${query}': Returning ${finalResults.length} total results.`);

      res.json(finalResults);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  }

  static async parse(req: Request, res: Response) {
    try {
      const { text } = req.body;
      const identifiers = cardParserService.parse(text);

      const uniqueIds = identifiers.map(id => {
        if (id.type === 'id') return { id: id.value };
        return { name: id.value, set: id.setCode };
      });
      const uniqueCards = await scryfallService.fetchCollection(uniqueIds);

      if (uniqueCards.length > 0) {
        console.log(`[API] Triggering image cache for parsed lists (${uniqueCards.length} unique cards)...`);
        await cardService.cacheImages(uniqueCards);
      }

      const expanded: any[] = [];
      const cardMap = new Map();
      uniqueCards.forEach(c => {
        cardMap.set(c.id, c);
        if (c.name) cardMap.set(c.name.toLowerCase(), c);
      });

      identifiers.forEach(req => {
        let card = null;
        if (req.type === 'id') card = cardMap.get(req.value);
        else card = cardMap.get(req.value.toLowerCase());

        if (card) {
          for (let i = 0; i < req.quantity; i++) {
            const clone = { ...card };
            if (req.finish) clone.finish = req.finish;
            expanded.push(clone);
          }
        }
      });

      res.json(expanded);
    } catch (e: any) {
      console.error("Parse error", e);
      res.status(400).json({ error: e.message });
    }
  }

  static async cache(req: Request, res: Response) {
    try {
      const { cards } = req.body;
      if (!cards || !Array.isArray(cards)) {
        res.status(400).json({ error: 'Invalid payload' });
        return;
      }

      console.log(`Caching images and metadata for ${cards.length} cards...`);
      const imgCount = await cardService.cacheImages(cards);
      const metaCount = await cardService.cacheMetadata(cards);
      res.json({ success: true, downloadedImages: imgCount, savedMetadata: metaCount });
    } catch (err: any) {
      console.error('Error in cache route:', err);
      res.status(500).json({ error: err.message });
    }
  }
}
