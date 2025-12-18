
import Redis from 'ioredis';

export class RedisClientManager {
  private static instance: RedisClientManager;
  public db0: Redis | null = null; // Session Persistence
  public db1: Redis | null = null; // File Storage

  private constructor() {
    const useRedis = process.env.USE_REDIS === 'true';
    const redisHost = process.env.REDIS_HOST || 'localhost';
    const redisPort = parseInt(process.env.REDIS_PORT || '6379', 10);

    if (useRedis) {
      console.log(`[RedisManager] Connecting to Redis at ${redisHost}:${redisPort}...`);

      this.db0 = new Redis({
        host: redisHost,
        port: redisPort,
        db: 0,
        retryStrategy: (times) => Math.min(times * 50, 2000)
      });

      this.db1 = new Redis({
        host: redisHost,
        port: redisPort,
        db: 1,
        retryStrategy: (times) => Math.min(times * 50, 2000)
      });

      this.db0.on('connect', () => console.log('[RedisManager] DB0 Connected'));
      this.db0.on('error', (err) => console.error('[RedisManager] DB0 Error', err));

      this.db1.on('connect', () => console.log('[RedisManager] DB1 Connected'));
      this.db1.on('error', (err) => console.error('[RedisManager] DB1 Error', err));
    } else {
      console.log('[RedisManager] Redis disabled. Using local storage.');
    }
  }

  public static getInstance(): RedisClientManager {
    if (!RedisClientManager.instance) {
      RedisClientManager.instance = new RedisClientManager();
    }
    return RedisClientManager.instance;
  }

  public async quit() {
    if (this.db0) await this.db0.quit();
    if (this.db1) await this.db1.quit();
  }
}
