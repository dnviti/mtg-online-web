
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CARDS_DIR = path.join(__dirname, '../public/cards');

export class CardService {
  private imagesDir: string;
  private metadataDir: string;

  constructor() {
    this.imagesDir = path.join(CARDS_DIR, 'images');
    this.metadataDir = path.join(CARDS_DIR, 'metadata');

    this.ensureDirs();
    this.migrateExistingImages();
  }

  private ensureDirs() {
    if (!fs.existsSync(this.imagesDir)) {
      fs.mkdirSync(this.imagesDir, { recursive: true });
    }
    if (!fs.existsSync(this.metadataDir)) {
      fs.mkdirSync(this.metadataDir, { recursive: true });
    }
  }

  private migrateExistingImages() {
    console.log('[CardService] Checking for images to migrate...');
    const start = Date.now();
    let moved = 0;

    try {
      if (fs.existsSync(this.metadataDir)) {
        const items = fs.readdirSync(this.metadataDir);
        for (const item of items) {
          const itemPath = path.join(this.metadataDir, item);
          if (fs.statSync(itemPath).isDirectory()) {
            // This determines the set
            const setCode = item;
            const cardFiles = fs.readdirSync(itemPath);

            for (const file of cardFiles) {
              if (!file.endsWith('.json')) continue;
              const id = file.replace('.json', '');

              // Check for legacy image
              const legacyImgPath = path.join(this.imagesDir, `${id}.jpg`);
              if (fs.existsSync(legacyImgPath)) {
                const targetDir = path.join(this.imagesDir, setCode);
                if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

                const targetPath = path.join(targetDir, `${id}.jpg`);
                try {
                  fs.renameSync(legacyImgPath, targetPath);
                  moved++;
                } catch (e) {
                  console.error(`[CardService] Failed to move ${id}.jpg to ${setCode}`, e);
                }
              }
            }
          }
        }
      }
    } catch (e) {
      console.error('[CardService] Migration error', e);
    }

    if (moved > 0) {
      console.log(`[CardService] Migrated ${moved} images to set folders in ${Date.now() - start}ms.`);
    } else {
      console.log(`[CardService] No images needed migration.`);
    }
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

        if (!imageUrl) continue;

        const setDir = path.join(this.imagesDir, setCode);
        if (!fs.existsSync(setDir)) {
          fs.mkdirSync(setDir, { recursive: true });
        }

        const filePath = path.join(setDir, `${uuid}.jpg`);

        // Check if exists in set folder
        if (fs.existsSync(filePath)) {
          continue;
        }

        // Check legacy location and move if exists (double check)
        const legacyPath = path.join(this.imagesDir, `${uuid}.jpg`);
        if (fs.existsSync(legacyPath)) {
          try {
            fs.renameSync(legacyPath, filePath);
            // console.log(`Migrated image ${uuid} to ${setCode}`);
            continue;
          } catch (e) {
            console.error(`Failed to migrate image ${uuid}`, e);
          }
        }

        try {
          // Download
          const response = await fetch(imageUrl);
          if (response.ok) {
            const buffer = await response.arrayBuffer();
            fs.writeFileSync(filePath, Buffer.from(buffer));
            downloadedCount++;
            console.log(`Cached image: ${setCode}/${uuid}.jpg`);
          } else {
            console.error(`Failed to download ${imageUrl}: ${response.statusText}`);
          }
        } catch (err) {
          console.error(`Error downloading image for ${uuid}:`, err);
        }
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

      const setDir = path.join(this.metadataDir, card.set);
      if (!fs.existsSync(setDir)) {
        fs.mkdirSync(setDir, { recursive: true });
      }

      const filePath = path.join(setDir, `${card.id}.json`);
      if (!fs.existsSync(filePath)) {
        try {
          fs.writeFileSync(filePath, JSON.stringify(card, null, 2));
          // Check and delete legacy if exists
          const legacy = path.join(this.metadataDir, `${card.id}.json`);
          if (fs.existsSync(legacy)) fs.unlinkSync(legacy);

          cachedCount++;
        } catch (e) {
          console.error(`Failed to save metadata for ${card.id}`, e);
        }
      }
    }
    return cachedCount;
  }
}
