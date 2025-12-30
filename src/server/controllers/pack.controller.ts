import { Request, Response } from 'express';
import { cardService, packGeneratorService, scryfallService } from '../singletons';

export class PackController {

  static async generate(req: Request, res: Response) {
    try {
      const { cards, settings, numPacks, sourceMode, selectedSets, filters } = req.body;

      let poolCards = cards || [];

      if (sourceMode === 'set' && selectedSets && Array.isArray(selectedSets)) {
        console.log(`[API] Fetching sets for generation: ${selectedSets.join(', ')}`);
        for (const code of selectedSets) {
          const setCards = await scryfallService.fetchSetCards(code);
          poolCards.push(...setCards);

          const setTokens = await scryfallService.getTokensForSet(code);
          if (setTokens.length > 0) {
            console.log(`[API] Caching images for ${setTokens.length} tokens in ${code}...`);
            await cardService.cacheImages(setTokens).catch(e => console.error(`Failed to cache token images for ${code}`, e));
          }

          if (setCards.length > 0) {
            await cardService.cacheImages(setCards).catch(e => console.error(`Failed to cache set images for ${code}`, e));
          }
        }
        if (settings) {
          settings.withReplacement = true;
        }
      }

      const activeFilters = filters || {
        ignoreBasicLands: false,
        ignoreCommander: false,
        ignoreTokens: false
      };

      const allSets = await scryfallService.fetchSets();
      const setsMetadata: { [code: string]: { parent_set_code?: string } } = {};
      if (allSets && Array.isArray(allSets)) {
        allSets.forEach((s: any) => {
          if (selectedSets && selectedSets.includes(s.code)) {
            setsMetadata[s.code] = { parent_set_code: s.parent_set_code };
          }
        });
      }

      const { pools, sets } = packGeneratorService.processCards(poolCards, activeFilters, setsMetadata);

      if (pools.lands.length === 0) {
        console.log('[PackGenerator] No basic lands found in source. Fetching Fallback (J25)...');
        const fallbackLands = await scryfallService.getFoundationLands();

        if (fallbackLands.length > 0) {
          await cardService.cacheImages(fallbackLands).catch(e => console.error('Failed to cache fallback land images', e));
          const fallbackResult = packGeneratorService.processCards(fallbackLands, { ...activeFilters, ignoreBasicLands: false });
          pools.lands.push(...fallbackResult.pools.lands);
          Object.values(sets).forEach(setObj => {
            if (setObj.lands.length === 0) {
              setObj.lands.push(...fallbackResult.pools.lands);
            }
          });
          console.log(`[PackGenerator] Injected ${fallbackResult.pools.lands.length} basic lands into active pools.`);
        }
      }

      const basicLands = pools.lands.filter(c => c.typeLine?.includes('Basic'));
      const uniqueBasicLands: any[] = [];
      const seenLandIds = new Set();
      for (const land of basicLands) {
        if (!seenLandIds.has(land.scryfallId)) {
          seenLandIds.add(land.scryfallId);
          uniqueBasicLands.push(land);
        }
      }

      const packs = packGeneratorService.generatePacks(pools, sets, settings, numPacks || 108);
      res.json({ packs, basicLands: uniqueBasicLands });
    } catch (e: any) {
      console.error("Generation error", e);
      res.status(500).json({ error: e.message });
    }
  }
}
