import { EventEmitter } from 'events';
import { StateStoreManager } from './StateStoreManager';
import { BotDeckBuilderService } from '../services/BotDeckBuilderService';

interface Card {
  id: string; // instanceid or scryfall id
  name: string;
  image_uris?: { normal: string };
  card_faces?: { image_uris: { normal: string } }[];
  colors?: string[];
  rarity?: string;
  edhrecRank?: number;
  // ... other props
}

interface Pack {
  id: string;
  cards: Card[];
}

interface DraftState {
  roomId: string;
  seats: string[]; // PlayerIDs in seating order
  packNumber: number; // 1, 2, 3

  // State per player
  players: Record<string, {
    id: string;
    queue: Pack[]; // Packs passed to this player waiting to be viewed
    activePack: Pack | null; // The pack currently being looked at
    pool: Card[]; // Picked cards
    unopenedPacks: Pack[]; // Pack 2 and 3 kept aside
    isWaiting: boolean; // True if finished current pack round
    pickedInCurrentStep: number; // HOW MANY CARDS PICKED FROM CURRENT ACTIVE PACK
    pickExpiresAt: number; // Timestamp when auto-pick occurs
    isBot: boolean;
    deck?: Card[]; // Store constructed deck here
  }>;

  basicLands?: Card[]; // Store reference to available basic lands

  status: 'drafting' | 'deck_building' | 'complete';
  isPaused: boolean;
  startTime?: number; // For timer
}

export class DraftManager extends EventEmitter {
  private botBuilder = new BotDeckBuilderService();

  private get store() {
    const client = StateStoreManager.getInstance().store;
    if (!client) throw new Error("State Store not initialized");
    return client;
  }

  // --- Redis Helpers ---

  private async getDraftState(roomId: string): Promise<DraftState | null> {
    const data = await this.store.get(`draft:${roomId}`);
    return data ? JSON.parse(data) : null;
  }

  private async saveDraftState(draft: DraftState) {
    await this.store.set(`draft:${draft.roomId}`, JSON.stringify(draft));
    await this.store.sadd('active_drafts', draft.roomId);
  }

  private async acquireLock(roomId: string): Promise<boolean> {
    return this.store.acquireLock(`lock:draft:${roomId}`, 5);
  }

  private async releaseLock(roomId: string) {
    await this.store.releaseLock(`lock:draft:${roomId}`);
  }

  // --- Public Methods ---

  async createDraft(roomId: string, players: { id: string, isBot: boolean }[], allPacks: Pack[], basicLands: Card[] = []): Promise<DraftState> {
    // Distribute 3 packs to each player
    const sanitizedPacks = allPacks.map((p, idx) => ({
      ...p,
      id: `draft-pack-${idx}-${Math.random().toString(36).substr(2, 5)}`,
      cards: p.cards.map(c => ({ ...c }))
    }));

    // Shuffle packs
    const shuffledPacks = sanitizedPacks.sort(() => Math.random() - 0.5);

    const draftState: DraftState = {
      roomId,
      seats: players.map(p => p.id),
      packNumber: 1,
      players: {},
      status: 'drafting',
      isPaused: false,
      startTime: Date.now(),
      basicLands: basicLands
    };

    players.forEach((p, index) => {
      const pid = p.id;
      const playerPacks = shuffledPacks.slice(index * 3, (index + 1) * 3);
      const firstPack = playerPacks.shift();

      draftState.players[pid] = {
        id: pid,
        queue: [],
        activePack: firstPack || null,
        pool: [],
        unopenedPacks: playerPacks,
        isWaiting: false,
        pickedInCurrentStep: 0,
        pickExpiresAt: Date.now() + 60000,
        isBot: p.isBot
      };
    });

    await this.saveDraftState(draftState);
    return draftState;
  }

  async getDraft(roomId: string): Promise<DraftState | null> {
    return this.getDraftState(roomId);
  }

  async pickCard(roomId: string, playerId: string, cardId: string): Promise<DraftState | null> {
    // Acquire lock
    if (!(await this.acquireLock(roomId))) {
      return null; // Retry or fail
    }

    try {
      const draft = await this.getDraftState(roomId);
      if (!draft) return null;

      const playerState = draft.players[playerId];
      if (!playerState || !playerState.activePack) return null;

      // Find card
      const card = playerState.activePack.cards.find(c => c.id === cardId);
      if (!card) return null;

      // 1. Add to pool
      playerState.pool.push(card);
      console.log(`[DraftManager] ✅ Pick processed for Player ${playerId}: ${card.name} (${card.id})`);

      // 2. Remove from pack
      playerState.activePack.cards = playerState.activePack.cards.filter(c => c !== card);

      // Increment pick count for this step
      playerState.pickedInCurrentStep = (playerState.pickedInCurrentStep || 0) + 1;

      // Determine Picks Required
      const picksRequired = draft.seats.length === 4 ? 2 : 1;
      const shouldPass = playerState.pickedInCurrentStep >= picksRequired || playerState.activePack.cards.length === 0;

      if (!shouldPass) {
        await this.saveDraftState(draft);
        return draft;
      }

      // PASSED
      const passedPack = playerState.activePack;
      playerState.activePack = null;
      playerState.pickedInCurrentStep = 0;

      // 3. Logic for Passing or Discarding
      if (passedPack.cards.length > 0) {
        const seatIndex = draft.seats.indexOf(playerId);
        let nextSeatIndex;

        if (draft.packNumber === 2) {
          nextSeatIndex = (seatIndex - 1 + draft.seats.length) % draft.seats.length;
        } else {
          nextSeatIndex = (seatIndex + 1) % draft.seats.length;
        }

        const neighborId = draft.seats[nextSeatIndex];
        draft.players[neighborId].queue.push(passedPack);
        console.log(`[DraftManager] 📦 Passed pack (len: ${passedPack.cards.length}) from ${playerId} to ${neighborId}`);

        this.processQueue(draft, neighborId);
      } else {
        playerState.isWaiting = true;
        console.log(`[DraftManager] 🏁 Pack exhausted for ${playerId}. Waiting for next round.`);
        this.checkRoundCompletion(draft);
      }

      // 4. Try to assign new active pack for self from queue
      this.processQueue(draft, playerId);

      await this.saveDraftState(draft);
      return draft;
    } finally {
      await this.releaseLock(roomId);
    }
  }

  private processQueue(draft: DraftState, playerId: string) {
    const p = draft.players[playerId];
    if (!p.activePack && p.queue.length > 0) {
      p.activePack = p.queue.shift()!;
      console.log(`[DraftManager] 📥 Player ${playerId} opened new pack from queue. Cards: ${p.activePack.cards.length}`);
      p.pickedInCurrentStep = 0; // Reset for new pack
      p.pickExpiresAt = Date.now() + 60000; // Reset timer for new pack
    }
  }

  async checkTimers(): Promise<{ roomId: string, draft: DraftState }[]> {
    const updates: { roomId: string, draft: DraftState }[] = [];
    const now = Date.now();

    // Get active drafts from Set
    const activeDraftIds = await this.store.smembers('active_drafts');

    for (const roomId of activeDraftIds) {
      // Optimistic check: read without lock first
      // Actually, if we read without lock, we might act on stale data. 
      // But locking EVERY active draft every second is heavy.
      // Strategy: Try lock. If fail, skip.

      if (!(await this.acquireLock(roomId))) continue;

      try {
        const draft = await this.getDraftState(roomId);
        if (!draft) {
          // Cleanup stale ID?
          await this.store.srem('active_drafts', roomId);
          continue;
        }

        if (draft.isPaused) continue;

        let draftUpdated = false;

        if (draft.status === 'drafting') {
          for (const playerId of Object.keys(draft.players)) {
            const playerState = draft.players[playerId];
            if (playerState.activePack) {
              let shouldAutoPick = false;
              if (playerState.isBot) {
                shouldAutoPick = true;
              } else if (now > playerState.pickExpiresAt) {
                shouldAutoPick = true;
              }

              if (shouldAutoPick) {
                // We have the lock on 'roomId'. 
                // autoPickInternal is needed designed to work WITH existing lock or we must be careful calling pickCard which tries to acquire lock.
                // Refactor: split pickCard logic into internal (no lock) and public (lock).
                const result = await this.autoPickInternal(draft, playerId);
                if (result) draftUpdated = true;
              }
            }
          }

          if (draftUpdated) {
            await this.saveDraftState(draft);
            updates.push({ roomId, draft });
          }

        } else if (draft.status === 'deck_building') {
          const DECK_BUILDING_Duration = 999999999;
          if (draft.startTime && (now > draft.startTime + DECK_BUILDING_Duration)) {
            draft.status = 'complete';
            await this.saveDraftState(draft);
            updates.push({ roomId, draft });
          }
        }
      } finally {
        await this.releaseLock(roomId);
      }
    }
    return updates;
  }

  async setPaused(roomId: string, paused: boolean) {
    if (!(await this.acquireLock(roomId))) return;
    try {
      const draft = await this.getDraftState(roomId);
      if (draft) {
        draft.isPaused = paused;
        if (!paused) {
          Object.values(draft.players).forEach(p => {
            if (p.activePack) {
              p.pickExpiresAt = Date.now() + 60000;
            }
          });
        }
        await this.saveDraftState(draft);
      }
    } finally {
      await this.releaseLock(roomId);
    }
  }

  // Wrapper for external calls, handles locking
  async autoPick(roomId: string, playerId: string): Promise<DraftState | null> {
    if (!(await this.acquireLock(roomId))) return null;
    try {
      const draft = await this.getDraftState(roomId);
      if (!draft) return null;

      if (await this.autoPickInternal(draft, playerId)) {
        await this.saveDraftState(draft);
        return draft;
      }
      return null;
    } finally {
      await this.releaseLock(roomId);
    }
  }

  // Internal: expects draft object, does NOT save, does NOT lock. Returns true if modified.
  private async autoPickInternal(draft: DraftState, playerId: string): Promise<boolean> {
    const playerState = draft.players[playerId];
    if (!playerState || !playerState.activePack || playerState.activePack.cards.length === 0) return false;

    // Score cards
    const scoredCards = playerState.activePack.cards.map(c => {
      let score = 0;
      if (c.rarity === 'mythic') score += 5;
      else if (c.rarity === 'rare') score += 4;
      else if (c.rarity === 'uncommon') score += 2;
      else score += 1;

      const poolColors = playerState.pool.flatMap(p => p.colors || []);
      if (poolColors.length > 0 && c.colors) {
        c.colors.forEach(col => {
          const count = poolColors.filter(pc => pc === col).length;
          score += (count * 0.1);
        });
      }

      if (c.edhrecRank !== undefined && c.edhrecRank !== null) {
        const rank = c.edhrecRank;
        if (rank < 10000) {
          score += (5 * (1 - (rank / 10000)));
        }
      }
      return { card: c, score };
    });

    scoredCards.sort((a, b) => b.score - a.score);
    const card = scoredCards[0].card;

    // Reuse pick logic - BUT pickCard is async and locks. We need internal pick logic.
    // We duplicate pick logic here for synchronous in-memory update on the passed draft object.

    // 1. Add to pool
    playerState.pool.push(card);

    // 2. Remove from pack
    playerState.activePack.cards = playerState.activePack.cards.filter(c => c.id !== card.id);
    playerState.pickedInCurrentStep = (playerState.pickedInCurrentStep || 0) + 1;

    const picksRequired = draft.seats.length === 4 ? 2 : 1;
    const shouldPass = playerState.pickedInCurrentStep >= picksRequired || playerState.activePack.cards.length === 0;

    if (!shouldPass) return true;

    // PASSED
    const passedPack = playerState.activePack;
    playerState.activePack = null;
    playerState.pickedInCurrentStep = 0;

    if (passedPack.cards.length > 0) {
      const seatIndex = draft.seats.indexOf(playerId);
      let nextSeatIndex;
      if (draft.packNumber === 2) {
        nextSeatIndex = (seatIndex - 1 + draft.seats.length) % draft.seats.length;
      } else {
        nextSeatIndex = (seatIndex + 1) % draft.seats.length;
      }
      const neighborId = draft.seats[nextSeatIndex];
      draft.players[neighborId].queue.push(passedPack);
      this.processQueue(draft, neighborId);
    } else {
      playerState.isWaiting = true;
      this.checkRoundCompletion(draft);
    }

    this.processQueue(draft, playerId);
    return true;
  }

  private checkRoundCompletion(draft: DraftState) {
    const allWaiting = Object.values(draft.players).every(p => p.isWaiting);
    if (allWaiting) {
      if (draft.packNumber < 3) {
        draft.packNumber++;
        Object.values(draft.players).forEach(p => {
          p.isWaiting = false;
          const nextPack = p.unopenedPacks.shift();
          if (nextPack) {
            p.activePack = nextPack;
            p.pickedInCurrentStep = 0;
            p.pickExpiresAt = Date.now() + 60000;
          }
        });
      } else {
        draft.status = 'deck_building';
        draft.startTime = Date.now();

        Object.values(draft.players).forEach(p => {
          if (p.isBot) {
            const lands = draft.basicLands || [];
            const deck = this.botBuilder.buildDeck(p.pool, lands);
            p.deck = deck;
          }
        });
      }
    }
  }

  public async logDraftState(roomId: string) {
    const draft = await this.getDraftState(roomId);
    if (!draft) return;
    console.log(`--- Draft State ${roomId} ---`);
    Object.values(draft.players).forEach(p => {
      console.log(`Player ${p.id} (Bot: ${p.isBot}): Active=${p.activePack?.id || 'None'}, Queue=${p.queue.length}`);
    });
    console.log(`-----------------------------`);
  }
}
