
export type Phase = 'beginning' | 'main1' | 'combat' | 'main2' | 'ending';

export type Step =
  // Beginning
  | 'untap' | 'upkeep' | 'draw'
  // Main
  | 'main'
  // Combat
  | 'beginning_combat' | 'declare_attackers' | 'declare_blockers' | 'combat_damage' | 'end_combat'
  // Ending
  | 'end' | 'cleanup';

export type Zone = 'library' | 'hand' | 'battlefield' | 'graveyard' | 'stack' | 'exile' | 'command';

export interface CardObject {
  instanceId: string;
  oracleId: string;
  name: string;
  controllerId: string;
  ownerId: string;
  zone: Zone;

  // State
  tapped: boolean;
  faceDown: boolean;
  attacking?: string; // Player/Planeswalker ID
  blocking?: string[]; // List of attacker IDs blocked by this car
  damageAssignment?: Record<string, number>; // TargetID -> Amount

  // Characteristics (Base + Modified)
  manaCost?: string;
  colors: string[];
  types: string[];
  subtypes: string[];
  supertypes: string[];
  power: number;
  toughness: number;
  basePower: number;
  baseToughness: number;

  // Counters & Mods
  counters: { type: string; count: number }[];

  // Visual
  imageUrl: string;
}

export interface PlayerState {
  id: string;
  name: string;
  life: number;
  poison: number;
  energy: number;
  isActive: boolean; // Is it their turn?
  hasPassed: boolean; // For priority loop
}

export interface StackObject {
  id: string;
  sourceId: string; // The card/permanent that generated this
  controllerId: string;
  type: 'spell' | 'ability' | 'trigger';
  name: string;
  text: string;
  targets: string[];
  modes?: number[]; // Selected modes
  costPaid?: boolean;
}

export interface StrictGameState {
  roomId: string;
  players: Record<string, PlayerState>;
  cards: Record<string, CardObject>;
  stack: StackObject[];

  // Turn State
  turnCount: number;
  activePlayerId: string; // Whose turn is it
  priorityPlayerId: string; // Who can act NOW
  turnOrder: string[];

  phase: Phase;
  step: Step;

  // Rules State
  passedPriorityCount: number; // 0..N. If N, advance.
  landsPlayedThisTurn: number;

  maxZ: number; // Visual depth (legacy support)
}
