
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CARDS_DIR = path.join(__dirname, '../public/cards');

export class CardService {
  constructor() {
    if (!fs.existsSync(CARDS_DIR)) {
      fs.mkdirSync(CARDS_DIR, { recursive: true });
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

        // Determine UUID and URL
        const uuid = card.id || card.oracle_id; // Prefer ID
        if (!uuid) continue;

        // Check for normal image
        let imageUrl = card.image_uris?.normal;
        if (!imageUrl && card.card_faces && card.card_faces.length > 0) {
          imageUrl = card.card_faces[0].image_uris?.normal;
        }

        if (!imageUrl) continue;

        const filePath = path.join(CARDS_DIR, `${uuid}.jpg`);

        if (fs.existsSync(filePath)) {
          // Already cached
          continue;
        }

        try {
          // Download
          const response = await fetch(imageUrl);
          if (response.ok) {
            const buffer = await response.arrayBuffer();
            fs.writeFileSync(filePath, Buffer.from(buffer));
            downloadedCount++;
            console.log(`Cached image: ${uuid}.jpg`);
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
}
