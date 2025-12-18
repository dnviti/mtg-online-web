
import fs from 'fs';
import path from 'path';
import { RedisClientManager } from './RedisClientManager';

export class FileStorageManager {
  private redisManager: RedisClientManager;

  constructor() {
    this.redisManager = RedisClientManager.getInstance();
  }

  async saveFile(filePath: string, data: Buffer | string): Promise<void> {
    if (this.redisManager.db1) {
      // Use Redis DB1
      // Key: Normalize path to be relative to project root or something unique?
      // Simple approach: Use absolute path (careful with different servers) or relative path key.
      // Let's assume filePath passed in is absolute. We iterate up to remove common prefix if we want cleaner keys,
      // but absolute is safest uniqueness.
      await this.redisManager.db1.set(filePath, typeof data === 'string' ? data : data.toString('binary'));
    } else {
      // Local File System
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(filePath, data);
    }
  }

  async readFile(filePath: string): Promise<Buffer | null> {
    if (this.redisManager.db1) {
      // Redis DB1
      const data = await this.redisManager.db1.getBuffer(filePath);
      return data;
    } else {
      // Local
      if (fs.existsSync(filePath)) {
        return fs.readFileSync(filePath);
      }
      return null;
    }
  }

  async exists(filePath: string): Promise<boolean> {
    if (this.redisManager.db1) {
      const exists = await this.redisManager.db1.exists(filePath);
      return exists > 0;
    } else {
      return fs.existsSync(filePath);
    }
  }
}

export const fileStorageManager = new FileStorageManager();
