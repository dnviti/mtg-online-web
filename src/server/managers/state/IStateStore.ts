
export interface IStateStore {
  connect(): Promise<void>;

  // Basic K/V
  get(key: string): Promise<string | null>;
  getBuffer(key: string): Promise<Buffer | null>;
  set(key: string, value: string | Buffer, ttl?: number): Promise<void>;
  del(key: string): Promise<void>;

  // Sets (Simulated or Native)
  sadd(key: string, value: string): Promise<void>;
  srem(key: string, value: string): Promise<void>;
  srem(key: string, value: string): Promise<void>;
  smembers(key: string): Promise<string[]>;

  // Hashes
  hget(key: string, field: string): Promise<string | null>;
  hset(key: string, field: string, value: string): Promise<void>;
  hgetall(key: string): Promise<Record<string, string>>;

  // Locking
  acquireLock(key: string, ttl: number): Promise<boolean>;
  releaseLock(key: string): Promise<void>;
}
