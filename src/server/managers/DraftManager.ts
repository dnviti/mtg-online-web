
import { EventEmitter } from 'events';

interface Card {
  id: string; // instanceid or scryfall id
  name: string;
  image_uris?: { normal: string };
  card_faces?: { image_uris: { normal: string } }[];
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
  }>;

  status: 'drafting' | 'deck_building' | 'complete';
  startTime?: number; // For timer
}

export class DraftManager extends EventEmitter {
  private drafts: Map<string, DraftState> = new Map();

  createDraft(roomId: string, players: string[], allPacks: Pack[]): DraftState {
    // Distribute 3 packs to each player
    // Assume allPacks contains (3 * numPlayers) packs

    // DEEP CLONE PACKS to ensure no shared references
    // And assign unique internal IDs to avoid collisions
    const sanitizedPacks = allPacks.map((p, idx) => ({
      ...p,
      id: `draft-pack-${idx}-${Math.random().toString(36).substr(2, 5)}`,
      cards: p.cards.map(c => ({ ...c })) // Shallow clone cards to protect against mutation if needed
    }));

    // Shuffle packs
    const shuffledPacks = sanitizedPacks.sort(() => Math.random() - 0.5);

    const draftState: DraftState = {
      roomId,
      seats: players, // Assume order is randomized or fixed
      packNumber: 1,
      players: {},
      status: 'drafting',
      startTime: Date.now()
    };

    players.forEach((pid, index) => {
      const playerPacks = shuffledPacks.slice(index * 3, (index + 1) * 3);
      const firstPack = playerPacks.shift(); // Open Pack 1 immediately

      draftState.players[pid] = {
        id: pid,
        queue: [],
        activePack: firstPack || null,
        pool: [],
        unopenedPacks: playerPacks,
        isWaiting: false,
        pickedInCurrentStep: 0
      };
    });

    this.drafts.set(roomId, draftState);
    return draftState;
  }

  getDraft(roomId: string): DraftState | undefined {
    return this.drafts.get(roomId);
  }

  pickCard(roomId: string, playerId: string, cardId: string): DraftState | null {
    const draft = this.drafts.get(roomId);
    if (!draft) return null;

    const playerState = draft.players[playerId];
    if (!playerState || !playerState.activePack) return null;

    // Find card
    // uniqueId check implies if cards have unique instance IDs in pack, if not we rely on strict equality or assume 1 instance per pack

    // Fallback: If we can't find by ID (if Scryfall ID generic), just pick the first matching ID? 
    // We should ideally assume the frontend sends the exact card object or unique index.
    // For now assuming cardId is unique enough or we pick first match.
    // Better: In a draft, a pack might have 2 duplicates. We need index or unique ID.
    // Let's assume the pack generation gave unique IDs or we just pick by index.
    // I'll stick to ID for now, assuming unique.

    const card = playerState.activePack.cards.find(c => c.id === cardId);
    if (!card) return null;

    // 1. Add to pool
    playerState.pool.push(card);

    // 2. Remove from pack
    playerState.activePack.cards = playerState.activePack.cards.filter(c => c !== card);

    // Increment pick count for this step
    playerState.pickedInCurrentStep = (playerState.pickedInCurrentStep || 0) + 1;

    // Determine Picks Required
    // Rule: 4 players -> Pick 2. Others -> Pick 1.
    const picksRequired = draft.seats.length === 4 ? 2 : 1;

    // Check if we should pass the pack
    // Pass if: Picked enough cards OR Pack is empty
    const shouldPass = playerState.pickedInCurrentStep >= picksRequired || playerState.activePack.cards.length === 0;

    if (!shouldPass) {
      // Do not pass yet. Returns state so UI updates pool and removes card from view.
      return draft;
    }

    // PASSED
    const passedPack = playerState.activePack;
    playerState.activePack = null;
    playerState.pickedInCurrentStep = 0; // Reset for next pack

    // 3. Logic for Passing or Discarding (End of Pack)
    if (passedPack.cards.length > 0) {
      // Pass to neighbor
      const seatIndex = draft.seats.indexOf(playerId);
      let nextSeatIndex;

      // Pack 1: Left (Increase Index), Pack 2: Right (Decrease), Pack 3: Left
      if (draft.packNumber === 2) {
        nextSeatIndex = (seatIndex - 1 + draft.seats.length) % draft.seats.length;
      } else {
        nextSeatIndex = (seatIndex + 1) % draft.seats.length;
      }

      const neighborId = draft.seats[nextSeatIndex];
      draft.players[neighborId].queue.push(passedPack);

      // Try to assign active pack for neighbor if they are empty
      this.processQueue(draft, neighborId);
    } else {
      // Pack is empty/exhausted
      playerState.isWaiting = true;
      this.checkRoundCompletion(draft);
    }

    // 4. Try to assign new active pack for self from queue
    this.processQueue(draft, playerId);

    return draft;
  }

  private processQueue(draft: DraftState, playerId: string) {
    const p = draft.players[playerId];
    if (!p.activePack && p.queue.length > 0) {
      p.activePack = p.queue.shift()!;
      p.pickedInCurrentStep = 0; // Reset for new pack
    }
  }

  private checkRoundCompletion(draft: DraftState) {
    const allWaiting = Object.values(draft.players).every(p => p.isWaiting);
    if (allWaiting) {
      // Start Next Round
      if (draft.packNumber < 3) {
        draft.packNumber++;
        // Open next pack for everyone
        Object.values(draft.players).forEach(p => {
          p.isWaiting = false;
          const nextPack = p.unopenedPacks.shift();
          if (nextPack) {
            p.activePack = nextPack;
            p.pickedInCurrentStep = 0; // Reset
          }
        });
      } else {
        // Draft Complete
        draft.status = 'deck_building';
        draft.startTime = Date.now(); // Start deck building timer
      }
    }
  }
}
