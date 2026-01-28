
export type Phase = 'setup' | 'beginning' | 'main1' | 'combat' | 'main2' | 'ending';

export type Step =
  | 'mulligan' // Setup
  // Beginning
  | 'untap' | 'upkeep' | 'draw'
  // Main
  | 'main'
  // Combat
  | 'beginning_combat' | 'declare_attackers' | 'declare_blockers' | 'combat_damage' | 'end_combat'
  // Ending
  | 'end' | 'cleanup';

export type Zone = 'library' | 'hand' | 'battlefield' | 'graveyard' | 'stack' | 'exile' | 'command';

export interface MinimalCardFace {
  name: string;
  mana_cost?: string;
  type_line?: string;
  oracle_text?: string;
  colors?: string[];
  power?: string;
  toughness?: string;
  defense?: string;
  image_uris?: { normal?: string; art_crop?: string; };
}

export interface MinimalScryfallCard {
  id: string;
  scryfallId?: string; // Preserve Scryfall ID for Redis lookups
  oracle_id?: string; // Preserve Oracle ID for card identification
  name: string;
  set: string;
  type_line: string;
  mana_cost?: string;
  oracle_text?: string;
  colors?: string[];
  power?: string;
  toughness?: string;
  defense?: string;
  loyalty?: string;  // Scryfall provides loyalty as string (e.g., "3")
  keywords?: string[];
  layout?: string;
  card_faces?: MinimalCardFace[];
  image_uris?: { normal?: string; art_crop?: string; };
  // Pre-parsed for performance
  types?: string[];
  subtypes?: string[];

  // Custom Draft/Local Props
  image?: string;
  imageArtCrop?: string;
  local_path_full?: string;
  local_path_crop?: string;
}

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
  activeFaceIndex?: number; // For Double-Faced Cards (0 = Front, 1 = Back)
  isDoubleFaced?: boolean; // Metadata flag
  attacking?: string; // Player/Planeswalker ID
  blocking?: string[]; // List of attacker IDs blocked by this car
  attachedTo?: string; // ID of card/player this aura/equipment is attached to
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
  defense?: number;
  baseDefense?: number;
  loyalty?: number;      // Current loyalty (calculated from counters)
  baseLoyalty?: number;  // Starting loyalty from card definition
  damageMarked: number;

  // Counters & Mods
  counters: { type: string; count: number }[];
  keywords: string[]; // e.g. ["Haste", "Flying"]

  // Continuous Effects (Layers)
  modifiers: {
    sourceId: string;
    type: 'pt_boost' | 'set_pt' | 'ability_grant' | 'type_change';
    value: any; // ({power: +3, toughness: +3} or "Flying")
    untilEndOfTurn: boolean;
  }[];

  // Visual
  imageUrl: string;
  typeLine?: string;
  oracleText?: string;
  position?: { x: number; y: number; z: number };

  // Metadata
  scryfallId?: string;
  setCode?: string;
  controlledSinceTurn: number; // For Summoning Sickness check
  definition?: any;
  imageArtCrop?: string;
  isToken?: boolean; // Tokens cease to exist when leaving the battlefield
}

export interface PlayerState {
  id: string;
  name: string;
  life: number;
  poison: number;
  energy: number;
  isActive: boolean; // Is it their turn?
  hasPassed: boolean; // For priority loop
  handKept?: boolean; // For Mulligan phase
  mulliganCount?: number;
  manaPool: Record<string, number>; // { W: 0, U: 1, ... }
  isBot?: boolean;
  stopRequested?: boolean; // Server-side stop/suspend state
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
  resolutionPosition?: { x: number, y: number };
  faceIndex?: number; // DFC Support
  resolutionState?: {
    choicesMade: ChoiceResult[];
  };
}

// ============================================
// CHOICE SYSTEM TYPES
// ============================================

// Choice types for effect resolution
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
    zones?: Zone[];
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
  _executed?: boolean;           // Internal flag for tracking execution
}

// Game log entry for client-side display
export interface GameLogEntry {
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

/**
 * Minimal debug history item stored with game state (persisted to Redis)
 */
export interface PersistedDebugAction {
  id: string;
  timestamp: number;
  actionType: string;
  actorId: string;
  actorName: string;
  isBot: boolean;
  description: string;
  status: 'executed' | 'cancelled';
  sourceCardName?: string;
}

/**
 * Debug session info stored with game state (persisted to Redis)
 */
export interface DebugSessionInfo {
  isDebugGame: boolean;        // True if game was started with DEV_MODE=true
  debugEnabled: boolean;       // Current toggle state (can be disabled at runtime)
  createdAt: number;           // When debug session started
  actionHistory: PersistedDebugAction[];  // Persisted debug action log
}

/**
 * Delayed triggered ability (Rule 603.7)
 * Created during spell/ability resolution, triggers at a later time.
 * Example: "At the beginning of the next end step, exile it"
 */
export interface DelayedTrigger {
  id: string;
  sourceCardId: string;        // Card that created this delayed trigger
  sourceCardName: string;      // Name for display purposes
  controllerId: string;        // Who controls this delayed trigger
  triggerCondition: {
    type: 'beginning_of_step' | 'beginning_of_phase' | 'event';
    step?: Step;               // For step-based triggers
    phase?: Phase;             // For phase-based triggers
    nextOccurrence?: boolean;  // True = "next end step", False = "each end step"
  };
  effectText: string;          // Oracle text of what happens when triggered
  targetIds?: string[];        // Pre-selected targets, if any
  oneShot: boolean;            // If true, remove after triggering once
  createdAtTurn: number;       // Turn when this was created
  createdAtStep: Step;         // Step when this was created (to skip same-step triggers)
}

export interface StrictGameState {
  id: string; // Game/Room ID
  roomId: string;
  format?: string; // e.g., 'commander' | 'standard'
  setCode?: string; // Primary set code for token lookups
  cachedTokens?: any[]; // Cached tokens from the set for effect resolution
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
  attackersDeclared?: boolean;
  blockersDeclared?: boolean;

  maxZ: number; // Visual depth (legacy support)

  // Persistent game log history (saved with game state)
  logs: GameLogEntry[];

  // Pending game logs to be sent to clients after action processing (not persisted)
  pendingLogs?: GameLogEntry[];

  // Choice system - for effects that require player decisions mid-resolution
  pendingChoice?: PendingChoice | null;

  // For revealing hidden information during choices (e.g., opponent's hand)
  revealedToPlayer?: {
    playerId: string;
    cardIds: string[];
  };

  // Debug session info (persisted to Redis for debug games)
  debugSession?: DebugSessionInfo;

  // Delayed triggered abilities (Rule 603.7)
  // Created during spell/ability resolution, trigger at a later time
  delayedTriggers?: DelayedTrigger[];

  // Planeswalker loyalty tracking (Rule 606.3)
  // instanceIds of planeswalkers that have activated a loyalty ability this turn
  loyaltyActivatedThisTurn?: string[];
}
