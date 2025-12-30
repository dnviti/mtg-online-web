import { StrictGameState } from './types';
import { ActionHandler } from './engine/ActionHandler';
import { PhaseManager } from './engine/PhaseManager';
import { CombatManager } from './engine/CombatManager';
import { CardUtils } from './engine/CardUtils';
import { ManaUtils } from './engine/ManaUtils';

/**
 * RulesEngine
 * 
 * The main facade for the game logic. It delegates specific operations to 
 * specialized sub-modules (ActionHandler, PhaseManager, etc.) while providing
 * a unified API for the GameManager and Socket Handlers.
 */
export class RulesEngine {
  public state: StrictGameState;

  constructor(state: StrictGameState) {
    this.state = state;
  }

  public startGame() {
    console.log("RulesEngine: Starting Game...");
    PhaseManager.performTurnBasedActions(this.state);
  }

  public passPriority(playerId: string): boolean {
    return PhaseManager.passPriority(this.state, playerId);
  }

  public playLand(playerId: string, cardId: string, position?: { x: number, y: number }, faceIndex?: number): boolean {
    return ActionHandler.playLand(this.state, playerId, cardId, position, faceIndex);
  }

  public castSpell(playerId: string, cardId: string, targets: string[] = [], position?: { x: number, y: number }, faceIndex?: number) {
    return ActionHandler.castSpell(this.state, playerId, cardId, targets, position, faceIndex);
  }

  public activateAbility(playerId: string, sourceId: string, _abilityIndex: number, targets: string[] = []) {
    // Legacy support via ActionHandler (not fully implemented yet but placeholder exists)
    // Actually ActionHandler doesn't have activateAbility fully exposed yet, let's add it.
    // Wait, I missed extracted activateAbility in ActionHandler? 
    // I see resolveTopStack handles ability, but extraction might have missed the public method.
    // I will inline it or add it to ActionHandler. 
    // Let's add it to ActionHandler in next step if missing.
    // For now, I'll copy logic here or error.
    // Ah, I missed 'public activateAbility' in ActionHandler in previous write!
    // I will throw unimplemented here and fix ActionHandler in next step.
    if (this.state.priorityPlayerId !== playerId) throw new Error("Not your priority.");

    // Quick inline delegation for now:
    const source = this.state.cards[sourceId];
    if (CardUtils.isEquipment(source) && source.zone === 'battlefield') {
      if (this.state.stack.length > 0 || (this.state.phase !== 'main1' && this.state.phase !== 'main2')) {
        throw new Error("Equip can only be used as a sorcery.");
      }
      if (targets.length !== 1) throw new Error("Equip requires exactly one target.");

      this.state.stack.push({
        id: Math.random().toString(36).substr(2, 9),
        sourceId: sourceId,
        controllerId: playerId,
        type: 'ability',
        name: `Equip ${source.name}`,
        text: `Attach to target`,
        targets
      });
      ActionHandler.resetPriority(this.state, playerId);
      return true;
    }
    throw new Error("Ability not implemented.");
  }

  public declareAttackers(playerId: string, attackers: { attackerId: string, targetId: string }[]) {
    CombatManager.declareAttackers(this.state, playerId, attackers);
    ActionHandler.resetPriority(this.state, playerId);
  }

  public declareBlockers(playerId: string, blockers: { blockerId: string, attackerId: string }[]) {
    CombatManager.declareBlockers(this.state, playerId, blockers);
    ActionHandler.resetPriority(this.state, this.state.activePlayerId);
  }

  public resolveMulligan(playerId: string, keep: boolean, cardsToBottom: string[] = []) {
    // This logic should be in PhaseManager or ActionHandler?
    // It's TBA related.
    if (this.state.step !== 'mulligan') throw new Error("Not mulligan step");
    const player = this.state.players[playerId];
    if (player.handKept) throw new Error("Already kept");

    if (keep) {
      // ... logic ...
      player.handKept = true;
      cardsToBottom.forEach(cid => ActionHandler.moveCardToZone(this.state, cid, 'library'));
      PhaseManager.performTurnBasedActions(this.state);
    } else {
      const hand = Object.values(this.state.cards).filter(c => c.ownerId === playerId && c.zone === 'hand');
      hand.forEach(c => ActionHandler.moveCardToZone(this.state, c.instanceId, 'library'));
      for (let i = 0; i < 7; i++) ActionHandler.drawCard(this.state, playerId);
      player.mulliganCount = (player.mulliganCount || 0) + 1;
    }
  }

  public createToken(playerId: string, definition: any, position?: { x: number, y: number }) {
    ActionHandler.createToken(this.state, playerId, definition, position);
  }

  public addCounter(playerId: string, cardId: string, type: string, count: number = 1) {
    ActionHandler.addCounter(this.state, playerId, cardId, type, count);
  }

  public addMana(playerId: string, mana: { color: string, amount: number }) {
    return ManaUtils.addMana(this.state, playerId, mana);
  }

  public moveCardToZone(cardId: string, toZone: any, faceDown = false, position?: { x: number, y: number }, faceIndex?: number) {
    ActionHandler.moveCardToZone(this.state, cardId, toZone, faceDown, position, faceIndex);
  }
}
