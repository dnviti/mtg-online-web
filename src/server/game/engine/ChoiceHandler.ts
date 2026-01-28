import { StrictGameState, StackObject, PendingChoice, ChoiceResult } from '../types';

/**
 * ChoiceHandler
 *
 * Manages player choices during effect resolution.
 * Creates PendingChoice objects, validates responses, and tracks choice state.
 */
export class ChoiceHandler {
  /**
   * Creates a pending choice and pauses effect resolution.
   * Sets the priority to the choosing player so they can respond.
   */
  static createChoice(
    state: StrictGameState,
    _stackItem: StackObject,
    config: Omit<PendingChoice, 'id' | 'createdAt'>
  ): PendingChoice {
    const choice: PendingChoice = {
      ...config,
      id: `choice-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      createdAt: Date.now()
    };

    state.pendingChoice = choice;
    state.priorityPlayerId = choice.choosingPlayerId;

    console.log(`[ChoiceHandler] Created ${choice.type} choice for ${choice.choosingPlayerId}: "${choice.prompt}"`);
    return choice;
  }

  /**
   * Validates a choice response from a player.
   * Checks that the choice belongs to the player and meets all constraints.
   */
  static validateChoice(
    state: StrictGameState,
    playerId: string,
    result: ChoiceResult
  ): { valid: boolean; error?: string } {
    const pending = state.pendingChoice;
    if (!pending) {
      return { valid: false, error: 'No pending choice' };
    }

    if (pending.choosingPlayerId !== playerId) {
      return { valid: false, error: 'Not your choice to make' };
    }

    if (pending.id !== result.choiceId) {
      return { valid: false, error: 'Choice ID mismatch' };
    }

    // Type-specific validation
    switch (pending.type) {
      case 'card_selection':
      case 'target_selection':
        return this.validateCardSelection(pending, result);

      case 'mode_selection':
        return this.validateModeSelection(pending, result);

      case 'yes_no':
        if (result.confirmed === undefined) {
          return { valid: false, error: 'Must choose yes or no' };
        }
        return { valid: true };

      case 'number_selection':
        return this.validateNumberSelection(pending, result);

      case 'order_selection':
        return this.validateOrderSelection(pending, result);

      case 'player_selection':
        return this.validatePlayerSelection(state, pending, result);

      default:
        return { valid: true };
    }
  }

  /**
   * Processes a valid choice and stores it in the stack item's resolution state.
   * Clears the pending choice and any revealed cards.
   */
  static processChoice(state: StrictGameState, result: ChoiceResult): StackObject | null {
    const pending = state.pendingChoice;
    if (!pending) {
      console.warn('[ChoiceHandler] processChoice called with no pending choice');
      return null;
    }

    // Find the stack item this choice belongs to
    const stackItem = state.stack.find(s => s.id === pending.sourceStackId);
    if (stackItem) {
      // Initialize resolution state if needed
      if (!stackItem.resolutionState) {
        stackItem.resolutionState = { choicesMade: [] };
      }
      // Store the choice result
      stackItem.resolutionState.choicesMade.push(result);
      console.log(`[ChoiceHandler] Stored ${result.type} choice result for stack item ${stackItem.id}`);
    } else {
      console.warn(`[ChoiceHandler] Stack item ${pending.sourceStackId} not found`);
    }

    // Clear pending choice
    state.pendingChoice = null;

    // Clear any revealed cards
    if (state.revealedToPlayer) {
      state.revealedToPlayer = undefined;
    }

    return stackItem || null;
  }

  // ============================================
  // VALIDATION HELPERS
  // ============================================

  private static validateCardSelection(
    pending: PendingChoice,
    result: ChoiceResult
  ): { valid: boolean; error?: string } {
    const count = result.selectedCardIds?.length || 0;
    const constraints = pending.constraints;

    if (constraints?.exactCount !== undefined && count !== constraints.exactCount) {
      return { valid: false, error: `Must select exactly ${constraints.exactCount} card(s)` };
    }

    if (constraints?.minCount !== undefined && count < constraints.minCount) {
      return { valid: false, error: `Must select at least ${constraints.minCount} card(s)` };
    }

    if (constraints?.maxCount !== undefined && count > constraints.maxCount) {
      return { valid: false, error: `Cannot select more than ${constraints.maxCount} card(s)` };
    }

    // Validate each selected card is in the selectable list
    for (const cardId of result.selectedCardIds || []) {
      if (!pending.selectableIds?.includes(cardId)) {
        return { valid: false, error: `Card ${cardId} is not a valid selection` };
      }
    }

    return { valid: true };
  }

  private static validateModeSelection(
    pending: PendingChoice,
    result: ChoiceResult
  ): { valid: boolean; error?: string } {
    const count = result.selectedOptionIds?.length || 0;

    if (count === 0) {
      return { valid: false, error: 'Must select at least one mode' };
    }

    const validOptionIds = pending.options?.filter(o => !o.disabled).map(o => o.id) || [];

    for (const id of result.selectedOptionIds || []) {
      if (!validOptionIds.includes(id)) {
        return { valid: false, error: `Invalid mode: ${id}` };
      }
    }

    const constraints = pending.constraints;
    if (constraints?.exactCount !== undefined && count !== constraints.exactCount) {
      return { valid: false, error: `Must select exactly ${constraints.exactCount} mode(s)` };
    }

    if (constraints?.minCount !== undefined && count < constraints.minCount) {
      return { valid: false, error: `Must select at least ${constraints.minCount} mode(s)` };
    }

    if (constraints?.maxCount !== undefined && count > constraints.maxCount) {
      return { valid: false, error: `Cannot select more than ${constraints.maxCount} mode(s)` };
    }

    return { valid: true };
  }

  private static validateNumberSelection(
    pending: PendingChoice,
    result: ChoiceResult
  ): { valid: boolean; error?: string } {
    if (result.selectedValue === undefined) {
      return { valid: false, error: 'Must select a number' };
    }

    if (pending.minValue !== undefined && result.selectedValue < pending.minValue) {
      return { valid: false, error: `Value must be at least ${pending.minValue}` };
    }

    if (pending.maxValue !== undefined && result.selectedValue > pending.maxValue) {
      return { valid: false, error: `Value cannot exceed ${pending.maxValue}` };
    }

    return { valid: true };
  }

  private static validateOrderSelection(
    pending: PendingChoice,
    result: ChoiceResult
  ): { valid: boolean; error?: string } {
    const orderedIds = result.orderedIds || [];
    const selectableIds = pending.selectableIds || [];

    if (orderedIds.length !== selectableIds.length) {
      return { valid: false, error: 'Must order all items' };
    }

    // Check that all selectable IDs are present exactly once
    const orderedSet = new Set(orderedIds);
    if (orderedSet.size !== orderedIds.length) {
      return { valid: false, error: 'Duplicate items in order' };
    }

    for (const id of selectableIds) {
      if (!orderedSet.has(id)) {
        return { valid: false, error: `Missing item in order: ${id}` };
      }
    }

    return { valid: true };
  }

  private static validatePlayerSelection(
    state: StrictGameState,
    pending: PendingChoice,
    result: ChoiceResult
  ): { valid: boolean; error?: string } {
    if (!result.selectedPlayerId) {
      return { valid: false, error: 'Must select a player' };
    }

    if (!state.players[result.selectedPlayerId]) {
      return { valid: false, error: 'Invalid player selection' };
    }

    if (pending.selectableIds && !pending.selectableIds.includes(result.selectedPlayerId)) {
      return { valid: false, error: 'Player is not a valid selection' };
    }

    return { valid: true };
  }
}
