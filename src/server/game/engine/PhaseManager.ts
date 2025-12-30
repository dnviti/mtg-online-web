import { StrictGameState, Phase, Step } from '../types';
import { ActionHandler } from './ActionHandler';
import { CombatManager } from './CombatManager';

/**
 * PhaseManager
 * 
 * Controls the flow of the game turns, phases, and steps.
 * It handles the state machine transitions (e.g., Main1 -> Combat -> Main2),
 * executes Turn-Based Actions (draw, untap), and manages the priority passing loop.
 */
export class PhaseManager {

  /**
   * Advances the game to the next logical step or phase.
   * Handles special skips (e.g. skipping combat if no attackers) and empty mana pools.
   */
  static advanceStep(state: StrictGameState) {
    const structure: Record<Phase, Step[]> = {
      setup: ['mulligan'],
      beginning: ['untap', 'upkeep', 'draw'],
      main1: ['main'],
      combat: ['beginning_combat', 'declare_attackers', 'declare_blockers', 'combat_damage', 'end_combat'],
      main2: ['main'],
      ending: ['end', 'cleanup']
    };

    const phaseOrder: Phase[] = ['setup', 'beginning', 'main1', 'combat', 'main2', 'ending'];
    let nextStep: Step | null = null;
    let nextPhase: Phase = state.phase;

    const steps = structure[state.phase];
    const stepIdx = steps.indexOf(state.step);

    if (stepIdx < steps.length - 1) {
      nextStep = steps[stepIdx + 1];
    } else {
      const phaseIdx = phaseOrder.indexOf(state.phase);
      const nextPhaseIdx = (phaseIdx + 1) % phaseOrder.length;
      nextPhase = phaseOrder[nextPhaseIdx];

      if (nextPhaseIdx === 0) {
        this.advanceTurn(state);
        return;
      }
      nextStep = structure[nextPhase][0];
    }

    // Skip Logic
    if (state.phase === 'combat') {
      const attackers = Object.values(state.cards).filter(c => !!c.attacking);
      if (nextStep === 'declare_blockers' && attackers.length === 0) {
        console.log("No attackers. Skipping directly to End of Combat.");
        nextStep = 'end_combat';
      }
    }

    // Empty Mana
    Object.values(state.players).forEach(p => {
      if (p.manaPool) p.manaPool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
    });

    state.passedPriorityCount = 0;
    Object.values(state.players).forEach(p => {
      p.hasPassed = false;
      p.stopRequested = false;
    });

    state.phase = nextPhase;
    state.step = nextStep!;
    console.log(`Advancing to ${state.phase} - ${state.step}`);

    this.performTurnBasedActions(state);
  }

  static advanceTurn(state: StrictGameState) {
    state.turnCount++;
    const currentAPIdx = state.turnOrder.indexOf(state.activePlayerId);
    const nextAPIdx = (currentAPIdx + 1) % state.turnOrder.length;
    state.activePlayerId = state.turnOrder[nextAPIdx];

    state.phase = 'beginning';
    state.step = 'untap';
    state.landsPlayedThisTurn = 0;

    console.log(`Starting Turn ${state.turnCount}. Active Player: ${state.activePlayerId}`);
    this.performTurnBasedActions(state);
  }

  static performTurnBasedActions(state: StrictGameState) {
    const { step, activePlayerId } = state;

    if (step === 'mulligan') {
      // Logic moved here
      // Keeping for logging if needed but currently unused in logic below (except checks)
      console.log(`[RulesEngine] Performing Mulligan TBA.`);

      Object.values(state.players).forEach(p => {
        const hand = Object.values(state.cards).filter(c => c.ownerId === p.id && c.zone === 'hand');
        if (hand.length === 0 && !p.handKept) {
          for (let i = 0; i < 7; i++) ActionHandler.drawCard(state, p.id);
        }
      });

      if (Object.values(state.players).every(p => p.handKept)) {
        this.advanceStep(state);
      }
      return;
    }

    if (step === 'untap') {
      Object.values(state.cards).forEach(card => {
        if (card.controllerId === activePlayerId && card.zone === 'battlefield') {
          card.tapped = false;
        }
      });
      state.step = 'upkeep'; // Skip priority in untap
      ActionHandler.resetPriority(state, activePlayerId);
      return;
    }

    if (step === 'draw') {
      const player = state.players[activePlayerId];
      if (state.turnCount > 1 || state.turnOrder.length > 2) {
        if (player && player.isBot) {
          ActionHandler.drawCard(state, activePlayerId);
          ActionHandler.resetPriority(state, activePlayerId);
        } else {
          // Manual draw wait
          if (state.priorityPlayerId !== activePlayerId) state.priorityPlayerId = activePlayerId;
        }
      } else {
        ActionHandler.resetPriority(state, activePlayerId); // Skip draw turn 1
      }
      return;
    }

    if (step === 'cleanup') {
      Object.values(state.cards).forEach(c => {
        c.damageMarked = 0;
        c.attacking = undefined;
        c.blocking = [];
        if (c.modifiers) c.modifiers = c.modifiers.filter(m => !m.untilEndOfTurn);
      });
      state.attackersDeclared = false;
      state.blockersDeclared = false;
      this.advanceTurn(state);
      return;
    }

    if (step === 'declare_attackers') {
      if (state.priorityPlayerId !== activePlayerId) ActionHandler.resetPriority(state, activePlayerId);
      return;
    }

    if (step === 'declare_blockers') {
      const defendingPlayerId = state.turnOrder.find(id => id !== activePlayerId);
      if (defendingPlayerId && state.priorityPlayerId !== defendingPlayerId) {
        state.priorityPlayerId = defendingPlayerId;
        Object.values(state.players).forEach(p => p.hasPassed = false);
        state.passedPriorityCount = 0;
      }
      return;
    }

    if (step === 'combat_damage') {
      CombatManager.resolveCombatDamage(state);
      ActionHandler.resetPriority(state, activePlayerId);
      return;
    }

    ActionHandler.resetPriority(state, activePlayerId);
  }

  static passPriority(state: StrictGameState, playerId: string) {
    if (state.priorityPlayerId !== playerId) return false;

    state.players[playerId].hasPassed = true;
    state.passedPriorityCount++;

    const totalPlayers = state.turnOrder.length;

    if (state.passedPriorityCount >= totalPlayers) {
      if (state.stack.length > 0) {
        ActionHandler.resolveTopStack(state);
      } else {
        this.advanceStep(state);
      }
    } else {
      const currentIndex = state.turnOrder.indexOf(state.priorityPlayerId);
      const nextIndex = (currentIndex + 1) % state.turnOrder.length;
      state.priorityPlayerId = state.turnOrder[nextIndex];
    }
    return true;
  }
}
