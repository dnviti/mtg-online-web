import { StrictGameState, CardObject, PersistedDebugAction } from '../types';
import {
  DebugSnapshot,
  DebugSession,
  DebugPauseEvent,
  DebugStateEvent,
  DebugHistoryItem,
  DebugDetailedExplanation,
  DebugExplanationStep,
  ParsedAbility,
  DebugStepType,
  DEBUG_PAUSE_ACTIONS,
  DEBUG_SKIP_ACTIONS,
} from '../types/debug';
import crypto from 'crypto';

/**
 * Manages debug mode state for game sessions.
 * Stores snapshots in memory for undo/redo support.
 * Also persists action history to game state (Redis) for debug games.
 */
export class DebugManager {
  private static sessions: Map<string, DebugSession> = new Map();
  private static readonly MAX_SNAPSHOTS = 50;
  private static readonly MAX_PERSISTED_ACTIONS = 200; // More history in Redis

  /**
   * Check if debug mode is enabled globally via environment variable
   */
  static isDevModeEnabled(): boolean {
    return process.env.DEV_MODE === 'true';
  }

  /**
   * Check if debug mode is enabled for a specific game
   */
  static isEnabled(gameId: string): boolean {
    if (!this.isDevModeEnabled()) return false;
    const session = this.sessions.get(gameId);
    return session?.enabled ?? true; // Default to enabled if DEV_MODE is set
  }

  /**
   * Check if the game is currently paused in debug mode
   */
  static isPaused(gameId: string): boolean {
    const session = this.sessions.get(gameId);
    return session?.paused ?? false;
  }

  /**
   * Get the pending pause event for a game (if any).
   * Used to retrieve pause event after bot actions create a pause.
   */
  static getPendingPauseEvent(gameId: string): DebugPauseEvent | null {
    const session = this.sessions.get(gameId);
    const pending = session?.pendingSnapshot;

    if (!pending) return null;

    // Reconstruct the pause event from the pending snapshot
    return {
      snapshotId: pending.id,
      actionType: pending.actionType,
      description: pending.description,
      explanation: pending.explanation,
      detailedExplanation: pending.detailedExplanation,
      actorId: pending.actorId,
      actorName: pending.actorName,
      isBot: pending.isBot,
      sourceCard: pending.sourceCardId ? {
        instanceId: pending.sourceCardId,
        name: pending.sourceCardName || 'Unknown',
        imageUrl: pending.sourceCardImageUrl || '',
        manaCost: undefined,
        typeLine: undefined,
      } : undefined,
      affectedCards: pending.affectedCardIds.map(id => ({
        instanceId: id,
        name: 'Unknown', // We don't store full card data in snapshot
        imageUrl: '',
        effect: 'Affected',
      })),
      targets: pending.targetIds?.map(id => ({
        id,
        name: 'Unknown',
        type: 'card' as const,
      })),
      canUndo: session!.snapshots.length > 0,
      canRedo: session!.undoneSnapshots.length > 0,
      historyPosition: session!.currentIndex + 1,
      historyLength: session!.snapshots.length,
    };
  }

  /**
   * Initialize or get debug session for a game
   */
  static getSession(gameId: string): DebugSession {
    let session = this.sessions.get(gameId);
    if (!session) {
      session = {
        gameId,
        enabled: this.isDevModeEnabled(),
        paused: false,
        snapshots: [],
        currentIndex: -1,
        maxSnapshots: this.MAX_SNAPSHOTS,
        undoneSnapshots: [],
      };
      this.sessions.set(gameId, session);
    }
    return session;
  }

  /**
   * Toggle debug mode for a specific game.
   * Optionally updates the game state for Redis persistence.
   */
  static toggleDebugMode(gameId: string, enabled: boolean, game?: StrictGameState): DebugStateEvent {
    const session = this.getSession(gameId);
    session.enabled = enabled;
    if (!enabled) {
      session.paused = false;
      session.pendingSnapshot = undefined;
    }

    // Update game state for Redis persistence
    if (game) {
      this.updateGameDebugEnabled(game, enabled);
    }

    return this.getDebugState(gameId);
  }

  /**
   * Check if an action should trigger a debug pause
   */
  static shouldPauseForAction(actionType: string): boolean {
    const normalizedType = actionType.toUpperCase();
    if (DEBUG_SKIP_ACTIONS.includes(normalizedType as any)) {
      return false;
    }
    return DEBUG_PAUSE_ACTIONS.includes(normalizedType as any);
  }

  /**
   * Create a snapshot before an action executes.
   * Returns a DebugPauseEvent to send to clients, or null if debug is disabled.
   */
  static createSnapshot(
    game: StrictGameState,
    action: any,
    actorId: string
  ): DebugPauseEvent | null {
    if (!this.isEnabled(game.roomId)) return null;
    if (!this.shouldPauseForAction(action.type)) return null;

    const session = this.getSession(game.roomId);
    const player = game.players[actorId];
    const sourceCard = action.cardId ? game.cards[action.cardId] :
                       action.sourceId ? game.cards[action.sourceId] : null;

    // Deep clone the state
    const stateBefore = JSON.parse(JSON.stringify(game)) as StrictGameState;

    // Generate descriptions
    const description = this.generateDescription(action, player, sourceCard, game);
    const explanation = this.generateExplanation(action, sourceCard, game);
    const detailedExplanation = this.generateDetailedExplanation(action, sourceCard, game, player);
    const affectedCards = this.getAffectedCards(action, game);

    const snapshot: DebugSnapshot = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      gameId: game.roomId,
      actionType: action.type,
      actionParams: { ...action },
      actorId,
      actorName: player?.name || 'Unknown',
      isBot: player?.isBot ?? false,
      description,
      explanation,
      detailedExplanation,
      sourceCardId: sourceCard?.instanceId,
      sourceCardName: sourceCard?.name,
      sourceCardImageUrl: sourceCard?.imageUrl,
      affectedCardIds: affectedCards.map(c => c.card.instanceId),
      targetIds: action.targets || action.attackers || action.blockers?.map((b: any) => b.blockerId),
      stateBefore,
      executed: false,
      cancelled: false,
    };

    // Set as pending
    session.pendingSnapshot = snapshot;
    session.paused = true;

    // Create pause event for clients
    const pauseEvent: DebugPauseEvent = {
      snapshotId: snapshot.id,
      actionType: action.type,
      description,
      explanation,
      detailedExplanation,
      actorId,
      actorName: player?.name || 'Unknown',
      isBot: player?.isBot ?? false,
      sourceCard: sourceCard ? {
        instanceId: sourceCard.instanceId,
        name: sourceCard.name,
        imageUrl: sourceCard.imageUrl,
        manaCost: sourceCard.manaCost,
        typeLine: sourceCard.typeLine,
      } : undefined,
      affectedCards: affectedCards.map(c => ({
        instanceId: c.card.instanceId,
        name: c.card.name,
        imageUrl: c.card.imageUrl,
        effect: c.effect,
      })),
      targets: this.getTargets(action, game),
      canUndo: session.snapshots.length > 0,
      canRedo: session.undoneSnapshots.length > 0,
      historyPosition: session.currentIndex + 1,
      historyLength: session.snapshots.length,
    };

    return pauseEvent;
  }

  /**
   * Continue execution after a debug pause.
   * Returns the pending action to execute, or null if no pending action.
   * Clears the paused state so bot actions can run after the action executes.
   */
  static continueExecution(gameId: string, snapshotId: string): { action: any; actorId: string } | null {
    const session = this.getSession(gameId);
    const pending = session.pendingSnapshot;

    if (!pending || pending.id !== snapshotId) {
      console.warn(`[DebugManager] No matching pending snapshot for ${snapshotId}`);
      return null;
    }

    // Return action data for execution
    const result = {
      action: pending.actionParams,
      actorId: pending.actorId,
    };

    // Clear paused state so bot loop can run after action executes
    // Keep pendingSnapshot so commitSnapshot can find it
    session.paused = false;

    return result;
  }

  /**
   * Commit a snapshot after successful action execution.
   * This stores the snapshot in history for undo support.
   * Also persists the action to game state for Redis storage.
   */
  static commitSnapshot(gameId: string, snapshotId: string, stateAfter: StrictGameState): void {
    const session = this.getSession(gameId);
    const pending = session.pendingSnapshot;

    if (!pending || pending.id !== snapshotId) {
      console.warn(`[DebugManager] No matching pending snapshot to commit: ${snapshotId}`);
      return;
    }

    // Update snapshot with post-execution state
    pending.stateAfter = JSON.parse(JSON.stringify(stateAfter)) as StrictGameState;
    pending.executed = true;

    // Add to history (ring buffer)
    if (session.snapshots.length >= session.maxSnapshots) {
      session.snapshots.shift(); // Remove oldest
    }
    session.snapshots.push(pending);
    session.currentIndex = session.snapshots.length - 1;

    // Clear redo stack when new action is committed
    session.undoneSnapshots = [];

    // Persist action to game state (for Redis storage)
    this.persistAction(stateAfter, pending, 'executed');

    // Clear pending state
    session.pendingSnapshot = undefined;
    session.paused = false;

    console.log(`[DebugManager] Committed snapshot ${snapshotId}. History: ${session.snapshots.length} snapshots`);
  }

  /**
   * Cancel a pending action (don't execute it)
   * Optionally persists the cancelled action to game state.
   */
  static cancelAction(gameId: string, snapshotId: string, game?: StrictGameState): DebugStateEvent | null {
    const session = this.getSession(gameId);
    const pending = session.pendingSnapshot;

    if (!pending || pending.id !== snapshotId) {
      console.warn(`[DebugManager] No matching pending snapshot to cancel: ${snapshotId}`);
      return null;
    }

    // Mark as cancelled (not added to history)
    pending.cancelled = true;

    // Persist cancelled action to game state (for Redis storage)
    if (game) {
      this.persistAction(game, pending, 'cancelled');
    }

    // Clear pending state
    session.pendingSnapshot = undefined;
    session.paused = false;

    console.log(`[DebugManager] Cancelled action: ${pending.actionType}`);
    return this.getDebugState(gameId);
  }

  /**
   * Undo the last executed action by restoring state from snapshot.
   * Returns the restored state, or null if undo is not possible.
   */
  static undo(gameId: string): { restoredState: StrictGameState; event: DebugStateEvent } | null {
    const session = this.getSession(gameId);

    if (session.snapshots.length === 0) {
      console.warn(`[DebugManager] No snapshots to undo`);
      return null;
    }

    // Get the latest snapshot
    const snapshot = session.snapshots.pop()!;
    session.currentIndex = session.snapshots.length - 1;

    // Move to redo stack
    session.undoneSnapshots.push(snapshot);

    // Return the state before the action
    const restoredState = JSON.parse(JSON.stringify(snapshot.stateBefore)) as StrictGameState;

    console.log(`[DebugManager] Undo: ${snapshot.actionType}. History: ${session.snapshots.length}, Redo: ${session.undoneSnapshots.length}`);

    return {
      restoredState,
      event: this.getDebugState(gameId),
    };
  }

  /**
   * Redo an undone action by restoring state after execution.
   * Returns the restored state, or null if redo is not possible.
   */
  static redo(gameId: string): { restoredState: StrictGameState; event: DebugStateEvent } | null {
    const session = this.getSession(gameId);

    if (session.undoneSnapshots.length === 0) {
      console.warn(`[DebugManager] No undone actions to redo`);
      return null;
    }

    // Get the most recently undone snapshot
    const snapshot = session.undoneSnapshots.pop()!;

    // Restore to history
    session.snapshots.push(snapshot);
    session.currentIndex = session.snapshots.length - 1;

    if (!snapshot.stateAfter) {
      console.warn(`[DebugManager] Snapshot has no stateAfter, cannot redo`);
      return null;
    }

    // Return the state after the action
    const restoredState = JSON.parse(JSON.stringify(snapshot.stateAfter)) as StrictGameState;

    console.log(`[DebugManager] Redo: ${snapshot.actionType}. History: ${session.snapshots.length}, Redo: ${session.undoneSnapshots.length}`);

    return {
      restoredState,
      event: this.getDebugState(gameId),
    };
  }

  /**
   * Get current debug state for client
   */
  static getDebugState(gameId: string): DebugStateEvent {
    const session = this.getSession(gameId);
    const lastSnapshot = session.snapshots[session.snapshots.length - 1];

    // Convert snapshots to history items for client display
    const history: DebugHistoryItem[] = session.snapshots.map(snapshot => ({
      id: snapshot.id,
      timestamp: snapshot.timestamp,
      actionType: snapshot.actionType,
      actorName: snapshot.actorName,
      isBot: snapshot.isBot,
      description: snapshot.description,
      status: snapshot.executed ? 'executed' : snapshot.cancelled ? 'cancelled' : 'pending',
      sourceCard: snapshot.sourceCardId ? {
        instanceId: snapshot.sourceCardId,
        name: snapshot.sourceCardName || 'Unknown',
        imageUrl: snapshot.sourceCardImageUrl || '',
      } : undefined,
      detailedExplanation: snapshot.detailedExplanation,
    }));

    return {
      enabled: session.enabled,
      paused: session.paused,
      canUndo: session.snapshots.length > 0,
      canRedo: session.undoneSnapshots.length > 0,
      historyPosition: session.currentIndex + 1,
      historyLength: session.snapshots.length,
      lastAction: lastSnapshot ? {
        type: lastSnapshot.actionType,
        description: lastSnapshot.description,
      } : undefined,
      history,
    };
  }

  /**
   * Clear debug session for a game (call when game ends)
   */
  static clearSession(gameId: string): void {
    this.sessions.delete(gameId);
    console.log(`[DebugManager] Cleared session for game ${gameId}`);
  }

  /**
   * Clear the debug history for a game while keeping the session active.
   * Also clears persisted history in game state.
   */
  static clearHistory(gameId: string, game?: StrictGameState): DebugStateEvent {
    const session = this.getSession(gameId);

    // Clear in-memory history
    session.snapshots = [];
    session.undoneSnapshots = [];
    session.currentIndex = -1;

    // Clear persisted history in game state
    if (game?.debugSession) {
      game.debugSession.actionHistory = [];
    }

    console.log(`[DebugManager] Cleared history for game ${gameId}`);
    return this.getDebugState(gameId);
  }

  /**
   * Initialize debug session info in game state.
   * Call this when a game starts to mark it as a debug game.
   */
  static initializeGameDebugSession(game: StrictGameState): void {
    if (!this.isDevModeEnabled()) return;

    // Initialize debug session info in game state (persisted to Redis)
    game.debugSession = {
      isDebugGame: true,
      debugEnabled: true,
      createdAt: Date.now(),
      actionHistory: [],
    };

    console.log(`[DebugManager] Initialized debug session for game ${game.roomId}`);
  }

  /**
   * Sync session enabled state from game state (for when game is loaded from Redis)
   */
  static syncFromGameState(game: StrictGameState): void {
    if (!game.debugSession) return;

    const session = this.getSession(game.roomId);
    session.enabled = game.debugSession.debugEnabled;
  }

  /**
   * Persist a debug action to game state (will be saved to Redis)
   */
  static persistAction(game: StrictGameState, snapshot: DebugSnapshot, status: 'executed' | 'cancelled'): void {
    if (!game.debugSession) return;

    const action: PersistedDebugAction = {
      id: snapshot.id,
      timestamp: snapshot.timestamp,
      actionType: snapshot.actionType,
      actorId: snapshot.actorId,
      actorName: snapshot.actorName,
      isBot: snapshot.isBot,
      description: snapshot.description,
      status,
      sourceCardName: snapshot.sourceCardName,
    };

    // Add to history (ring buffer)
    game.debugSession.actionHistory.push(action);
    if (game.debugSession.actionHistory.length > this.MAX_PERSISTED_ACTIONS) {
      game.debugSession.actionHistory.shift();
    }
  }

  /**
   * Update debug enabled state in game state (persists to Redis)
   */
  static updateGameDebugEnabled(game: StrictGameState, enabled: boolean): void {
    if (game.debugSession) {
      game.debugSession.debugEnabled = enabled;
    }
  }

  /**
   * Check if a game is a debug game (started with DEV_MODE=true)
   */
  static isDebugGame(game: StrictGameState): boolean {
    return game.debugSession?.isDebugGame ?? false;
  }

  // ============================================
  // Description & Explanation Generators
  // ============================================

  private static generateDescription(
    action: any,
    player: { name: string } | undefined,
    sourceCard: CardObject | null,
    game: StrictGameState
  ): string {
    const playerName = player?.name || 'Unknown player';
    const cardName = sourceCard?.name || 'Unknown card';
    const actionType = action.type.toUpperCase();

    switch (actionType) {
      case 'PLAY_LAND':
        return `${playerName} plays ${cardName}`;

      case 'CAST_SPELL':
        if (action.targets?.length > 0) {
          const targetNames = action.targets.map((t: string) => {
            const target = game.cards[t];
            return target?.name || game.players[t]?.name || t;
          }).join(', ');
          return `${playerName} casts ${cardName} targeting ${targetNames}`;
        }
        return `${playerName} casts ${cardName}`;

      case 'ACTIVATE_ABILITY':
        return `${playerName} activates ability of ${cardName}`;

      case 'DECLARE_ATTACKERS': {
        // Attackers can be either string IDs or objects with attackerId
        const attackerNames = (action.attackers || []).map((attacker: any) => {
          const attackerId = typeof attacker === 'string' ? attacker : attacker.attackerId;
          return game.cards[attackerId]?.name || 'Unknown';
        }).join(', ');
        return `${playerName} attacks with ${attackerNames || 'no creatures'}`;
      }

      case 'DECLARE_BLOCKERS': {
        const blockCount = action.blockers?.length || 0;
        return `${playerName} declares ${blockCount} blocker${blockCount !== 1 ? 's' : ''}`;
      }

      case 'MULLIGAN_DECISION':
        return action.keep
          ? `${playerName} keeps their hand`
          : `${playerName} mulligans`;

      case 'RESOLVE_TOP_STACK': {
        const topStack = game.stack[game.stack.length - 1];
        return `Resolving ${topStack?.name || 'stack item'}`;
      }

      case 'RESPOND_TO_CHOICE':
        return `${playerName} makes a choice`;

      default:
        return `${playerName} performs ${action.type}`;
    }
  }

  private static generateExplanation(
    action: any,
    sourceCard: CardObject | null,
    game: StrictGameState
  ): string {
    const actionType = action.type.toUpperCase();
    const cardName = sourceCard?.name || 'This card';
    const oracleText = sourceCard?.oracleText || sourceCard?.definition?.oracle_text || '';

    switch (actionType) {
      case 'PLAY_LAND':
        return `${cardName} will enter the battlefield as a land. The player's land count for this turn will increase by 1.`;

      case 'CAST_SPELL': {
        if (!sourceCard) return 'The spell will be put on the stack.';

        const types = sourceCard.types || [];
        const isPermanent = types.some(t =>
          ['Creature', 'Artifact', 'Enchantment', 'Planeswalker', 'Battle'].includes(t)
        );

        if (isPermanent) {
          let explanation = `${cardName} will be put on the stack. When it resolves, it will enter the battlefield`;
          if (types.includes('Creature')) {
            explanation += ` as a ${sourceCard.power}/${sourceCard.toughness} creature`;
          }
          explanation += '.';
          if (oracleText) {
            // Check for ETB triggers
            if (oracleText.toLowerCase().includes('enters the battlefield') ||
                oracleText.toLowerCase().includes('enters')) {
              explanation += ' ETB ability will trigger.';
            }
          }
          return explanation;
        } else {
          // Instant/Sorcery
          let explanation = `${cardName} will be put on the stack. When it resolves`;
          if (oracleText) {
            // Summarize effect
            const effectSummary = this.summarizeOracleEffect(oracleText);
            explanation += `, ${effectSummary}`;
          }
          explanation += ', then it will be put into the graveyard.';
          return explanation;
        }
      }

      case 'ACTIVATE_ABILITY':
        return `The activated ability of ${cardName} will be put on the stack. ${oracleText ? 'Effect: ' + this.summarizeOracleEffect(oracleText) : ''}`;

      case 'DECLARE_ATTACKERS': {
        const attackerCount = action.attackers?.length || 0;
        if (attackerCount === 0) {
          return 'No attackers declared. Combat will proceed to the next step.';
        }
        return `${attackerCount} creature${attackerCount !== 1 ? 's' : ''} will be declared as attackers. Tapped creatures will attack (unless they have Vigilance). The defending player will have an opportunity to declare blockers.`;
      }

      case 'DECLARE_BLOCKERS': {
        const blockerCount = action.blockers?.length || 0;
        if (blockerCount === 0) {
          return 'No blockers declared. Unblocked attackers will deal damage to the defending player.';
        }
        return `${blockerCount} creature${blockerCount !== 1 ? 's' : ''} will block. Combat damage will be calculated based on attacker/blocker pairings.`;
      }

      case 'MULLIGAN_DECISION':
        if (action.keep) {
          return 'The player will keep their current hand and the game will continue.';
        }
        return 'The player will shuffle their hand into their library and draw a new hand with one fewer card.';

      case 'RESOLVE_TOP_STACK': {
        const topStack = game.stack[game.stack.length - 1];
        if (!topStack) return 'The stack is empty.';
        return `${topStack.name} will resolve. ${topStack.text || ''}`;
      }

      case 'RESPOND_TO_CHOICE':
        return 'The player\'s choice will be processed and the effect will continue to resolve.';

      default:
        return `Action ${action.type} will be processed.`;
    }
  }

  private static summarizeOracleEffect(oracleText: string): string {
    const text = oracleText.toLowerCase();

    // Common effect patterns
    if (text.includes('deal') && text.includes('damage')) {
      const damageMatch = text.match(/deal (\d+) damage/);
      return damageMatch ? `it will deal ${damageMatch[1]} damage` : 'it will deal damage';
    }
    if (text.includes('destroy')) {
      return 'it will destroy its target';
    }
    if (text.includes('counter')) {
      return 'it will counter its target';
    }
    if (text.includes('draw') && text.includes('card')) {
      const drawMatch = text.match(/draw (\d+|a) card/);
      return drawMatch ? `player will draw ${drawMatch[1]} card(s)` : 'player will draw cards';
    }
    if (text.includes('create') && text.includes('token')) {
      return 'it will create token(s)';
    }
    if (text.includes('return') && text.includes('hand')) {
      return 'it will return target to hand';
    }
    if (text.includes('exile')) {
      return 'it will exile its target';
    }
    if (text.includes('gain') && text.includes('life')) {
      const lifeMatch = text.match(/gain (\d+) life/);
      return lifeMatch ? `player will gain ${lifeMatch[1]} life` : 'player will gain life';
    }
    if (text.includes('+') && text.includes('/+')) {
      const pumpMatch = text.match(/([+-]\d+)\/([+-]\d+)/);
      return pumpMatch ? `it will give ${pumpMatch[1]}/${pumpMatch[2]}` : 'it will pump target';
    }

    // Default: truncate oracle text
    const firstSentence = oracleText.split('.')[0];
    return firstSentence.length > 60 ? firstSentence.substring(0, 60) + '...' : firstSentence;
  }

  private static getAffectedCards(
    action: any,
    game: StrictGameState
  ): Array<{ card: CardObject; effect: string }> {
    const affected: Array<{ card: CardObject; effect: string }> = [];
    const actionType = action.type.toUpperCase();

    // Add source card if it exists
    const sourceCardId = action.cardId || action.sourceId;
    if (sourceCardId && game.cards[sourceCardId]) {
      const sourceCard = game.cards[sourceCardId];
      let effect = '';
      switch (actionType) {
        case 'PLAY_LAND':
          effect = 'Will enter battlefield';
          break;
        case 'CAST_SPELL':
          effect = 'Being cast';
          break;
        case 'ACTIVATE_ABILITY':
          effect = 'Ability source';
          break;
        default:
          effect = 'Source';
      }
      affected.push({ card: sourceCard, effect });
    }

    // Add targets
    const targets = action.targets || [];
    for (const targetId of targets) {
      const targetCard = game.cards[targetId];
      if (targetCard) {
        affected.push({ card: targetCard, effect: 'Target' });
      }
    }

    // Add attackers/blockers
    const attackers = action.attackers || [];
    for (const attackerEntry of attackers) {
      // Attackers can be either string IDs or objects with attackerId
      const attackerId = typeof attackerEntry === 'string' ? attackerEntry : attackerEntry.attackerId;
      const attacker = game.cards[attackerId];
      if (attacker && !affected.find(a => a.card.instanceId === attackerId)) {
        affected.push({ card: attacker, effect: 'Attacking' });
      }
    }

    const blockers = action.blockers || [];
    for (const blocker of blockers) {
      const blockerId = blocker.blockerId || blocker;
      const blockerCard = game.cards[blockerId];
      if (blockerCard && !affected.find(a => a.card.instanceId === blockerId)) {
        affected.push({ card: blockerCard, effect: 'Blocking' });
      }
    }

    return affected;
  }

  private static getTargets(
    action: any,
    game: StrictGameState
  ): Array<{ id: string; name: string; type: 'card' | 'player' }> | undefined {
    // Handle targets or attackers (attackers can be objects with attackerId)
    let targetIds: string[] = [];
    if (action.targets?.length > 0) {
      targetIds = action.targets;
    } else if (action.attackers?.length > 0) {
      // Attackers can be either string IDs or objects with attackerId
      targetIds = action.attackers.map((attacker: any) =>
        typeof attacker === 'string' ? attacker : attacker.attackerId
      );
    }

    if (targetIds.length === 0) return undefined;

    return targetIds.map((id: string) => {
      const card = game.cards[id];
      if (card) {
        return { id, name: card.name, type: 'card' as const };
      }
      const player = game.players[id];
      if (player) {
        return { id, name: player.name, type: 'player' as const };
      }
      return { id, name: 'Unknown', type: 'card' as const };
    });
  }

  // ============================================
  // Detailed Explanation Generator
  // ============================================

  /**
   * Generate a detailed step-by-step explanation of how the engine processes an action
   */
  private static generateDetailedExplanation(
    action: any,
    sourceCard: CardObject | null,
    game: StrictGameState,
    player: { name: string; isBot?: boolean } | undefined
  ): DebugDetailedExplanation {
    const actionType = action.type.toUpperCase();
    const steps: DebugExplanationStep[] = [];
    const stateChanges: DebugDetailedExplanation['stateChanges'] = [];
    let stepCounter = 1;

    const createStep = (
      type: DebugStepType,
      title: string,
      description: string,
      options?: Partial<DebugExplanationStep>
    ): DebugExplanationStep => ({
      id: `step-${stepCounter++}`,
      type,
      title,
      description,
      ...options,
    });

    // Get oracle text
    const oracleText = sourceCard?.oracleText || sourceCard?.definition?.oracle_text || '';
    const parsedAbilities = oracleText ? this.parseOracleText(oracleText, sourceCard) : [];

    // Generate steps based on action type
    switch (actionType) {
      case 'CAST_SPELL':
        return this.generateCastSpellExplanation(action, sourceCard, game, player, oracleText, parsedAbilities);

      case 'PLAY_LAND':
        return this.generatePlayLandExplanation(action, sourceCard, game, player, oracleText, parsedAbilities);

      case 'ACTIVATE_ABILITY':
        return this.generateActivateAbilityExplanation(action, sourceCard, game, player, oracleText, parsedAbilities);

      case 'DECLARE_ATTACKERS':
        return this.generateDeclareAttackersExplanation(action, game, player);

      case 'DECLARE_BLOCKERS':
        return this.generateDeclareBlockersExplanation(action, game, player);

      case 'RESOLVE_TOP_STACK':
        return this.generateResolveStackExplanation(game);

      case 'MULLIGAN_DECISION':
        return this.generateMulliganExplanation(action, player);

      case 'PASS_PRIORITY':
        return this.generatePassPriorityExplanation(game, player);

      default:
        // Generic explanation for other actions
        steps.push(createStep('info', 'Action Processing', `The engine will process action: ${action.type}`));
        return {
          summary: `Processing ${action.type} action`,
          steps,
          stateChanges,
        };
    }
  }

  /**
   * Parse oracle text into structured abilities
   */
  private static parseOracleText(oracleText: string, card: CardObject | null): ParsedAbility[] {
    const abilities: ParsedAbility[] = [];
    const lines = oracleText.split('\n').filter(line => line.trim());

    // Common keywords
    const staticKeywords = [
      'Flying', 'First strike', 'Double strike', 'Deathtouch', 'Haste', 'Hexproof',
      'Indestructible', 'Lifelink', 'Menace', 'Reach', 'Trample', 'Vigilance',
      'Defender', 'Flash', 'Fear', 'Intimidate', 'Protection', 'Shroud', 'Ward'
    ];

    for (const line of lines) {
      const trimmedLine = line.trim();

      // Check for static keyword abilities
      for (const keyword of staticKeywords) {
        if (trimmedLine.toLowerCase().startsWith(keyword.toLowerCase())) {
          abilities.push({
            type: 'static',
            keyword,
            effect: `This creature has ${keyword}`,
          });
        }
      }

      // Check for triggered abilities
      if (trimmedLine.toLowerCase().startsWith('when') ||
          trimmedLine.toLowerCase().startsWith('whenever') ||
          trimmedLine.toLowerCase().startsWith('at the beginning')) {
        const triggerMatch = trimmedLine.match(/^(when|whenever|at the beginning[^,]+),?\s*/i);
        const triggerCondition = triggerMatch ? triggerMatch[0].trim() : '';
        const effect = trimmedLine.replace(triggerCondition, '').trim();

        let abilityType: ParsedAbility['type'] = 'triggered';
        if (trimmedLine.toLowerCase().includes('enters the battlefield') ||
            trimmedLine.toLowerCase().includes('enters')) {
          abilityType = 'etb';
        } else if (trimmedLine.toLowerCase().includes('leaves the battlefield')) {
          abilityType = 'ltb';
        } else if (trimmedLine.toLowerCase().includes('dies')) {
          abilityType = 'dies';
        } else if (trimmedLine.toLowerCase().includes('attacks')) {
          abilityType = 'attack';
        }

        abilities.push({
          type: abilityType,
          triggerCondition,
          effect,
          targets: this.extractTargets(effect),
        });
      }

      // Check for activated abilities (contains cost with colon)
      const activatedMatch = trimmedLine.match(/^([^:]+):\s*(.+)$/);
      if (activatedMatch && (activatedMatch[1].includes('{') || activatedMatch[1].includes('Tap'))) {
        abilities.push({
          type: 'activated',
          cost: activatedMatch[1].trim(),
          effect: activatedMatch[2].trim(),
          targets: this.extractTargets(activatedMatch[2]),
        });
      }

      // Check for spell effects (for instants/sorceries)
      if (card?.types?.includes('Instant') || card?.types?.includes('Sorcery')) {
        if (!abilities.some(a => a.effect === trimmedLine)) {
          abilities.push({
            type: 'spell',
            effect: trimmedLine,
            targets: this.extractTargets(trimmedLine),
          });
        }
      }
    }

    return abilities;
  }

  /**
   * Extract target requirements from effect text
   */
  private static extractTargets(effectText: string): string[] {
    const targets: string[] = [];
    const targetPatterns = [
      /target ([\w\s]+?)(?:\.|,|$)/gi,
      /choose ([\w\s]+?)(?:\.|,|$)/gi,
    ];

    for (const pattern of targetPatterns) {
      let match;
      while ((match = pattern.exec(effectText)) !== null) {
        targets.push(match[1].trim());
      }
    }

    return targets;
  }

  /**
   * Generate detailed explanation for CAST_SPELL
   */
  private static generateCastSpellExplanation(
    action: any,
    sourceCard: CardObject | null,
    game: StrictGameState,
    player: { name: string } | undefined,
    oracleText: string,
    parsedAbilities: ParsedAbility[]
  ): DebugDetailedExplanation {
    const steps: DebugExplanationStep[] = [];
    const stateChanges: DebugDetailedExplanation['stateChanges'] = [];
    const triggeredAbilities: DebugDetailedExplanation['triggeredAbilities'] = [];
    let stepCounter = 1;

    const createStep = (
      type: DebugStepType,
      title: string,
      description: string,
      options?: Partial<DebugExplanationStep>
    ): DebugExplanationStep => ({
      id: `step-${stepCounter++}`,
      type,
      title,
      description,
      ...options,
    });

    const cardName = sourceCard?.name || 'Unknown card';
    const isPermanent = sourceCard?.types?.some(t =>
      ['Creature', 'Artifact', 'Enchantment', 'Planeswalker', 'Battle'].includes(t)
    );

    // Step 1: Oracle Text Parsing
    if (oracleText) {
      steps.push(createStep('parse', 'Parse Oracle Text',
        `Engine reads and parses the card's oracle text to identify abilities and effects.`,
        {
          codeSnippet: oracleText,
          details: parsedAbilities.length > 0
            ? parsedAbilities.map(a => `• ${a.type.toUpperCase()}: ${a.effect.substring(0, 80)}${a.effect.length > 80 ? '...' : ''}`)
            : ['• No special abilities detected'],
          highlight: 'info',
        }
      ));
    }

    // Step 2: Cost Payment
    const manaCost = sourceCard?.manaCost || '';
    steps.push(createStep('cost', 'Pay Casting Cost',
      `Player must pay the mana cost${manaCost ? `: ${manaCost}` : ''}.`,
      {
        details: [
          `• Mana is removed from ${player?.name || 'player'}'s mana pool`,
          `• Card moves from hand to stack`,
        ],
        highlight: 'info',
      }
    ));
    stateChanges.push({
      type: 'mana',
      description: `Pay mana cost: ${manaCost || 'none'}`,
    });

    // Step 3: Targeting (if applicable)
    if (action.targets?.length > 0) {
      const targetNames = action.targets.map((t: string) => {
        const target = game.cards[t];
        return target?.name || game.players[t]?.name || t;
      });
      steps.push(createStep('target', 'Target Selection',
        `Spell targets: ${targetNames.join(', ')}`,
        {
          details: [
            '• Targets must be legal when spell is cast',
            '• Targets will be checked again on resolution',
          ],
          relatedCardIds: action.targets.filter((t: string) => game.cards[t]),
        }
      ));
    }

    // Step 4: Put on Stack
    steps.push(createStep('stack', 'Put on Stack',
      `${cardName} is placed on the stack. All players will receive priority to respond.`,
      {
        details: [
          '• Opponents can respond with instants or abilities',
          '• If no responses, spell will resolve',
        ],
        highlight: 'info',
      }
    ));
    stateChanges.push({
      type: 'zone',
      description: `${cardName} moves from hand to stack`,
      before: 'hand',
      after: 'stack',
    });

    // Step 5: Resolution
    if (isPermanent) {
      steps.push(createStep('resolve', 'Resolution (When Stack Resolves)',
        `${cardName} will enter the battlefield as a ${sourceCard?.types?.join(' ') || 'permanent'}.`,
        {
          details: sourceCard?.types?.includes('Creature')
            ? [
                `• Enters as a ${sourceCard.power}/${sourceCard.toughness} creature`,
                `• Cannot attack this turn (summoning sickness) unless it has Haste`,
              ]
            : ['• Permanent enters the battlefield under your control'],
        }
      ));
      stateChanges.push({
        type: 'zone',
        description: `${cardName} enters the battlefield`,
        before: 'stack',
        after: 'battlefield',
      });

      // Check for ETB triggers
      const etbAbilities = parsedAbilities.filter(a => a.type === 'etb');
      if (etbAbilities.length > 0) {
        steps.push(createStep('trigger', 'ETB Triggers',
          `Enter-the-battlefield abilities will trigger when ${cardName} enters.`,
          {
            details: etbAbilities.map(a => `• ${a.effect}`),
            highlight: 'success',
          }
        ));
        for (const ability of etbAbilities) {
          triggeredAbilities.push({
            sourceCardId: sourceCard?.instanceId || '',
            sourceCardName: cardName,
            triggerCondition: ability.triggerCondition || 'When this enters the battlefield',
            effect: ability.effect,
          });
        }
      }
    } else {
      // Instant/Sorcery resolution
      const spellEffects = parsedAbilities.filter(a => a.type === 'spell');
      steps.push(createStep('resolve', 'Resolution (When Stack Resolves)',
        `${cardName} resolves and its effects are applied.`,
        {
          details: spellEffects.length > 0
            ? spellEffects.map(a => `• ${a.effect}`)
            : ['• Spell effect is applied'],
        }
      ));

      // Describe the effect
      steps.push(createStep('effect', 'Apply Effect',
        this.describeSpellEffect(oracleText, action, game),
        {
          codeSnippet: oracleText,
          highlight: 'success',
        }
      ));

      stateChanges.push({
        type: 'zone',
        description: `${cardName} goes to graveyard after resolving`,
        before: 'stack',
        after: 'graveyard',
      });
    }

    // Check for other triggered abilities in play
    const otherTriggers = this.findTriggeredAbilities(game, 'cast', sourceCard);
    if (otherTriggers.length > 0) {
      steps.push(createStep('trigger', 'Other Triggered Abilities',
        'Other permanents may trigger from this spell being cast.',
        {
          details: otherTriggers.map(t => `• ${t.sourceCardName}: ${t.effect}`),
        }
      ));
      triggeredAbilities.push(...otherTriggers);
    }

    return {
      summary: `Casting ${cardName}${isPermanent ? ' (permanent)' : ' (spell)'}`,
      oracleText: oracleText || undefined,
      parsedAbilities: parsedAbilities.length > 0 ? parsedAbilities : undefined,
      steps,
      stateChanges,
      triggeredAbilities: triggeredAbilities.length > 0 ? triggeredAbilities : undefined,
      rulesReferences: [
        { rule: 'CR 601', description: 'Casting Spells' },
        { rule: 'CR 608', description: 'Resolving Spells and Abilities' },
      ],
    };
  }

  /**
   * Generate detailed explanation for PLAY_LAND
   */
  private static generatePlayLandExplanation(
    _action: any,
    sourceCard: CardObject | null,
    game: StrictGameState,
    player: { name: string } | undefined,
    oracleText: string,
    parsedAbilities: ParsedAbility[]
  ): DebugDetailedExplanation {
    const steps: DebugExplanationStep[] = [];
    const stateChanges: DebugDetailedExplanation['stateChanges'] = [];
    const triggeredAbilities: DebugDetailedExplanation['triggeredAbilities'] = [];
    let stepCounter = 1;

    const createStep = (
      type: DebugStepType,
      title: string,
      description: string,
      options?: Partial<DebugExplanationStep>
    ): DebugExplanationStep => ({
      id: `step-${stepCounter++}`,
      type,
      title,
      description,
      ...options,
    });

    const cardName = sourceCard?.name || 'Unknown land';
    const landsPlayed = game.landsPlayedThisTurn || 0;

    // Step 1: Land Drop Check
    steps.push(createStep('info', 'Land Drop Check',
      `Checking if ${player?.name || 'player'} can play a land this turn.`,
      {
        details: [
          `• Lands played this turn: ${landsPlayed}`,
          `• Land drops remaining: ${Math.max(0, 1 - landsPlayed)}`,
          landsPlayed === 0 ? '• Land drop is available' : '• Additional land drop effects may allow this',
        ],
        highlight: landsPlayed === 0 ? 'success' : 'warning',
      }
    ));

    // Step 2: Oracle Text (if any)
    if (oracleText) {
      steps.push(createStep('parse', 'Parse Land Abilities',
        `Engine reads the land's abilities.`,
        {
          codeSnippet: oracleText,
          details: parsedAbilities.map(a => `• ${a.type.toUpperCase()}: ${a.effect}`),
        }
      ));
    }

    // Step 3: Enter Battlefield
    steps.push(createStep('zone', 'Enter Battlefield',
      `${cardName} enters the battlefield. This does not use the stack.`,
      {
        details: [
          '• Playing a land is a special action',
          '• Cannot be responded to by opponents',
          '• Land enters untapped (unless stated otherwise)',
        ],
        highlight: 'info',
      }
    ));
    stateChanges.push({
      type: 'zone',
      description: `${cardName} enters the battlefield`,
      before: 'hand',
      after: 'battlefield',
    });

    // Step 4: Increment land count
    stateChanges.push({
      type: 'counter',
      description: 'Lands played this turn increases',
      before: String(landsPlayed),
      after: String(landsPlayed + 1),
    });

    // Step 5: ETB triggers
    const etbAbilities = parsedAbilities.filter(a => a.type === 'etb');
    if (etbAbilities.length > 0) {
      steps.push(createStep('trigger', 'ETB Triggers',
        `Enter-the-battlefield abilities trigger.`,
        {
          details: etbAbilities.map(a => `• ${a.effect}`),
          highlight: 'success',
        }
      ));
      for (const ability of etbAbilities) {
        triggeredAbilities.push({
          sourceCardId: sourceCard?.instanceId || '',
          sourceCardName: cardName,
          triggerCondition: 'When this land enters the battlefield',
          effect: ability.effect,
        });
      }
    }

    // Check for landfall triggers
    const landfallTriggers = this.findTriggeredAbilities(game, 'landfall', sourceCard);
    if (landfallTriggers.length > 0) {
      steps.push(createStep('trigger', 'Landfall Triggers',
        'Landfall abilities trigger from a land entering the battlefield.',
        {
          details: landfallTriggers.map(t => `• ${t.sourceCardName}: ${t.effect}`),
          highlight: 'success',
        }
      ));
      triggeredAbilities.push(...landfallTriggers);
    }

    // Step 6: Mana abilities
    const activatedAbilities = parsedAbilities.filter(a => a.type === 'activated');
    if (activatedAbilities.length > 0) {
      steps.push(createStep('info', 'Mana Abilities Available',
        `${cardName} has the following activated abilities:`,
        {
          details: activatedAbilities.map(a => `• ${a.cost}: ${a.effect}`),
        }
      ));
    }

    return {
      summary: `Playing land: ${cardName}`,
      oracleText: oracleText || undefined,
      parsedAbilities: parsedAbilities.length > 0 ? parsedAbilities : undefined,
      steps,
      stateChanges,
      triggeredAbilities: triggeredAbilities.length > 0 ? triggeredAbilities : undefined,
      rulesReferences: [
        { rule: 'CR 305', description: 'Lands' },
        { rule: 'CR 115.2a', description: 'Special Actions - Playing Lands' },
      ],
    };
  }

  /**
   * Generate detailed explanation for ACTIVATE_ABILITY
   */
  private static generateActivateAbilityExplanation(
    action: any,
    sourceCard: CardObject | null,
    game: StrictGameState,
    _player: { name: string } | undefined,
    oracleText: string,
    parsedAbilities: ParsedAbility[]
  ): DebugDetailedExplanation {
    const steps: DebugExplanationStep[] = [];
    const stateChanges: DebugDetailedExplanation['stateChanges'] = [];
    let stepCounter = 1;

    const createStep = (
      type: DebugStepType,
      title: string,
      description: string,
      options?: Partial<DebugExplanationStep>
    ): DebugExplanationStep => ({
      id: `step-${stepCounter++}`,
      type,
      title,
      description,
      ...options,
    });

    const cardName = sourceCard?.name || 'Unknown card';
    const abilityIndex = action.abilityIndex || 0;
    const activatedAbilities = parsedAbilities.filter(a => a.type === 'activated');
    const ability = activatedAbilities[abilityIndex];

    // Step 1: Parse ability
    steps.push(createStep('parse', 'Parse Activated Ability',
      `Engine identifies the activated ability being used.`,
      {
        codeSnippet: ability ? `${ability.cost}: ${ability.effect}` : oracleText,
        details: [
          `• Source: ${cardName}`,
          `• Ability index: ${abilityIndex}`,
        ],
      }
    ));

    // Step 2: Pay cost
    if (ability?.cost) {
      const isTapAbility = ability.cost.includes('{T}') || ability.cost.toLowerCase().includes('tap');
      steps.push(createStep('cost', 'Pay Activation Cost',
        `Cost: ${ability.cost}`,
        {
          details: [
            isTapAbility ? `• ${cardName} will be tapped` : null,
            ability.cost.includes('{') ? '• Mana cost is paid from mana pool' : null,
            ability.cost.includes('Sacrifice') ? '• Sacrifice cost is paid' : null,
          ].filter(Boolean) as string[],
        }
      ));

      if (isTapAbility) {
        stateChanges.push({
          type: 'tap',
          description: `${cardName} becomes tapped`,
          before: 'untapped',
          after: 'tapped',
        });
      }
    }

    // Step 3: Targeting (if applicable)
    if (action.targets?.length > 0) {
      const targetNames = action.targets.map((t: string) => {
        const target = game.cards[t];
        return target?.name || game.players[t]?.name || t;
      });
      steps.push(createStep('target', 'Choose Targets',
        `Targets selected: ${targetNames.join(', ')}`,
        {
          relatedCardIds: action.targets.filter((t: string) => game.cards[t]),
        }
      ));
    }

    // Step 4: Check if mana ability
    const isManaAbility = ability?.effect?.toLowerCase().includes('add') &&
                          (ability.effect.includes('{') || ability.effect.toLowerCase().includes('mana'));

    if (isManaAbility) {
      steps.push(createStep('effect', 'Mana Ability Resolution',
        `This is a mana ability - it resolves immediately without using the stack.`,
        {
          details: [
            '• Mana abilities cannot be responded to',
            `• Effect: ${ability?.effect || 'Add mana'}`,
          ],
          highlight: 'success',
        }
      ));
      stateChanges.push({
        type: 'mana',
        description: ability?.effect || 'Add mana to pool',
      });
    } else {
      // Step 4b: Put on stack
      steps.push(createStep('stack', 'Put on Stack',
        `Ability is placed on the stack. All players receive priority to respond.`,
        {
          details: [
            '• Opponents can respond with instants or abilities',
            '• If no responses, ability will resolve',
          ],
        }
      ));

      // Step 5: Resolution
      steps.push(createStep('resolve', 'Resolution',
        `When the ability resolves: ${ability?.effect || 'effect is applied'}`,
        {
          highlight: 'success',
        }
      ));
    }

    return {
      summary: `Activating ability of ${cardName}`,
      oracleText: oracleText || undefined,
      parsedAbilities: activatedAbilities.length > 0 ? activatedAbilities : undefined,
      steps,
      stateChanges,
      rulesReferences: [
        { rule: 'CR 602', description: 'Activating Activated Abilities' },
        isManaAbility
          ? { rule: 'CR 605', description: 'Mana Abilities' }
          : { rule: 'CR 608', description: 'Resolving Spells and Abilities' },
      ],
    };
  }

  /**
   * Generate detailed explanation for DECLARE_ATTACKERS
   */
  private static generateDeclareAttackersExplanation(
    action: any,
    game: StrictGameState,
    player: { name: string } | undefined
  ): DebugDetailedExplanation {
    const steps: DebugExplanationStep[] = [];
    const stateChanges: DebugDetailedExplanation['stateChanges'] = [];
    const triggeredAbilities: DebugDetailedExplanation['triggeredAbilities'] = [];
    let stepCounter = 1;

    const createStep = (
      type: DebugStepType,
      title: string,
      description: string,
      options?: Partial<DebugExplanationStep>
    ): DebugExplanationStep => ({
      id: `step-${stepCounter++}`,
      type,
      title,
      description,
      ...options,
    });

    const attackers = action.attackers || [];
    // Attackers can be either string IDs or objects with attackerId
    const attackerIds = attackers.map((attacker: any) =>
      typeof attacker === 'string' ? attacker : attacker.attackerId
    );
    const attackerCards = attackerIds.map((id: string) => game.cards[id]).filter(Boolean);

    // Step 1: Declare attackers
    steps.push(createStep('info', 'Declare Attackers Step',
      `${player?.name || 'Active player'} declares ${attackers.length} attacker(s).`,
      {
        details: attackerCards.map((c: CardObject) => `• ${c.name} (${c.power}/${c.toughness})`),
        relatedCardIds: attackerIds,
      }
    ));

    // Step 2: Tap attackers
    const attackersToTap = attackerCards.filter((c: CardObject) => {
      const hasVigilance = c.keywords?.includes('Vigilance') ||
                          c.oracleText?.toLowerCase().includes('vigilance');
      return !hasVigilance;
    });

    if (attackersToTap.length > 0) {
      steps.push(createStep('state', 'Tap Attacking Creatures',
        `Attacking creatures without Vigilance are tapped.`,
        {
          details: attackersToTap.map((c: CardObject) => `• ${c.name} becomes tapped`),
        }
      ));
      for (const card of attackersToTap) {
        stateChanges.push({
          type: 'tap',
          description: `${card.name} becomes tapped`,
          before: 'untapped',
          after: 'tapped',
        });
      }
    }

    const vigilantAttackers = attackerCards.filter((c: CardObject) => {
      const hasVigilance = c.keywords?.includes('Vigilance') ||
                          c.oracleText?.toLowerCase().includes('vigilance');
      return hasVigilance;
    });
    if (vigilantAttackers.length > 0) {
      steps.push(createStep('info', 'Vigilance',
        `Creatures with Vigilance don't tap when attacking.`,
        {
          details: vigilantAttackers.map((c: CardObject) => `• ${c.name} has Vigilance`),
          highlight: 'info',
        }
      ));
    }

    // Step 3: Attack triggers
    for (const card of attackerCards) {
      const oracleText = card.oracleText || card.definition?.oracle_text || '';
      if (oracleText.toLowerCase().includes('when') && oracleText.toLowerCase().includes('attack')) {
        triggeredAbilities.push({
          sourceCardId: card.instanceId,
          sourceCardName: card.name,
          triggerCondition: 'When this creature attacks',
          effect: oracleText.split('.')[0],
        });
      }
    }

    if (triggeredAbilities.length > 0) {
      steps.push(createStep('trigger', 'Attack Triggers',
        'Triggered abilities from attacking creatures.',
        {
          details: triggeredAbilities.map(t => `• ${t.sourceCardName}: ${t.effect}`),
          highlight: 'success',
        }
      ));
    }

    // Step 4: Priority
    steps.push(createStep('info', 'Priority',
      'After attackers are declared, all players receive priority.',
      {
        details: [
          '• Players can cast instants or activate abilities',
          '• Defending player will then declare blockers',
        ],
      }
    ));

    return {
      summary: `Declaring ${attackers.length} attacker(s)`,
      steps,
      stateChanges,
      triggeredAbilities: triggeredAbilities.length > 0 ? triggeredAbilities : undefined,
      rulesReferences: [
        { rule: 'CR 508', description: 'Declare Attackers Step' },
      ],
    };
  }

  /**
   * Generate detailed explanation for DECLARE_BLOCKERS
   */
  private static generateDeclareBlockersExplanation(
    action: any,
    game: StrictGameState,
    player: { name: string } | undefined
  ): DebugDetailedExplanation {
    const steps: DebugExplanationStep[] = [];
    const stateChanges: DebugDetailedExplanation['stateChanges'] = [];
    let stepCounter = 1;

    const createStep = (
      type: DebugStepType,
      title: string,
      description: string,
      options?: Partial<DebugExplanationStep>
    ): DebugExplanationStep => ({
      id: `step-${stepCounter++}`,
      type,
      title,
      description,
      ...options,
    });

    const blockers = action.blockers || [];

    // Step 1: Declare blockers
    steps.push(createStep('info', 'Declare Blockers Step',
      `${player?.name || 'Defending player'} declares ${blockers.length} blocker(s).`,
      {
        details: blockers.map((b: any) => {
          const blocker = game.cards[b.blockerId];
          const attacker = game.cards[b.attackerId];
          return `• ${blocker?.name || 'Unknown'} blocks ${attacker?.name || 'Unknown'}`;
        }),
      }
    ));

    // Step 2: Combat analysis
    for (const b of blockers) {
      const blocker = game.cards[b.blockerId];
      const attacker = game.cards[b.attackerId];
      if (blocker && attacker) {
        const blockerWillDie = (attacker.power || 0) >= (blocker.toughness || 0);
        const attackerWillDie = (blocker.power || 0) >= (attacker.toughness || 0);

        steps.push(createStep('info', `Combat: ${attacker.name} vs ${blocker.name}`,
          `Analyzing combat between ${attacker.name} (${attacker.power}/${attacker.toughness}) and ${blocker.name} (${blocker.power}/${blocker.toughness})`,
          {
            details: [
              attackerWillDie ? `• ${attacker.name} will likely die` : `• ${attacker.name} will likely survive`,
              blockerWillDie ? `• ${blocker.name} will likely die` : `• ${blocker.name} will likely survive`,
            ],
            highlight: attackerWillDie ? 'success' : 'warning',
          }
        ));
      }
    }

    // Step 3: Unblocked attackers
    const attackers = Object.values(game.cards).filter((c: CardObject) =>
      c.zone === 'battlefield' && c.attacking
    );
    const blockedAttackerIds = new Set(blockers.map((b: any) => b.attackerId));
    const unblockedAttackers = attackers.filter((a: CardObject) => !blockedAttackerIds.has(a.instanceId));

    if (unblockedAttackers.length > 0) {
      const totalDamage = unblockedAttackers.reduce((sum: number, a: CardObject) => sum + (a.power || 0), 0);
      steps.push(createStep('info', 'Unblocked Attackers',
        `${unblockedAttackers.length} attacker(s) are unblocked and will deal damage to the defending player.`,
        {
          details: [
            ...unblockedAttackers.map((a: CardObject) => `• ${a.name} (${a.power} damage)`),
            `• Total unblocked damage: ${totalDamage}`,
          ],
          highlight: 'warning',
        }
      ));
    }

    // Step 4: Priority
    steps.push(createStep('info', 'Priority',
      'After blockers are declared, all players receive priority before damage.',
      {
        details: [
          '• Players can cast instants or activate abilities',
          '• Combat damage will be dealt next',
        ],
      }
    ));

    return {
      summary: `Declaring ${blockers.length} blocker(s)`,
      steps,
      stateChanges,
      rulesReferences: [
        { rule: 'CR 509', description: 'Declare Blockers Step' },
      ],
    };
  }

  /**
   * Generate detailed explanation for RESOLVE_TOP_STACK
   */
  private static generateResolveStackExplanation(game: StrictGameState): DebugDetailedExplanation {
    const steps: DebugExplanationStep[] = [];
    const stateChanges: DebugDetailedExplanation['stateChanges'] = [];
    let stepCounter = 1;

    const createStep = (
      type: DebugStepType,
      title: string,
      description: string,
      options?: Partial<DebugExplanationStep>
    ): DebugExplanationStep => ({
      id: `step-${stepCounter++}`,
      type,
      title,
      description,
      ...options,
    });

    const topStack = game.stack[game.stack.length - 1];

    if (!topStack) {
      steps.push(createStep('info', 'Empty Stack',
        'The stack is empty. Nothing to resolve.',
        { highlight: 'warning' }
      ));
      return { summary: 'Stack is empty', steps, stateChanges };
    }

    // Get source card to determine types
    const sourceCard = game.cards[topStack.sourceId];
    const cardTypes = sourceCard?.types || [];

    // Step 1: Identify what's resolving
    steps.push(createStep('info', 'Resolving Stack Item',
      `Resolving: ${topStack.name}`,
      {
        details: [
          `• Stack type: ${topStack.type}`,
          cardTypes.length > 0 ? `• Card types: ${cardTypes.join(' ')}` : null,
          topStack.text ? `• Effect: ${topStack.text}` : null,
        ].filter(Boolean) as string[],
      }
    ));

    // Step 2: Check targets
    if (topStack.targets?.length > 0) {
      const validTargets = topStack.targets.filter((t: string) => {
        const card = game.cards[t];
        return card && card.zone === 'battlefield';
      });

      steps.push(createStep('target', 'Verify Targets',
        `Checking if targets are still legal.`,
        {
          details: [
            `• Original targets: ${topStack.targets.length}`,
            `• Valid targets remaining: ${validTargets.length}`,
            validTargets.length === 0 ? '• Spell will fizzle if all targets are invalid!' : null,
          ].filter(Boolean) as string[],
          highlight: validTargets.length === 0 ? 'error' : 'success',
        }
      ));
    }

    // Step 3: Apply effects
    steps.push(createStep('effect', 'Apply Effects',
      topStack.text || 'Effect is applied.',
      { highlight: 'success' }
    ));

    // Step 4: Destination - check if this is a permanent spell
    const isPermanent = topStack.type === 'spell' && cardTypes.some((t: string) =>
      ['Creature', 'Artifact', 'Enchantment', 'Planeswalker', 'Battle'].includes(t)
    );

    if (isPermanent) {
      steps.push(createStep('zone', 'Enter Battlefield',
        `${topStack.name} enters the battlefield.`,
        {}
      ));
      stateChanges.push({
        type: 'zone',
        description: `${topStack.name} enters the battlefield`,
        before: 'stack',
        after: 'battlefield',
      });
    } else {
      steps.push(createStep('zone', 'To Graveyard',
        `${topStack.name} goes to the graveyard after resolving.`,
        {}
      ));
      stateChanges.push({
        type: 'zone',
        description: `${topStack.name} goes to graveyard`,
        before: 'stack',
        after: 'graveyard',
      });
    }

    return {
      summary: `Resolving ${topStack.name}`,
      oracleText: topStack.text || undefined,
      steps,
      stateChanges,
      rulesReferences: [
        { rule: 'CR 608', description: 'Resolving Spells and Abilities' },
      ],
    };
  }

  /**
   * Generate detailed explanation for MULLIGAN_DECISION
   */
  private static generateMulliganExplanation(
    action: any,
    player: { name: string } | undefined
  ): DebugDetailedExplanation {
    const steps: DebugExplanationStep[] = [];
    const stateChanges: DebugDetailedExplanation['stateChanges'] = [];
    let stepCounter = 1;

    const createStep = (
      type: DebugStepType,
      title: string,
      description: string,
      options?: Partial<DebugExplanationStep>
    ): DebugExplanationStep => ({
      id: `step-${stepCounter++}`,
      type,
      title,
      description,
      ...options,
    });

    const playerName = player?.name || 'Player';
    const keep = action.keep;

    if (keep) {
      steps.push(createStep('info', 'Keep Hand',
        `${playerName} chooses to keep their hand.`,
        {
          details: [
            '• Hand is kept as-is',
            '• Game will proceed to the next phase',
          ],
          highlight: 'success',
        }
      ));
    } else {
      steps.push(createStep('info', 'Mulligan',
        `${playerName} chooses to mulligan.`,
        {
          details: [
            '• Current hand is shuffled back into library',
            '• A new hand is drawn with one fewer card',
            '• Player may mulligan again if desired',
          ],
          highlight: 'warning',
        }
      ));

      stateChanges.push({
        type: 'zone',
        description: 'Hand shuffled into library',
        before: 'hand',
        after: 'library',
      });
    }

    return {
      summary: keep ? `${playerName} keeps hand` : `${playerName} mulligans`,
      steps,
      stateChanges,
      rulesReferences: [
        { rule: 'CR 103.4', description: 'Mulligan' },
      ],
    };
  }

  /**
   * Generate detailed explanation for PASS_PRIORITY
   */
  private static generatePassPriorityExplanation(
    game: StrictGameState,
    player: { name: string } | undefined
  ): DebugDetailedExplanation {
    const steps: DebugExplanationStep[] = [];
    let stepCounter = 1;

    const createStep = (
      type: DebugStepType,
      title: string,
      description: string,
      options?: Partial<DebugExplanationStep>
    ): DebugExplanationStep => ({
      id: `step-${stepCounter++}`,
      type,
      title,
      description,
      ...options,
    });

    const playerName = player?.name || 'Player';
    const hasStack = game.stack.length > 0;

    steps.push(createStep('info', 'Pass Priority',
      `${playerName} passes priority.`,
      {
        details: [
          hasStack
            ? `• Stack has ${game.stack.length} item(s)`
            : '• Stack is empty',
        ],
      }
    ));

    // Determine what happens next
    const allPlayersPassed = game.passedPriorityCount >= Object.keys(game.players).length - 1;

    if (allPlayersPassed) {
      if (hasStack) {
        steps.push(createStep('stack', 'Stack Resolution',
          'All players passed - top of stack will resolve.',
          {
            details: [`• ${game.stack[game.stack.length - 1]?.name || 'Item'} will resolve`],
            highlight: 'success',
          }
        ));
      } else {
        steps.push(createStep('phase', 'Phase Advancement',
          'All players passed with empty stack - moving to next step/phase.',
          {
            details: [
              `• Current phase: ${game.phase}`,
              `• Current step: ${game.step}`,
            ],
            highlight: 'info',
          }
        ));
      }
    } else {
      steps.push(createStep('info', 'Next Player',
        'Priority passes to the next player.',
        {}
      ));
    }

    return {
      summary: `${playerName} passes priority`,
      steps,
      stateChanges: [],
      rulesReferences: [
        { rule: 'CR 117', description: 'Priority' },
      ],
    };
  }

  /**
   * Describe what a spell effect will do
   */
  private static describeSpellEffect(oracleText: string, action: any, game: StrictGameState): string {
    const text = oracleText.toLowerCase();
    const parts: string[] = [];

    // Damage effects
    const damageMatch = text.match(/deal[s]? (\d+) damage/);
    if (damageMatch) {
      const damage = damageMatch[1];
      const targetName = action.targets?.[0]
        ? (game.cards[action.targets[0]]?.name || game.players[action.targets[0]]?.name || 'target')
        : 'target';
      parts.push(`${damage} damage will be dealt to ${targetName}`);
    }

    // Destroy effects
    if (text.includes('destroy')) {
      const targetName = action.targets?.[0]
        ? (game.cards[action.targets[0]]?.name || 'target')
        : 'target';
      parts.push(`${targetName} will be destroyed`);
    }

    // Counter effects
    if (text.includes('counter target')) {
      parts.push('Target spell will be countered and put into its owner\'s graveyard');
    }

    // Draw effects
    const drawMatch = text.match(/draw (\d+|a) card/);
    if (drawMatch) {
      const count = drawMatch[1] === 'a' ? '1' : drawMatch[1];
      parts.push(`Player will draw ${count} card(s)`);
    }

    // Life gain
    const lifeMatch = text.match(/gain (\d+) life/);
    if (lifeMatch) {
      parts.push(`Player will gain ${lifeMatch[1]} life`);
    }

    // Token creation
    if (text.includes('create') && text.includes('token')) {
      const tokenMatch = text.match(/create (?:a |an |(\d+) )?([\d/]+)?\s*([\w\s]+) (?:creature )?token/i);
      if (tokenMatch) {
        const count = tokenMatch[1] || '1';
        const stats = tokenMatch[2] || '';
        const type = tokenMatch[3] || 'creature';
        parts.push(`${count} ${stats} ${type} token(s) will be created`);
      } else {
        parts.push('Token(s) will be created');
      }
    }

    // Return to hand
    if (text.includes('return') && text.includes('hand')) {
      const targetName = action.targets?.[0]
        ? (game.cards[action.targets[0]]?.name || 'target')
        : 'target';
      parts.push(`${targetName} will be returned to its owner's hand`);
    }

    // Exile
    if (text.includes('exile')) {
      const targetName = action.targets?.[0]
        ? (game.cards[action.targets[0]]?.name || 'target')
        : 'target';
      parts.push(`${targetName} will be exiled`);
    }

    if (parts.length === 0) {
      return oracleText.split('.')[0] || 'Effect will be applied';
    }

    return parts.join('. ') + '.';
  }

  /**
   * Find triggered abilities that would fire from an event
   */
  private static findTriggeredAbilities(
    game: StrictGameState,
    eventType: 'cast' | 'landfall' | 'etb' | 'dies',
    sourceCard: CardObject | null
  ): Array<{ sourceCardId: string; sourceCardName: string; triggerCondition: string; effect: string }> {
    const triggers: Array<{ sourceCardId: string; sourceCardName: string; triggerCondition: string; effect: string }> = [];

    // Check all permanents on battlefield for relevant triggers
    for (const card of Object.values(game.cards)) {
      if (card.zone !== 'battlefield') continue;
      if (card.instanceId === sourceCard?.instanceId) continue; // Skip the source itself (handled separately)

      const oracleText = card.oracleText || card.definition?.oracle_text || '';
      const textLower = oracleText.toLowerCase();

      switch (eventType) {
        case 'cast':
          if (textLower.includes('whenever') && textLower.includes('cast')) {
            // Check if it triggers on the type of spell being cast
            const isRelevant = !sourceCard ||
              (textLower.includes('creature') && sourceCard.types?.includes('Creature')) ||
              (textLower.includes('instant') && sourceCard.types?.includes('Instant')) ||
              (textLower.includes('sorcery') && sourceCard.types?.includes('Sorcery')) ||
              textLower.includes('spell');

            if (isRelevant) {
              triggers.push({
                sourceCardId: card.instanceId,
                sourceCardName: card.name,
                triggerCondition: 'Whenever a spell is cast',
                effect: oracleText.split('.')[0],
              });
            }
          }
          break;

        case 'landfall':
          if (textLower.includes('landfall') ||
              (textLower.includes('whenever') && textLower.includes('land') && textLower.includes('enter'))) {
            triggers.push({
              sourceCardId: card.instanceId,
              sourceCardName: card.name,
              triggerCondition: 'Landfall - When a land enters',
              effect: oracleText.split('.')[0],
            });
          }
          break;

        case 'etb':
          if (textLower.includes('whenever') &&
              (textLower.includes('enters the battlefield') || textLower.includes('enters'))) {
            triggers.push({
              sourceCardId: card.instanceId,
              sourceCardName: card.name,
              triggerCondition: 'Whenever a creature enters',
              effect: oracleText.split('.')[0],
            });
          }
          break;

        case 'dies':
          if (textLower.includes('whenever') && textLower.includes('dies')) {
            triggers.push({
              sourceCardId: card.instanceId,
              sourceCardName: card.name,
              triggerCondition: 'Whenever a creature dies',
              effect: oracleText.split('.')[0],
            });
          }
          break;
      }
    }

    return triggers;
  }
}
