export interface CardInstance {
  instanceId: string;
  oracleId: string; // Scryfall ID
  name: string;
  imageUrl: string;
  controllerId: string;
  ownerId: string;
  zone: 'library' | 'hand' | 'battlefield' | 'graveyard' | 'exile' | 'command';
  tapped: boolean;
  faceDown: boolean;
  position: { x: number; y: number; z: number }; // For freeform placement
  counters: { type: string; count: number }[];
  ptModification: { power: number; toughness: number };
  typeLine?: string;
  oracleText?: string;
  manaCost?: string;
}

export interface PlayerState {
  id: string;
  name: string;
  life: number;
  poison: number;
  energy: number;
  isActive: boolean;
}

export interface GameState {
  roomId: string;
  players: Record<string, PlayerState>;
  cards: Record<string, CardInstance>; // Keyed by instanceId
  order: string[]; // Turn order (player IDs)
  turn: number;
  phase: string;
}
