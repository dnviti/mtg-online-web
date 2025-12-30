
// import { RoomManager } from './RoomManager';
// import { DraftManager } from './DraftManager';
// import { GameManager } from './GameManager';


export class PersistenceManager {
  // Legacy persistence is disabled in favor of Redis-backed distributed state.
  // This class is kept as a stub to avoid breaking imports.

  constructor() {
    // No-op
  }

  async save() {
    // No-op
    // console.log('[PersistenceManager] Periodic save skipped (Redis-Hybrid mode active)');
  }

  async load() {
    // No-op
    // console.log('[PersistenceManager] Load skipped (Redis-Hybrid mode active)');
  }
}
