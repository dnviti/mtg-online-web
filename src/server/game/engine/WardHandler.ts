import { StrictGameState, CardObject, StackObject } from '../types';
import { ChoiceHandler } from './ChoiceHandler';
import { ManaUtils } from './ManaUtils';
import { GameLogger } from './GameLogger';

/**
 * WardHandler
 *
 * Handles the Ward keyword ability.
 * Ward X - Whenever this creature becomes the target of a spell or ability
 * an opponent controls, counter that spell or ability unless its controller pays X.
 */
export class WardHandler {

  /**
   * Checks if any targets have Ward and creates a pending choice if needed.
   * Called when a spell or ability with targets is put on the stack.
   *
   * @returns true if Ward was triggered and needs payment, false otherwise
   */
  static checkWardTrigger(
    state: StrictGameState,
    stackItem: StackObject,
    sourceCard: CardObject
  ): boolean {
    const targets = stackItem.targets || [];
    if (targets.length === 0) return false;

    const controllerId = stackItem.controllerId;

    for (const targetId of targets) {
      const targetCard = state.cards[targetId];
      if (!targetCard || targetCard.zone !== 'battlefield') continue;

      // Ward only triggers if targeted by an opponent
      if (targetCard.controllerId === controllerId) continue;

      // Check for Ward keyword
      const wardCost = this.getWardCost(targetCard);
      if (!wardCost) continue;

      console.log(`[WardHandler] ${targetCard.name} has Ward ${wardCost}, triggering for ${sourceCard.name}`);

      // Create a pending choice for the spell's controller to pay Ward cost
      ChoiceHandler.createChoice(state, stackItem, {
        type: 'yes_no',
        sourceStackId: stackItem.id,
        sourceCardId: targetCard.instanceId,
        sourceCardName: targetCard.name,
        choosingPlayerId: controllerId,
        controllingPlayerId: targetCard.controllerId,
        prompt: `${targetCard.name} has Ward. Pay ${wardCost} or ${sourceCard.name} will be countered.`,
        options: [
          { id: 'pay', label: `Pay ${wardCost}` },
          { id: 'decline', label: 'Decline (spell countered)' }
        ]
      });

      // Store ward info on the stack item for later resolution
      (stackItem as any).wardPending = {
        targetId: targetCard.instanceId,
        cost: wardCost
      };

      GameLogger.log(
        state,
        `{${targetCard.name}}'s Ward triggers - ${state.players[controllerId]?.name} must pay ${wardCost}`,
        'action',
        targetCard.name,
        [targetCard]
      );

      return true; // Ward triggered
    }

    return false; // No Ward triggered
  }

  /**
   * Processes the Ward payment choice result.
   * Returns true if the spell should continue (Ward paid), false if countered.
   */
  static processWardPayment(
    state: StrictGameState,
    stackItem: StackObject,
    confirmed: boolean
  ): boolean {
    const wardInfo = (stackItem as any).wardPending;
    if (!wardInfo) return true;

    const controllerId = stackItem.controllerId;
    const player = state.players[controllerId];
    const wardCard = state.cards[wardInfo.targetId];

    if (confirmed) {
      // Player chose to pay Ward cost
      const cost = wardInfo.cost;

      // Check if it's a mana cost
      if (cost.includes('{')) {
        try {
          ManaUtils.payManaCost(state, controllerId, cost);
          console.log(`[WardHandler] ${player?.name} paid Ward cost ${cost}`);
          GameLogger.log(
            state,
            `${player?.name} pays Ward cost ${cost}`,
            'action',
            wardCard?.name || 'Ward'
          );
          delete (stackItem as any).wardPending;
          return true; // Spell continues
        } catch (e) {
          console.log(`[WardHandler] ${player?.name} couldn't pay Ward cost: ${e}`);
          // Fall through to counter
        }
      }

      // Check if it's a life cost (e.g., "Ward—Pay 2 life")
      const lifeMatch = cost.match(/(\d+)\s*life/i);
      if (lifeMatch) {
        const lifeCost = parseInt(lifeMatch[1]);
        if (player && player.life >= lifeCost) {
          player.life -= lifeCost;
          console.log(`[WardHandler] ${player?.name} paid ${lifeCost} life for Ward`);
          GameLogger.log(
            state,
            `${player?.name} pays ${lifeCost} life for Ward`,
            'action',
            wardCard?.name || 'Ward'
          );
          delete (stackItem as any).wardPending;
          return true;
        }
      }

      // Check for discard cost (e.g., "Ward—Discard a card")
      if (cost.toLowerCase().includes('discard')) {
        // Would need a card selection choice - simplified for now
        console.log(`[WardHandler] Discard Ward cost not fully implemented`);
        delete (stackItem as any).wardPending;
        return true;
      }
    }

    // Ward not paid - counter the spell
    console.log(`[WardHandler] Ward not paid, countering ${stackItem.name}`);
    GameLogger.log(
      state,
      `${stackItem.name} is countered by {${wardCard?.name}}'s Ward`,
      'action',
      wardCard?.name || 'Ward',
      wardCard ? [wardCard] : undefined
    );

    // Remove from stack and move spell to graveyard
    const stackIndex = state.stack.findIndex(s => s.id === stackItem.id);
    if (stackIndex !== -1) {
      state.stack.splice(stackIndex, 1);
    }

    const spellCard = state.cards[stackItem.sourceId];
    if (spellCard && stackItem.type === 'spell') {
      spellCard.zone = 'graveyard';
    }

    delete (stackItem as any).wardPending;
    return false; // Spell countered
  }

  /**
   * Extracts the Ward cost from a card's keywords or oracle text.
   * Returns the cost string (e.g., "{2}", "Pay 3 life") or null if no Ward.
   */
  static getWardCost(card: CardObject): string | null {
    const keywords = card.keywords || [];
    const oracleText = card.oracleText || '';

    // Check keywords array (e.g., ["Ward {2}"])
    for (const keyword of keywords) {
      const match = keyword.match(/^ward\s+(.+)$/i);
      if (match) {
        return match[1];
      }
    }

    // Check oracle text (e.g., "Ward {2}" or "Ward—Pay 3 life")
    const oracleMatch = oracleText.match(/ward\s+(\{[^}]+\}|\d+|—[^.]+)/i);
    if (oracleMatch) {
      let cost = oracleMatch[1];
      // Clean up em-dash format
      if (cost.startsWith('—')) {
        cost = cost.substring(1).trim();
      }
      return cost;
    }

    return null;
  }

  /**
   * Checks if a card has Ward
   */
  static hasWard(card: CardObject): boolean {
    return this.getWardCost(card) !== null;
  }
}
