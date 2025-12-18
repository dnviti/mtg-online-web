
import { StrictGameState, PlayerState, Phase, Step, StackObject } from './types';

export class RulesEngine {
  public state: StrictGameState;

  constructor(state: StrictGameState) {
    this.state = state;
  }

  // --- External Actions ---

  public passPriority(playerId: string): boolean {
    if (this.state.priorityPlayerId !== playerId) return false; // Not your turn

    this.state.players[playerId].hasPassed = true;
    this.state.passedPriorityCount++;

    // Check if all players passed
    if (this.state.passedPriorityCount >= this.state.turnOrder.length) {
      if (this.state.stack.length > 0) {
        this.resolveTopStack();
      } else {
        this.advanceStep();
      }
    } else {
      this.passPriorityToNext();
    }
    return true;
  }

  public playLand(playerId: string, cardId: string): boolean {
    // 1. Check Priority
    if (this.state.priorityPlayerId !== playerId) throw new Error("Not your priority.");

    // 2. Check Stack (Must be empty)
    if (this.state.stack.length > 0) throw new Error("Stack must be empty to play a land.");

    // 3. Check Phase (Main Phase)
    if (this.state.phase !== 'main1' && this.state.phase !== 'main2') throw new Error("Can only play lands in Main Phase.");

    // 4. Check Limits (1 per turn)
    if (this.state.landsPlayedThisTurn >= 1) throw new Error("Already played a land this turn.");

    // 5. Execute
    const card = this.state.cards[cardId];
    if (!card || card.controllerId !== playerId || card.zone !== 'hand') throw new Error("Invalid card.");

    // TODO: Verify it IS a land (need Type system)

    this.moveCardToZone(card.instanceId, 'battlefield');
    this.state.landsPlayedThisTurn++;

    // Playing a land does NOT use the stack, but priority remains with AP?
    // 305.1... The player gets priority again.
    // Reset passing
    this.resetPriority(playerId);

    return true;
  }

  public castSpell(playerId: string, cardId: string, targets: string[] = []) {
    if (this.state.priorityPlayerId !== playerId) throw new Error("Not your priority.");

    const card = this.state.cards[cardId];
    if (!card || card.zone !== 'hand') throw new Error("Invalid card.");

    // TODO: Check Timing (Instant vs Sorcery)

    // Move to Stack
    card.zone = 'stack';

    this.state.stack.push({
      id: Math.random().toString(36).substr(2, 9),
      sourceId: cardId,
      controllerId: playerId,
      type: 'spell', // or permanent-spell
      name: card.name,
      text: "Spell Text...", // TODO: get rules text
      targets
    });

    // Reset priority to caster (Rule 117.3c)
    this.resetPriority(playerId);
    return true;
  }

  // --- Core State Machine ---

  private passPriorityToNext() {
    const currentIndex = this.state.turnOrder.indexOf(this.state.priorityPlayerId);
    const nextIndex = (currentIndex + 1) % this.state.turnOrder.length;
    this.state.priorityPlayerId = this.state.turnOrder[nextIndex];
  }

  private moveCardToZone(cardId: string, toZone: any, faceDown = false) {
    const card = this.state.cards[cardId];
    if (card) {
      card.zone = toZone;
      card.faceDown = faceDown;
      card.tapped = false; // Reset tap usually on zone change (except battlefield->battlefield)
      // Reset X position?
      card.position = { x: 0, y: 0, z: ++this.state.maxZ };
    }
  }

  private resolveTopStack() {
    const item = this.state.stack.pop();
    if (!item) return;

    console.log(`Resolving stack item: ${item.name}`);

    if (item.type === 'spell') {
      const card = this.state.cards[item.sourceId];
      if (card) {
        // Check card types to determine destination
        // Assuming we have type data
        const isPermanent = card.types.some(t =>
          ['Creature', 'Artifact', 'Enchantment', 'Planeswalker', 'Land'].includes(t)
        );

        if (isPermanent) {
          this.moveCardToZone(card.instanceId, 'battlefield');
        } else {
          // Instant / Sorcery
          this.moveCardToZone(card.instanceId, 'graveyard');
        }
      }
    }

    // After resolution, Active Player gets priority again (Rule 117.3b)
    this.resetPriority(this.state.activePlayerId);
  }

  private advanceStep() {
    // Transition Table
    const structure: Record<Phase, Step[]> = {
      beginning: ['untap', 'upkeep', 'draw'],
      main1: ['main'],
      combat: ['beginning_combat', 'declare_attackers', 'declare_blockers', 'combat_damage', 'end_combat'],
      main2: ['main'],
      ending: ['end', 'cleanup']
    };

    const phaseOrder: Phase[] = ['beginning', 'main1', 'combat', 'main2', 'ending'];

    let nextStep: Step | null = null;
    let nextPhase: Phase = this.state.phase;

    // Find current index in current phase
    const steps = structure[this.state.phase];
    const stepIdx = steps.indexOf(this.state.step);

    if (stepIdx < steps.length - 1) {
      // Next step in same phase
      nextStep = steps[stepIdx + 1];
    } else {
      // Next phase
      const phaseIdx = phaseOrder.indexOf(this.state.phase);
      const nextPhaseIdx = (phaseIdx + 1) % phaseOrder.length;
      nextPhase = phaseOrder[nextPhaseIdx];

      if (nextPhaseIdx === 0) {
        // Next Turn!
        this.advanceTurn();
        return; // advanceTurn handles the setup of untap
      }

      nextStep = structure[nextPhase][0];
    }

    this.state.phase = nextPhase;
    this.state.step = nextStep!;

    console.log(`Advancing to ${this.state.phase} - ${this.state.step}`);

    this.performTurnBasedActions();
  }

  private advanceTurn() {
    this.state.turnCount++;

    // Rotate Active Player
    const currentAPIdx = this.state.turnOrder.indexOf(this.state.activePlayerId);
    const nextAPIdx = (currentAPIdx + 1) % this.state.turnOrder.length;
    this.state.activePlayerId = this.state.turnOrder[nextAPIdx];

    // Reset Turn State
    this.state.phase = 'beginning';
    this.state.step = 'untap';
    this.state.landsPlayedThisTurn = 0;

    console.log(`Starting Turn ${this.state.turnCount}. Active Player: ${this.state.activePlayerId}`);

    // Logic for new turn
    this.performTurnBasedActions();
  }

  // --- Turn Based Actions & Triggers ---

  private performTurnBasedActions() {
    const { phase, step, activePlayerId } = this.state;

    // 1. Untap Step
    if (step === 'untap') {
      this.untapStep(activePlayerId);
      // Untap step has NO priority window. Proceed immediately to Upkeep.
      this.state.step = 'upkeep';
      this.resetPriority(activePlayerId);
      return;
    }

    // 2. Draw Step
    if (step === 'draw') {
      if (this.state.turnCount > 1 || this.state.turnOrder.length > 2) {
        this.drawCard(activePlayerId);
      }
    }

    // 3. Cleanup Step
    if (step === 'cleanup') {
      this.cleanupStep(activePlayerId);
      // Usually no priority in cleanup, unless triggers.
      // Assume auto-pass turn to next Untap.
      this.advanceTurn();
      return;
    }

    // Default: Reset priority to AP to start the step
    this.resetPriority(activePlayerId);
  }

  private untapStep(playerId: string) {
    // Untap all perms controller by player
    Object.values(this.state.cards).forEach(card => {
      if (card.controllerId === playerId && card.zone === 'battlefield') {
        card.tapped = false;
        // Also summon sickness logic if we tracked it
      }
    });
  }

  private drawCard(playerId: string) {
    const library = Object.values(this.state.cards).filter(c => c.ownerId === playerId && c.zone === 'library');
    if (library.length > 0) {
      // Draw top card (random for now if not ordered?)
      // Assuming library is shuffled, pick random
      const card = library[Math.floor(Math.random() * library.length)];
      this.moveCardToZone(card.instanceId, 'hand');
      console.log(`Player ${playerId} draws ${card.name}`);
    } else {
      // Empty library loss?
      console.log(`Player ${playerId} attempts to draw from empty library.`);
    }
  }

  private cleanupStep(playerId: string) {
    // Remove damage, discard down to 7
    console.log(`Cleanup execution.`);
  }

  // --- State Based Actions ---

  private checkStateBasedActions(): boolean {
    let sbaPerformed = false;
    const { players, cards } = this.state;

    // 1. Player Loss
    for (const pid of Object.keys(players)) {
      const p = players[pid];
      if (p.life <= 0 || p.poison >= 10) {
        // Player loses
        // In multiplayer, they leave the game. 
        // Simple implementation: Mark as lost/inactive
        if (p.isActive) { // only process once
          console.log(`Player ${p.name} loses the game.`);
          // TODO: Remove all their cards, etc.
          // For now just log.
        }
      }
    }

    // 2. Creature Death (Zero Toughness or Lethal Damage)
    const creatures = Object.values(cards).filter(c => c.zone === 'battlefield' && c.types.includes('Creature'));

    for (const c of creatures) {
      // 704.5f Toughness 0 or less
      if (c.toughness <= 0) {
        console.log(`SBA: ${c.name} put to GY (Zero Toughness).`);
        c.zone = 'graveyard';
        sbaPerformed = true;
        continue;
      }

      // 704.5g Lethal Damage
      // TODO: Calculate damage marked on creature (need damage tracking on card)
      // Assuming c.damageAssignment holds damage marked?
      let totalDamage = 0;
      // logic to sum damage
      if (totalDamage >= c.toughness && !c.supertypes.includes('Indestructible')) {
        console.log(`SBA: ${c.name} destroyed (Lethal Damage).`);
        c.zone = 'graveyard';
        sbaPerformed = true;
      }
    }

    // 3. Legend Rule (704.5j)
    // Map<Controller, Map<Name, Count>>
    // If count > 1, prompt user to choose one? 
    // SBAs don't use stack, but Legend Rule requires a choice.
    // In strict engine, if a choice is required, we might need a special state 'awaiting_sba_choice'.
    // For now, simplify: Auto-keep oldest? Or newest? 
    // Rules say "choose one", so we can't automate strictly without pausing.
    // Let's implement auto-graveyard oldest duplicate for now to avoid stuck state.

    return sbaPerformed;
  }

  private resetPriority(playerId: string) {
    // Check SBAs first (Loop until no SBAs happen)
    let loops = 0;
    while (this.checkStateBasedActions()) {
      loops++;
      if (loops > 100) {
        console.error("Infinite SBA Loop Detected");
        break;
      }
    }

    this.state.priorityPlayerId = playerId;
    this.state.passedPriorityCount = 0;
    Object.values(this.state.players).forEach(p => p.hasPassed = false);
  }
}
