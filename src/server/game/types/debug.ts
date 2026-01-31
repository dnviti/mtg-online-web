import { StrictGameState } from '../types';

/**
 * Snapshot of game state before/after an action for undo/redo support
 */
export interface DebugSnapshot {
  id: string;
  timestamp: number;
  gameId: string;

  // Action info
  actionType: string;
  actionParams: any;
  actorId: string;
  actorName: string;

  // Human-readable descriptions
  description: string;  // e.g., "Alice casts Lightning Bolt"
  explanation: string;  // e.g., "Lightning Bolt will deal 3 damage to target creature or player"
  detailedExplanation?: DebugDetailedExplanation;  // Step-by-step engine breakdown

  // Card references
  sourceCardId?: string;
  sourceCardName?: string;
  sourceCardImageUrl?: string;
  affectedCardIds: string[];
  targetIds?: string[];

  // State snapshots (deep cloned)
  stateBefore: StrictGameState;
  stateAfter?: StrictGameState;

  // Execution status
  executed: boolean;
  cancelled: boolean;
}

/**
 * Debug session state per game
 */
export interface DebugSession {
  gameId: string;
  enabled: boolean;
  paused: boolean;

  // Pending action waiting for continue/cancel
  pendingSnapshot?: DebugSnapshot;

  // History ring buffer
  snapshots: DebugSnapshot[];
  currentIndex: number;  // Position in history (-1 = at latest)
  maxSnapshots: number;

  // For redo support
  undoneSnapshots: DebugSnapshot[];
}

/**
 * Event sent to client when debug mode pauses before an action
 */
export interface DebugPauseEvent {
  snapshotId: string;
  actionType: string;
  description: string;
  explanation: string;
  detailedExplanation?: DebugDetailedExplanation;  // Step-by-step engine breakdown

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
    effect: string;  // e.g., "Will take 3 damage", "Will be destroyed"
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
  detailedExplanation?: DebugDetailedExplanation;  // Step-by-step engine breakdown
}

/**
 * Event sent to client after debug actions (undo/redo/toggle)
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
  history: DebugHistoryItem[];
}

/**
 * Action types that should trigger debug pause
 */
export const DEBUG_PAUSE_ACTIONS = [
  // Core game actions
  'PLAY_LAND',
  'CAST_SPELL',
  'ACTIVATE_ABILITY',
  'DECLARE_ATTACKERS',
  'DECLARE_BLOCKERS',
  'ASSIGN_DAMAGE',
  'RESOLVE_TOP_STACK',
  'MULLIGAN_DECISION',
  'RESOLVE_MULLIGAN',
  'RESPOND_TO_CHOICE',
  // Manual actions that should be logged
  'ADD_MANA',
  'CHANGE_LIFE',
  'LIFE_CHANGE',
  'UPDATE_LIFE',
  'DRAW_CARD',
  'SHUFFLE_LIBRARY',
  'CREATE_TOKEN',
  'ADD_COUNTER',
  'REMOVE_COUNTER',
  'TAP_CARD',
  'MOVE_CARD',
  'DELETE_CARD',
  'RESTART_GAME',
  'TOGGLE_STOP',
  // Priority actions
  'PASS_PRIORITY',
] as const;

/**
 * Action types that should NOT trigger debug pause (internal/automatic)
 */
export const DEBUG_SKIP_ACTIONS = [
  'AUTO_YIELD',
] as const;

export type DebugPauseAction = typeof DEBUG_PAUSE_ACTIONS[number];
export type DebugSkipAction = typeof DEBUG_SKIP_ACTIONS[number];

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
  title: string;           // Short title (e.g., "Parse Oracle Text")
  description: string;     // Detailed description
  details?: string[];      // Additional bullet points
  codeSnippet?: string;    // Relevant oracle text or engine logic
  highlight?: 'info' | 'warning' | 'success' | 'error';
  relatedCardIds?: string[];  // Cards involved in this step
}

/**
 * Parsed ability from oracle text
 */
export interface ParsedAbility {
  type: 'static' | 'triggered' | 'activated' | 'spell' | 'etb' | 'ltb' | 'attack' | 'dies';
  keyword?: string;        // e.g., "Vigilance", "Flying"
  triggerCondition?: string;  // e.g., "When ~ enters the battlefield"
  cost?: string;           // e.g., "{2}{B}, {T}:"
  effect: string;          // The effect text
  targets?: string[];      // Target requirements
}

/**
 * Detailed explanation for a debug action
 */
export interface DebugDetailedExplanation {
  // Summary
  summary: string;

  // Oracle text parsing (for card-related actions)
  oracleText?: string;
  parsedAbilities?: ParsedAbility[];

  // Step-by-step breakdown
  steps: DebugExplanationStep[];

  // State changes that will occur
  stateChanges: {
    type: 'zone' | 'counter' | 'life' | 'mana' | 'damage' | 'tap' | 'attach' | 'control' | 'phase';
    description: string;
    before?: string;
    after?: string;
  }[];

  // Triggered abilities that will fire
  triggeredAbilities?: {
    sourceCardId: string;
    sourceCardName: string;
    triggerCondition: string;
    effect: string;
  }[];

  // Rules references
  rulesReferences?: {
    rule: string;      // e.g., "CR 608.2c"
    description: string;
  }[];
}
