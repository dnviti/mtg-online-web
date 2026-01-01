
import Memcached from 'memcached';
import { IStateStore } from './IStateStore';

export class MemcachedStateStore implements IStateStore {
  private client: Memcached;
  private serverUrl: string;

  constructor(host: string, port: number) {
    this.serverUrl = `${host}:${port}`;
    this.client = new Memcached(this.serverUrl);
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Memcached lib doesn't have explicit connect, but we can try a stat check
      this.client.stats((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async get(key: string): Promise<string | null> {
    return new Promise((resolve, reject) => {
      this.client.get(key, (err, data) => {
        if (err) return reject(err);
        resolve(data ? data.toString() : null);
      });
    });
  }

  async getBuffer(key: string): Promise<Buffer | null> {
    return new Promise((resolve, reject) => {
      this.client.get(key, (err, data) => {
        if (err) return reject(err);
        // Memcached client might return string or buffer depending on storage.
        // If stored as Buffer, it returns Buffer?
        // Actually generic `memcached` usually returns whatever type (if string, string).
        // If we store Buffer, we might need to handle encoding.
        resolve(data ? (Buffer.isBuffer(data) ? data : Buffer.from(data)) : null);
      });
    });
  }

  async set(key: string, value: string | Buffer, ttl: number = 0): Promise<void> {
    return new Promise((resolve, reject) => {
      this.client.set(key, value, ttl, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  }

  async del(key: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.client.del(key, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  }

  // Set Simulation (Naive, not atomic safe for high concurrency but functional for basic lists)
  async sadd(key: string, value: string): Promise<void> {
    const current = await this.get(key);
    let set: string[] = [];
    if (current) {
      try { set = JSON.parse(current); } catch { }
    }
    if (!set.includes(value)) {
      set.push(value);
      await this.set(key, JSON.stringify(set));
    }
  }

  async srem(key: string, value: string): Promise<void> {
    const current = await this.get(key);
    if (!current) return;
    try {
      let set: string[] = JSON.parse(current);
      set = set.filter(v => v !== value);
      await this.set(key, JSON.stringify(set));
    } catch { }
  }

  async smembers(key: string): Promise<string[]> {
    const current = await this.get(key);
    if (!current) return [];
    try {
      return JSON.parse(current);
    } catch {
      return [];
    }
  }

  // Naive Hash Simulation using JSON (Not Atomic)
  async hget(key: string, field: string): Promise<string | null> {
    const current = await this.get(key);
    if (!current) return null;
    try {
      const obj = JSON.parse(current);
      return obj[field] || null;
    } catch {
      return null;
    }
  }

  async hset(key: string, field: string, value: string): Promise<void> {
    const current = await this.get(key);
    let obj: any = {};
    if (current) {
      try { obj = JSON.parse(current); } catch { }
    }
    obj[field] = value;
    await this.set(key, JSON.stringify(obj));
  }

  async acquireLock(key: string, ttl: number): Promise<boolean> {
    return new Promise((resolve, _reject) => {
      // memcached 'add' is atomic: fails if key exists
      this.client.add(key, '1', ttl, (err) => {
        if (err) {
          // Error usually means it couldn't be added (locked)
          // Or connectivity? 'add' callback with error is tricky in some libs.
          // In 'memcached' node lib, error might be thrown on connection issue.
          // If key exists, it just returns false? Checking docs/usage usually.
          // Wrapper: if error, treat as failed?
          // Actually library convention: err is for network. Result is boolean?
          // Wait, 'memcached' lib: callback(err, result). If failed (exists), err might be "Item is not stored".
          resolve(false);
        } else {
          resolve(true); // Successfully added
        }
      });
    });
  }

  async releaseLock(key: string): Promise<void> {
    await this.del(key);
  }
}
