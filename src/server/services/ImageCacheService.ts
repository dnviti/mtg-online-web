
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

    // 0. Check Physical File first (Fastest / Offline mode)
    const fileExists = await fileStorageManager.exists(absoluteFilePath);
    if (fileExists) {
      if (process.env.DEBUG_IMAGES) console.log(`[ImageCacheService] Serving local file: ${absoluteFilePath}`);
      return fileStorageManager.readFile(absoluteFilePath);
    }

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

    // 2. If Metadata exists, use it to recover (File already confirmed missing above)
    if (metadata) {
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

        // Parse URI for download
        scryfallUri = (type === 'crop') ? safeUris.art_crop : (safeUris.normal || safeUris.large || safeUris.png);

        // Metadata Indexing is handled by ScryfallService.saveCard(), called within fetchCollection.
        // We do not overwrite it here to preserve full metadata.
        console.log(`[ImageCacheService] Indexing triggered via ScryfallService for ${cardId}`);

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
