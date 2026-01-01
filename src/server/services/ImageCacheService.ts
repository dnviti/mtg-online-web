
import { scryfallService } from '../singletons';
import { fileStorageManager } from '../managers/FileStorageManager';
import { StateStoreManager } from '../managers/StateStoreManager';

export class ImageCacheService {

  private get metadataStore() {
    return StateStoreManager.getInstance().metadataStore;
  }

  async ensureImageCached(absoluteFilePath: string, cardId: string, setCode: string, type: 'full' | 'crop'): Promise<Buffer | null> {
    const store = this.metadataStore;

    // 1. Check Redis Metadata Index
    let metadata: any = null;
    let scryfallUri = '';

    if (store) {
      try {
        const jsonStr = await store.hget(`set:${setCode}`, cardId);
        if (jsonStr) {
          metadata = JSON.parse(jsonStr);
        }
      } catch (e) {
        console.warn(`[ImageCacheService] Failed to read Redis metadata for ${cardId}`, e);
      }
    }

    // 2. If Metadata exists, check file consistency
    if (metadata) {
      const fileExists = await fileStorageManager.exists(absoluteFilePath);
      if (fileExists) {
        return fileStorageManager.readFile(absoluteFilePath);
      }
      // File missing but metadata exists? Use metadata to recover
      console.log(`[ImageCacheService] File missing for ${cardId} but metadata found. Recovering...`);
      scryfallUri = (type === 'crop') ? metadata.image_uris?.art_crop : metadata.image_uris?.normal;
    }

    // 3. If Metadata missing OR URI missing in metadata, fetch from Scryfall
    if (!metadata || !scryfallUri) {
      try {
        const cards = await scryfallService.fetchCollection([{ id: cardId }]);
        if (cards.length === 0) return null;

        const card = cards[0];
        const uris = card.image_uris || card.card_faces?.[0]?.image_uris;
        const safeUris = uris as any;

        if (!safeUris) return null;

        // Construct Metadata Object
        metadata = {
          id: card.id,
          name: card.name,
          set: card.set,
          set_uri: card.set_uri,
          image_uris: {
            normal: safeUris.normal || safeUris.large || safeUris.png,
            art_crop: safeUris.art_crop
          },
          local_path_full: `/cards/images/${card.set}/full/${card.id}.jpg`,
          local_path_crop: `/cards/images/${card.set}/crop/${card.id}.jpg`
        };

        // Parse URI for download
        scryfallUri = (type === 'crop') ? safeUris.art_crop : (safeUris.normal || safeUris.large || safeUris.png);

        // Save Metadata to Redis
        if (store) {
          await store.hset(`set:${setCode}`, cardId, JSON.stringify(metadata));
          await store.hset(`sets`, setCode, JSON.stringify({ code: card.set, name: card.set_name, scryfall_uri: card.scryfall_set_uri }));
          console.log(`[ImageCacheService] Updated Redis Metadata for ${cardId} in set ${setCode}`);
        }

      } catch (e) {
        console.error(`[ImageCacheService] Failed to fetch scryfall data for ${cardId}`, e);
        return null;
      }
    }

    if (!scryfallUri) return null;

    // 4. Download and Save File (Binary)
    try {
      if (process.env.DEBUG_IMAGES) console.log(`[ImageCacheService] Downloading ${type} image for ${cardId} from ${scryfallUri}`);
      const resp = await fetch(scryfallUri);
      if (!resp.ok) return null;

      const arrayBuffer = await resp.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      await fileStorageManager.saveFile(absoluteFilePath, buffer);

      return buffer;
    } catch (e) {
      console.error(`[ImageCacheService] Download failed for ${cardId}`, e);
      return null;
    }
  }
}

export const imageCacheService = new ImageCacheService();
