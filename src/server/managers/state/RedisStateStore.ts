
import Redis from 'ioredis';
import { IStateStore } from './IStateStore';

export class RedisStateStore implements IStateStore {
  private client: Redis;

  constructor(host: string, port: number, db: number) {
    this.client = new Redis({
      host,
      port,
      db
    });
  }

  async connect(): Promise<void> {
    // ioredis connects lazily, but we can verify
    if (this.client.status === 'close') {
      await this.client.connect();
    }
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async getBuffer(key: string): Promise<Buffer | null> {
    return this.client.getBuffer(key);
  }

  async set(key: string, value: string | Buffer, ttl?: number): Promise<void> {
    if (ttl) {
      await this.client.set(key, value, 'EX', ttl);
    } else {
      await this.client.set(key, value);
    }
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async sadd(key: string, value: string): Promise<void> {
    await this.client.sadd(key, value);
  }

  async srem(key: string, value: string): Promise<void> {
    await this.client.srem(key, value);
  }

  async smembers(key: string): Promise<string[]> {
    return this.client.smembers(key);
  }

  async hget(key: string, field: string): Promise<string | null> {
    return this.client.hget(key, field);
  }

  async hset(key: string, field: string, value: string): Promise<void> {
    await this.client.hset(key, field, value);
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    return this.client.hgetall(key);
  }

  async acquireLock(key: string, ttl: number): Promise<boolean> {
    // Retry for up to 2 seconds (handle double-clicks or quick sequential actions)
    const timeout = 2000;
    const start = Date.now();

    while (Date.now() - start < timeout) {
      // Use EX, ttl, NX order which is standard
      const res = await (this.client as any).set(key, '1', 'EX', ttl, 'NX');
      if (res === 'OK') return true;

      // Wait 100ms before retrying
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return false;
  }

  async releaseLock(key: string): Promise<void> {
    await this.client.del(key);
  }
}
