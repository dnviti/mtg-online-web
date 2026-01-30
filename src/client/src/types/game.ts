
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
  loyalty?: number;       // Current loyalty (for planeswalkers)
  baseLoyalty?: number;   // Starting loyalty (for planeswalkers)
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
  isToken?: boolean; // Tokens can be deleted and cease to exist when leaving battlefield
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
  stopRequested?: boolean; // Server-side stop/suspend state
}

// Game log entry (matches server-side GameLogEntry)
export interface GameStateLogEntry {
  id: string;
  timestamp: number;
  message: string;
  type: 'info' | 'action' | 'combat' | 'error' | 'success' | 'warning' | 'zone';
  source: string;
  cards?: {
    name: string;
    imageUrl?: string;
    imageArtCrop?: string;
    manaCost?: string;
    typeLine?: string;
    oracleText?: string;
  }[];
}

// ============================================
// CHOICE SYSTEM TYPES
// ============================================

export type ChoiceType =
  | 'mode_selection'      // "Choose one" / "Choose two"
  | 'card_selection'      // Select cards from revealed zone
  | 'target_selection'    // Mid-resolution targeting
  | 'player_selection'    // Choose a player
  | 'yes_no'              // May abilities
  | 'order_selection'     // Put cards in order
  | 'number_selection'    // Choose X
  | 'ability_selection';  // Choose which ability to activate

export interface ChoiceOption {
  id: string;
  label: string;
  description?: string;
  disabled?: boolean;
  disabledReason?: string;
}

export interface SelectionConstraints {
  minCount?: number;
  maxCount?: number;
  exactCount?: number;
  filter?: {
    zones?: string[];
    controllerId?: string;
    types?: string[];
    notTypes?: string[];
  };
}

export interface PendingChoice {
  id: string;
  type: ChoiceType;
  sourceStackId: string;
  sourceCardId: string;
  sourceCardName: string;
  choosingPlayerId: string;
  controllingPlayerId: string;
  prompt: string;

  // Type-specific data
  options?: ChoiceOption[];           // For mode_selection, yes_no
  constraints?: SelectionConstraints; // For card/target selection
  selectableIds?: string[];           // Pre-computed valid IDs
  revealedCards?: string[];           // Cards revealed to chooser
  minValue?: number;                  // For number_selection
  maxValue?: number;

  createdAt: number;
}

export interface ChoiceResult {
  choiceId: string;
  type: ChoiceType;
  selectedOptionIds?: string[];  // mode_selection
  selectedCardIds?: string[];    // card_selection
  selectedPlayerId?: string;     // player_selection
  selectedValue?: number;        // number_selection
  confirmed?: boolean;           // yes_no
  orderedIds?: string[];         // order_selection
  selectedAbilityIndex?: number; // ability_selection
}

export interface GameState {
  id?: string; // Game ID
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
  // Persistent game logs
  logs?: GameStateLogEntry[];
  // Choice system
  pendingChoice?: PendingChoice | null;
  revealedToPlayer?: {
    playerId: string;
    cardIds: string[];
  };
}

// ============================================
// DEBUG MODE TYPES
// ============================================

/**
 * Step type for detailed explanations
 */
export type DebugStepType =
  | 'parse'        // Oracle text parsing
  | 'cost'         // Cost payment
  | 'target'       // Target selection
  | 'stack'        // Stack interaction
  | 'resolve'      // Resolution step
  | 'effect'       // Effect application
  | 'trigger'      // Triggered ability
  | 'state'        // State-based action
  | 'zone'         // Zone change
  | 'phase'        // Phase/step change
  | 'info';        // General info

/**
 * A single step in the detailed engine explanation
 */
export interface DebugExplanationStep {
  id: string;
  type: DebugStepType;
  title: string;
  description: string;
  details?: string[];
  codeSnippet?: string;
  highlight?: 'info' | 'warning' | 'success' | 'error';
  relatedCardIds?: string[];
}

/**
 * Parsed ability from oracle text
 */
export interface ParsedAbility {
  type: 'static' | 'triggered' | 'activated' | 'spell' | 'etb' | 'ltb' | 'attack' | 'dies';
  keyword?: string;
  triggerCondition?: string;
  cost?: string;
  effect: string;
  targets?: string[];
}

/**
 * Detailed explanation for a debug action
 */
export interface DebugDetailedExplanation {
  summary: string;
  oracleText?: string;
  parsedAbilities?: ParsedAbility[];
  steps: DebugExplanationStep[];
  stateChanges: {
    type: 'zone' | 'counter' | 'life' | 'mana' | 'damage' | 'tap' | 'attach' | 'control' | 'phase';
    description: string;
    before?: string;
    after?: string;
  }[];
  triggeredAbilities?: {
    sourceCardId: string;
    sourceCardName: string;
    triggerCondition: string;
    effect: string;
  }[];
  rulesReferences?: {
    rule: string;
    description: string;
  }[];
}

/**
 * Event received from server when debug mode pauses before an action
 */
export interface DebugPauseEvent {
  snapshotId: string;
  actionType: string;
  description: string;
  explanation: string;
  detailedExplanation?: DebugDetailedExplanation;

  // Actor info
  actorId: string;
  actorName: string;

  // Source card (if applicable)
  sourceCard?: {
    instanceId: string;
    name: string;
    imageUrl: string;
    manaCost?: string;
    typeLine?: string;
  };

  // Cards affected by this action
  affectedCards: Array<{
    instanceId: string;
    name: string;
    imageUrl: string;
    effect: string;
  }>;

  // Targets (may differ from affected cards)
  targets?: Array<{
    id: string;
    name: string;
    type: 'card' | 'player';
  }>;

  // Undo/redo availability
  canUndo: boolean;
  canRedo: boolean;
  historyPosition: number;
  historyLength: number;
}

/**
 * Minimal history item for client display
 */
export interface DebugHistoryItem {
  id: string;
  timestamp: number;
  actionType: string;
  actorName: string;
  description: string;
  status: 'executed' | 'cancelled' | 'pending';
  sourceCard?: {
    instanceId: string;
    name: string;
    imageUrl: string;
  };
  detailedExplanation?: DebugDetailedExplanation;
}

/**
 * Debug state update event from server
 */
export interface DebugStateEvent {
  enabled: boolean;
  paused: boolean;
  canUndo: boolean;
  canRedo: boolean;
  historyPosition: number;
  historyLength: number;
  lastAction?: {
    type: string;
    description: string;
  };
  // History items for debug panel display
  history?: DebugHistoryItem[];
}
