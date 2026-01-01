
import { IStateStore } from './state/IStateStore';
import { RedisStateStore } from './state/RedisStateStore';
import { MemcachedStateStore } from './state/MemcachedStateStore';

export class StateStoreManager {
  private static instance: StateStoreManager;
  public store: IStateStore;
  public metadataStore: IStateStore | null = null; // DB 1: Metadata Index

  private constructor() {
    const useRedis = process.env.USE_REDIS === 'true';

    if (useRedis) {
      const host = process.env.REDIS_HOST || 'localhost';
      const port = parseInt(process.env.REDIS_PORT || '6379', 10);
      console.log(`[StateStoreManager] Initializing Redis State Store at ${host}:${port}`);

      this.store = new RedisStateStore(host, port, 0);
      this.metadataStore = new RedisStateStore(host, port, 1);

      this.store.connect();
      this.metadataStore.connect();
    } else {
      console.log('[StateStoreManager] Initializing Memcached State Store (No Redis)');
      // Default Memcached port 11211
      // User requested "memcache", assuming standard config or default local.
      const host = process.env.MEMCACHED_HOST || 'localhost';
      const port = parseInt(process.env.MEMCACHED_PORT || '11211', 10);

      this.store = new MemcachedStateStore(host, port);
      this.store.connect();

      this.metadataStore = null;
    }
  }

  public static getInstance(): StateStoreManager {
    if (!StateStoreManager.instance) {
      StateStoreManager.instance = new StateStoreManager();
    }
    return StateStoreManager.instance;
  }
}
