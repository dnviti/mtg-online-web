
import { IStateStore } from './state/IStateStore';
import { RedisStateStore } from './state/RedisStateStore';
import { MemcachedStateStore } from './state/MemcachedStateStore';

export class StateStoreManager {
  private static instance: StateStoreManager;
  public store: IStateStore;
  public fileStore: IStateStore | null = null; // Used for DB1 equivalent if supported

  private constructor() {
    const useRedis = process.env.USE_REDIS === 'true';

    if (useRedis) {
      const host = process.env.REDIS_HOST || 'localhost';
      const port = parseInt(process.env.REDIS_PORT || '6379', 10);
      console.log(`[StateStoreManager] Initializing Redis State Store at ${host}:${port}`);

      this.store = new RedisStateStore(host, port, 0);
      this.fileStore = new RedisStateStore(host, port, 1);

      this.store.connect();
      this.fileStore.connect();
    } else {
      console.log('[StateStoreManager] Initializing Memcached State Store (No Redis)');
      // Default Memcached port 11211
      // User requested "memcache", assuming standard config or default local.
      const host = process.env.MEMCACHED_HOST || 'localhost';
      const port = parseInt(process.env.MEMCACHED_PORT || '11211', 10);

      this.store = new MemcachedStateStore(host, port);
      this.store.connect();

      // File Store in Memcached? Limits are tight (1MB). 
      // Better to disable fileStore for Memcached and rely on Local FS.
      this.fileStore = null;
    }
  }

  public static getInstance(): StateStoreManager {
    if (!StateStoreManager.instance) {
      StateStoreManager.instance = new StateStoreManager();
    }
    return StateStoreManager.instance;
  }
}
