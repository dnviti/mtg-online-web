
import { EventEmitter } from 'events';

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

import { BotDeckBuilderService } from '../services/BotDeckBuilderService'; // Import service

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
  private drafts: Map<string, DraftState> = new Map();

  private botBuilder = new BotDeckBuilderService();

  createDraft(roomId: string, players: { id: string, isBot: boolean }[], allPacks: Pack[], basicLands: Card[] = []): DraftState {
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
      seats: players.map(p => p.id), // Assume order is randomized or fixed
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
      const firstPack = playerPacks.shift(); // Open Pack 1 immediately

      draftState.players[pid] = {
        id: pid,
        queue: [],
        activePack: firstPack || null,
        pool: [],
        unopenedPacks: playerPacks,
        isWaiting: false,
        pickedInCurrentStep: 0,
        pickExpiresAt: Date.now() + 60000, // 60 seconds for first pack
        isBot: p.isBot
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
      console.log(`[DraftManager] 📦 Passed pack (len: ${passedPack.cards.length}) from ${playerId} to ${neighborId}`);

      // Try to assign active pack for neighbor if they are empty
      this.processQueue(draft, neighborId);
    } else {
      // Pack is empty/exhausted
      playerState.isWaiting = true;
      console.log(`[DraftManager] 🏁 Pack exhausted for ${playerId}. Waiting for next round.`);
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
      console.log(`[DraftManager] 📥 Player ${playerId} opened new pack from queue. Cards: ${p.activePack.cards.length}`);
      p.pickedInCurrentStep = 0; // Reset for new pack
      p.pickExpiresAt = Date.now() + 60000; // Reset timer for new pack
    }
  }

  checkTimers(): { roomId: string, draft: DraftState }[] {
    const updates: { roomId: string, draft: DraftState }[] = [];
    const now = Date.now();

    for (const [roomId, draft] of this.drafts.entries()) {
      if (draft.isPaused) continue;

      if (draft.status === 'drafting') {
        let draftUpdated = false;
        // Iterate over players
        for (const playerId of Object.keys(draft.players)) {
          const playerState = draft.players[playerId];
          // Check if player is thinking (has active pack) and time expired
          // OR if player is a BOT (Auto-Pick immediately)
          // OR if player is a BOT (Auto-Pick immediately)
          if (playerState.activePack) {
            if (playerState.isBot) {
              // Force auto-pick
              const result = this.autoPick(roomId, playerId);
              if (result) {
                draftUpdated = true;
              } else {
                console.warn(`[DraftManager] ⚠️ Bot ${playerId} has active pack but autoPick returned null! Pack len: ${playerState.activePack.cards.length}`);
              }
            } else if (now > playerState.pickExpiresAt) {
              const result = this.autoPick(roomId, playerId);
              if (result) draftUpdated = true;
            }
          }
        }
        if (draftUpdated) {
          updates.push({ roomId, draft });
        }
      } else if (draft.status === 'deck_building') {
        // Check global deck building timer (e.g., 120 seconds)
        // Disabling timeout as per request. Set to ~11.5 days.
        const DECK_BUILDING_Duration = 999999999;
        if (draft.startTime && (now > draft.startTime + DECK_BUILDING_Duration)) {
          draft.status = 'complete'; // Signal that time is up
          updates.push({ roomId, draft });
        }
      }
    }
    return updates;
  }

  setPaused(roomId: string, paused: boolean) {
    const draft = this.drafts.get(roomId);
    if (draft) {
      draft.isPaused = paused;
      if (!paused) {
        // Reset timers to 60s
        Object.values(draft.players).forEach(p => {
          if (p.activePack) {
            p.pickExpiresAt = Date.now() + 60000;
          }
        });
      }
    }
  }

  autoPick(roomId: string, playerId: string): DraftState | null {
    const draft = this.drafts.get(roomId);
    if (!draft) return null;

    const playerState = draft.players[playerId];
    if (!playerState || !playerState.activePack || playerState.activePack.cards.length === 0) return null;

    // Score cards
    const scoredCards = playerState.activePack.cards.map(c => {
      let score = 0;

      // 1. Rarity Base Score
      if (c.rarity === 'mythic') score += 5;
      else if (c.rarity === 'rare') score += 4;
      else if (c.rarity === 'uncommon') score += 2;
      else score += 1;

      // 2. Color Synergy (Simple)
      const poolColors = playerState.pool.flatMap(p => p.colors || []);
      if (poolColors.length > 0 && c.colors) {
        c.colors.forEach(col => {
          const count = poolColors.filter(pc => pc === col).length;
          score += (count * 0.1);
        });
      }

      // 3. EDHREC Score (Lower rank = better)
      if (c.edhrecRank !== undefined && c.edhrecRank !== null) {
        const rank = c.edhrecRank;
        if (rank < 10000) {
          score += (5 * (1 - (rank / 10000)));
        }
      }

      return { card: c, score };
    });

    // Sort by score desc
    scoredCards.sort((a, b) => b.score - a.score);

    // Pick top card

    // Pick top card
    const card = scoredCards[0].card;

    // Log intent
    // console.log(`[DraftManager] 🤖 Bot ${playerId} picking ${card.name} (${card.id})`);

    // Reuse existing logic
    const result = this.pickCard(roomId, playerId, card.id);
    if (!result) {
      console.error(`[DraftManager] ❌ Bot ${playerId} failed to pick ${card.name} (pickCard returned null)`);
    }
    return result;
  }

  // Debug helper
  public logDraftState(roomId: string) {
    const draft = this.drafts.get(roomId);
    if (!draft) return;
    console.log(`--- Draft State ${roomId} ---`);
    Object.values(draft.players).forEach(p => {
      console.log(`Player ${p.id} (Bot: ${p.isBot}): Active=${p.activePack?.id || 'None'} (${p.activePack?.cards.length || 0}), Queue=${p.queue.length}, Waiting=${p.isWaiting}`);
    });
    console.log(`-----------------------------`);
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
            p.pickExpiresAt = Date.now() + 60000; // Reset timer
          }
        });
      } else {
        // Draft Complete
        draft.status = 'deck_building';
        draft.startTime = Date.now(); // Start deck building timer

        // AUTO-BUILD BOT DECKS
        Object.values(draft.players).forEach(p => {
          if (p.isBot) {
            // Build deck

            const lands = draft.basicLands || [];
            const deck = this.botBuilder.buildDeck(p.pool, lands);
            p.deck = deck;
            console.log(`[DraftManager] 🤖 Bot ${p.id} deck built with ${deck.length} cards.`);
          }
        });
      }
    }
  }
}
