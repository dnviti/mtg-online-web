
import fs from 'fs';
import path from 'path';
import { RoomManager } from './RoomManager';
import { DraftManager } from './DraftManager';
import { GameManager } from './GameManager';
import { fileURLToPath } from 'url';
import { RedisClientManager } from './RedisClientManager';

// Handling __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Store data in src/server/data so it persists (assuming not inside a dist that gets wiped, but user root)
const DATA_DIR = path.resolve(process.cwd(), 'server-data');

export class PersistenceManager {
  private roomManager: RoomManager;
  private draftManager: DraftManager;
  private gameManager: GameManager;
  private redisManager: RedisClientManager;

  constructor(roomManager: RoomManager, draftManager: DraftManager, gameManager: GameManager) {
    this.roomManager = roomManager;
    this.draftManager = draftManager;
    this.gameManager = gameManager;
    this.redisManager = RedisClientManager.getInstance();

    if (!this.redisManager.db0 && !fs.existsSync(DATA_DIR)) {
      console.log(`Creating data directory at ${DATA_DIR}`);
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  }

  async save() {
    try {
      // Accessing private maps via any cast for simplicity without modifying all manager classes to add getters
      const rooms = Array.from((this.roomManager as any).rooms.entries());
      const drafts = Array.from((this.draftManager as any).drafts.entries());
      const games = Array.from((this.gameManager as any).games.entries());

      if (this.redisManager.db0) {
        // Save to Redis
        const pipeline = this.redisManager.db0.pipeline();
        pipeline.set('rooms', JSON.stringify(rooms));
        pipeline.set('drafts', JSON.stringify(drafts));
        pipeline.set('games', JSON.stringify(games));
        await pipeline.exec();
        // console.log('State saved to Redis');
      } else {
        // Save to Local File
        fs.writeFileSync(path.join(DATA_DIR, 'rooms.json'), JSON.stringify(rooms));
        fs.writeFileSync(path.join(DATA_DIR, 'drafts.json'), JSON.stringify(drafts));
        fs.writeFileSync(path.join(DATA_DIR, 'games.json'), JSON.stringify(games));
      }

    } catch (e) {
      console.error('Failed to save state', e);
    }
  }

  async load() {
    try {
      if (this.redisManager.db0) {
        // Load from Redis
        const [roomsData, draftsData, gamesData] = await Promise.all([
          this.redisManager.db0.get('rooms'),
          this.redisManager.db0.get('drafts'),
          this.redisManager.db0.get('games')
        ]);

        if (roomsData) {
          (this.roomManager as any).rooms = new Map(JSON.parse(roomsData));
          console.log(`[Redis] Loaded ${(this.roomManager as any).rooms.size} rooms`);
        }
        if (draftsData) {
          (this.draftManager as any).drafts = new Map(JSON.parse(draftsData));
          console.log(`[Redis] Loaded ${(this.draftManager as any).drafts.size} drafts`);
        }
        if (gamesData) {
          (this.gameManager as any).games = new Map(JSON.parse(gamesData));
          console.log(`[Redis] Loaded ${(this.gameManager as any).games.size} games`);
        }

      } else {
        // Load from Local File
        const roomFile = path.join(DATA_DIR, 'rooms.json');
        const draftFile = path.join(DATA_DIR, 'drafts.json');
        const gameFile = path.join(DATA_DIR, 'games.json');

        if (fs.existsSync(roomFile)) {
          const roomsData = JSON.parse(fs.readFileSync(roomFile, 'utf-8'));
          (this.roomManager as any).rooms = new Map(roomsData);
          console.log(`[Local] Loaded ${roomsData.length} rooms`);
        }

        if (fs.existsSync(draftFile)) {
          const draftsData = JSON.parse(fs.readFileSync(draftFile, 'utf-8'));
          (this.draftManager as any).drafts = new Map(draftsData);
          console.log(`[Local] Loaded ${draftsData.length} drafts`);
        }

        if (fs.existsSync(gameFile)) {
          const gamesData = JSON.parse(fs.readFileSync(gameFile, 'utf-8'));
          (this.gameManager as any).games = new Map(gamesData);
          console.log(`[Local] Loaded ${gamesData.length} games`);
        }
      }

    } catch (e) {
      console.error('Failed to load state', e);
    }
  }
}
