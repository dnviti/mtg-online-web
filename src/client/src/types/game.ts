
export type Phase = 'beginning' | 'main1' | 'combat' | 'main2' | 'ending';

export type Step =
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
}

export interface CardInstance {
  instanceId: string;
  oracleId: string; // Scryfall ID
  name: string;
  imageUrl: string;
  controllerId: string;
  ownerId: string;
  zone: 'library' | 'hand' | 'battlefield' | 'graveyard' | 'exile' | 'command' | 'stack';
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
  hasPassed?: boolean;
}

export interface GameState {
  roomId: string;
  players: Record<string, PlayerState>;
  cards: Record<string, CardInstance>; // Keyed by instanceId
  order: string[]; // Turn order (player IDs)
  turn: number;
  // Strict Mode Extension
  phase: string | Phase;
  step?: Step;
  stack?: StackObject[];
  activePlayerId?: string; // Explicitly tracked in strict
  priorityPlayerId?: string;
}
