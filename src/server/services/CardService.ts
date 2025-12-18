
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { fileStorageManager } from '../managers/FileStorageManager';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CARDS_DIR = path.join(__dirname, '../public/cards');

export class CardService {
  private imagesDir: string;
  private metadataDir: string;

  constructor() {
    this.imagesDir = path.join(CARDS_DIR, 'images');
    this.metadataDir = path.join(CARDS_DIR, 'metadata');

    // Directory creation is handled by FileStorageManager on write for Local, 
    // and not needed for Redis.
    // Migration logic removed as it's FS specific and one-time. 
    // If we need migration to Redis, it should be a separate script.
  }

  async cacheImages(cards: any[]): Promise<number> {
    let downloadedCount = 0;

    // Use a concurrency limit to avoid creating too many connections
    const CONCURRENCY_LIMIT = 5;
    const queue = [...cards];

    const downloadWorker = async () => {
      while (queue.length > 0) {
        const card = queue.shift();
        if (!card) break;

        // Determine UUID
        const uuid = card.id || card.oracle_id;
        const setCode = card.set;

        if (!uuid || !setCode) continue;

        // Check for normal image
        let imageUrl = card.image_uris?.normal;
        if (!imageUrl && card.card_faces && card.card_faces.length > 0) {
          imageUrl = card.card_faces[0].image_uris?.normal;
        }

        // Check for art crop
        let cropUrl = card.image_uris?.art_crop;
        if (!cropUrl && card.card_faces && card.card_faces.length > 0) {
          cropUrl = card.card_faces[0].image_uris?.art_crop;
        }

        const tasks: Promise<void>[] = [];

        // Task 1: Normal Image (art_full)
        if (imageUrl) {
          const filePath = path.join(this.imagesDir, setCode, 'art_full', `${uuid}.jpg`);
          tasks.push((async () => {
            if (await fileStorageManager.exists(filePath)) return;
            try {
              const response = await fetch(imageUrl);
              if (response.ok) {
                const buffer = await response.arrayBuffer();
                await fileStorageManager.saveFile(filePath, Buffer.from(buffer));
                downloadedCount++;
                console.log(`Cached art_full: ${setCode}/${uuid}.jpg`);
              } else {
                console.error(`Failed to download art_full ${imageUrl}: ${response.statusText}`);
              }
            } catch (err) {
              console.error(`Error downloading art_full for ${uuid}:`, err);
            }
          })());
        }

        // Task 2: Art Crop (art_crop)
        if (cropUrl) {
          const cropPath = path.join(this.imagesDir, setCode, 'art_crop', `${uuid}.jpg`);
          tasks.push((async () => {
            if (await fileStorageManager.exists(cropPath)) return;
            try {
              const response = await fetch(cropUrl);
              if (response.ok) {
                const buffer = await response.arrayBuffer();
                await fileStorageManager.saveFile(cropPath, Buffer.from(buffer));
                console.log(`Cached art_crop: ${setCode}/${uuid}.jpg`);
              } else {
                console.error(`Failed to download art_crop ${cropUrl}: ${response.statusText}`);
              }
            } catch (err) {
              console.error(`Error downloading art_crop for ${uuid}:`, err);
            }
          })());
        }

        await Promise.all(tasks);
      }
    };

    const workers = Array(CONCURRENCY_LIMIT).fill(null).map(() => downloadWorker());
    await Promise.all(workers);

    return downloadedCount;
  }

  async cacheMetadata(cards: any[]): Promise<number> {
    let cachedCount = 0;
    for (const card of cards) {
      if (!card.id || !card.set) continue;

      const filePath = path.join(this.metadataDir, card.set, `${card.id}.json`);
      if (!(await fileStorageManager.exists(filePath))) {
        try {
          await fileStorageManager.saveFile(filePath, JSON.stringify(card, null, 2));
          cachedCount++;
        } catch (e) {
          console.error(`Failed to save metadata for ${card.id}`, e);
        }
      }
    }
    return cachedCount;
  }
}
