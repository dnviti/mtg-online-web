
export interface Card {
  id: string; // instanceid or scryfall id
  name: string;
  image_uris?: { normal: string };
  card_faces?: { image_uris: { normal: string } }[];
  colors?: string[];
  rarity?: string;
  edhrecRank?: number;
  // ... other props
}

export interface Pack {
  id: string;
  cards: Card[];
}

export interface PlayerDraftState {
  id: string;
  queue: Pack[]; // Packs passed to this player waiting to be viewed
  activePack: Pack | null; // The pack currently being looked at
  pool: Card[]; // Picked cards
  unopenedPacks: Pack[]; // Pack 2 and 3 kept aside
  isWaiting: boolean; // True if finished current pack round
  pickedInCurrentStep: number; // HOW MANY CARDS PICKED FROM CURRENT ACTIVE PACK
  pickExpiresAt: number; // Timestamp when auto-pick occurs
  deck?: Card[]; // Store constructed deck here
}

export interface DraftState {
  roomId: string;
  seats: string[]; // PlayerIDs in seating order
  packNumber: number; // 1, 2, 3

  // State per player
  players: Record<string, PlayerDraftState>;

  basicLands?: Card[]; // Store reference to available basic lands

  status: 'drafting' | 'deck_building' | 'complete';
  isPaused: boolean;
  startTime?: number; // For timer
}
