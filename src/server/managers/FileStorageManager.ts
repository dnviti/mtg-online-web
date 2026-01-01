import fs from 'fs';
import path from 'path';

/**
 * Manages file system operations.
 * Now strictly Local FS (images are NOT stored in Redis binaries).
 */
export class FileStorageManager {

  constructor() {
    // No Redis dependency
  }

  async saveFile(filePath: string, data: Buffer | string): Promise<void> {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, data);
  }

  async readFile(filePath: string): Promise<Buffer | null> {
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath);
    }
    return null;
  }

  async exists(filePath: string): Promise<boolean> {
    return fs.existsSync(filePath);
  }
}

export const fileStorageManager = new FileStorageManager();
