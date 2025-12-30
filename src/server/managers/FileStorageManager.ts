import fs from 'fs';
import path from 'path';
import { StateStoreManager } from './StateStoreManager';

export class FileStorageManager {
  private storeManager: StateStoreManager;

  constructor() {
    this.storeManager = StateStoreManager.getInstance();
  }

  async saveFile(filePath: string, data: Buffer | string): Promise<void> {
    if (this.storeManager.fileStore) {
      await this.storeManager.fileStore.set(filePath, data);
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
    if (this.storeManager.fileStore) {
      return this.storeManager.fileStore.getBuffer(filePath);
    } else {
      // Local
      if (fs.existsSync(filePath)) {
        return fs.readFileSync(filePath);
      }
      return null;
    }
  }

  async exists(filePath: string): Promise<boolean> {
    if (this.storeManager.fileStore) {
      const val = await this.storeManager.fileStore.get(filePath);
      return !!val;
    } else {
      return fs.existsSync(filePath);
    }
  }
}

export const fileStorageManager = new FileStorageManager();
