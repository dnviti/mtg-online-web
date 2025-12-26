
export type Phase = 'setup' | 'beginning' | 'main1' | 'combat' | 'main2' | 'ending';

export type Step =
  | 'mulligan'
  | 'untap' | 'upkeep' | 'draw'
  | 'main'
  | 'beginning_combat' | 'declare_attackers' | 'declare_blockers' | 'combat_damage' | 'end_combat'
  | 'end' | 'cleanup';

export interface StackObject {
  id: string;
  sourceId: string;
  controllerId: string;
  type: 'spell' | 'ability' | 'trigger';
  name: string;
  text: string;
  targets: string[];
  faceIndex?: number;
}

export interface CardInstance {
  instanceId: string;
  scryfallId: string; // Used for cache hydration
  setCode?: string; // Used for cache hydration
  oracleId: string; // Scryfall Oracle ID
  name: string;
  imageUrl: string;
  controllerId: string;
  ownerId: string;
  zone: 'library' | 'hand' | 'battlefield' | 'graveyard' | 'exile' | 'command' | 'stack';
  tapped: boolean;
  faceDown: boolean;
  activeFaceIndex?: number; // For Double-Faced Cards (0 = Front, 1 = Back)
  isDoubleFaced?: boolean; // Metadata flag
  attacking?: string; // Player/Planeswalker ID
  blocking?: string[]; // List of attacker IDs blocked by this card
  attachedTo?: string; // ID of card/player this aura/equipment is attached to
  counters: { type: string; count: number }[];
  ptModification: { power: number; toughness: number };
  power?: number;       // Current Calculated Power
  toughness?: number;   // Current Calculated Toughness
  basePower?: number;   // Base Power
  baseToughness?: number; // Base Toughness
  position: { x: number; y: number; z: number }; // For freeform placement
  typeLine?: string;
  types?: string[];
  supertypes?: string[];
  subtypes?: string[];
  oracleText?: string;
  manaCost?: string;
  definition?: any;
  image_uris?: {
    normal?: string;
    crop?: string;
    art_crop?: string;
    small?: string;
    large?: string;
    png?: string;
    border_crop?: string;
  };
  imageArtCrop?: string;
  controlledSinceTurn?: number;
  keywords?: string[];
  card_faces?: any[];
}

export interface PlayerState {
  id: string;
  name: string;
  life: number;
  poison: number;
  energy: number;
  isActive: boolean;
  hasPassed?: boolean;
  manaPool?: Record<string, number>;
  handKept?: boolean;
  mulliganCount?: number;
  isBot?: boolean;
  stopRequested?: boolean; // Server-side stop/suspend state
}

export interface GameState {
  roomId: string;
  players: Record<string, PlayerState>;
  cards: Record<string, CardInstance>; // Keyed by instanceId
  order: string[]; // Turn order (player IDs)
  turn: number;
  turnCount?: number; // Match server-side StrictGameState
  // Strict Mode Extension
  phase: string | Phase;
  step?: Step;
  stack?: StackObject[];
  activePlayerId?: string; // Explicitly tracked in strict
  priorityPlayerId?: string;
  attackersDeclared?: boolean;
  blockersDeclared?: boolean;
}
