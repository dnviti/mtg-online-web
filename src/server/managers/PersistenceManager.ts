
import { RoomManager } from './RoomManager';
import { DraftManager } from './DraftManager';
import { GameManager } from './GameManager';

import { RedisClientManager } from './RedisClientManager';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

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
  }

  async save() {
    try {
      // Accessing private maps via any cast
      const rooms = Array.from((this.roomManager as any).rooms.values());
      const drafts = Array.from((this.draftManager as any).drafts.values());
      const games = Array.from((this.gameManager as any).games.values());

      // Save to Database
      for (const room of rooms) {
        const r = room as any;
        await prisma.room.upsert({
          where: { id: r.id },
          update: { data: JSON.stringify(r) },
          create: { id: r.id, data: JSON.stringify(r) }
        });
      }

      for (const draft of drafts) {
        const d = draft as any;
        await prisma.draft.upsert({
          where: { id: d.id },
          update: { data: JSON.stringify(d) },
          create: { id: d.id, data: JSON.stringify(d) }
        });
      }

      for (const game of games) {
        const g = game as any;
        await prisma.game.upsert({
          where: { id: g.id },
          update: { data: JSON.stringify(g) },
          create: { id: g.id, data: JSON.stringify(g) }
        });
      }

      // Optional: Sync to Redis if available (Architecture wise, DB is now the SOT)
      if (this.redisManager.db0) {
        const pipeline = this.redisManager.db0.pipeline();
        pipeline.set('rooms', JSON.stringify(Array.from((this.roomManager as any).rooms.entries())));
        pipeline.set('drafts', JSON.stringify(Array.from((this.draftManager as any).drafts.entries())));
        pipeline.set('games', JSON.stringify(Array.from((this.gameManager as any).games.entries())));
        await pipeline.exec();
      }

      console.log('State saved to Database (and Redis if active)');

    } catch (e) {
      console.error('Failed to save state', e);
    }
  }

  async load() {
    try {
      // Start with DB Load
      const dbRooms = await prisma.room.findMany();
      const dbDrafts = await prisma.draft.findMany();
      const dbGames = await prisma.game.findMany();

      // Transform back to Maps
      // Note: The original JSON save stored [id, obj] entries. 
      // DB stores the objects directly in 'data' column. We need to reconstruct the Map.

      if (dbRooms.length > 0) {
        const roomEntries = dbRooms.map(r => [r.id, JSON.parse(r.data)]);
        (this.roomManager as any).rooms = new Map(roomEntries as any);
        console.log(`[DB] Loaded ${dbRooms.length} rooms`);
      }

      if (dbDrafts.length > 0) {
        const draftEntries = dbDrafts.map(d => [d.id, JSON.parse(d.data)]);
        (this.draftManager as any).drafts = new Map(draftEntries as any);
        console.log(`[DB] Loaded ${dbDrafts.length} drafts`);
      }

      if (dbGames.length > 0) {
        const gameEntries = dbGames.map(g => [g.id, JSON.parse(g.data)]);
        (this.gameManager as any).games = new Map(gameEntries as any);
        console.log(`[DB] Loaded ${dbGames.length} games`);
      }

      // Note: Existing Redis logic loaded *entire* state blob. 
      // Since users complained about inefficiencies, DB granular loading (even if all for now) is better.
      // We skip Redis load to ensure DB SOT is used. Redis can be repopulated on next save.

    } catch (e) {
      console.error('Failed to load state', e);
    }
  }
}
