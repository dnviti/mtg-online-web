
import { StrictGameState, Phase, Step } from './types';

export class RulesEngine {
  public state: StrictGameState;

  constructor(state: StrictGameState) {
    this.state = state;
  }

  // --- External Actions ---

  public passPriority(playerId: string): boolean {
    if (this.state.priorityPlayerId !== playerId) return false; // Not your turn

    const player = this.state.players[playerId];
    player.hasPassed = true;
    this.state.passedPriorityCount++;

    const totalPlayers = this.state.turnOrder.length;

    // Check if all players passed in a row
    if (this.state.passedPriorityCount >= totalPlayers) {
      // 1. If Stack is NOT empty, Resolve Top
      if (this.state.stack.length > 0) {
        this.resolveTopStack();
      }
      // 2. If Stack IS empty, Advance Step
      else {
        this.advanceStep();
      }
    } else {
      // Pass Priority to Next Player
      this.passPriorityToNext();
    }
    return true;
  }

  public playLand(playerId: string, cardId: string, position?: { x: number, y: number }): boolean {
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

    // Verify it IS a land
    if (!card.typeLine?.includes('Land') && !card.types.includes('Land')) throw new Error("Not a land card.");

    this.moveCardToZone(card.instanceId, 'battlefield', false, position);
    this.state.landsPlayedThisTurn++;

    // Playing a land does NOT use the stack, but priority remains with AP?
    // 305.1... The player gets priority again.
    // Reset passing
    this.resetPriority(playerId);

    return true;
  }

  public startGame() {
    console.log("RulesEngine: Starting Game...");
    // Ensure specific setup if needed (life total, etc is done elsewhere)

    // Trigger Initial Draw
    this.performTurnBasedActions();
  }

  public castSpell(playerId: string, cardId: string, targets: string[] = [], position?: { x: number, y: number }) {
    if (this.state.priorityPlayerId !== playerId) throw new Error("Not your priority.");

    const card = this.state.cards[cardId];
    if (!card || card.zone !== 'hand') throw new Error("Invalid card.");

    // Validate Mana Cost
    if (card.manaCost) {
      this.payManaCost(playerId, card.manaCost);
    }

    // Move to Stack
    card.zone = 'stack';

    this.state.stack.push({
      id: Math.random().toString(36).substr(2, 9),
      sourceId: cardId,
      controllerId: playerId,
      type: 'spell', // or permanent-spell
      name: card.name,
      text: card.oracleText || "",
      targets,
      resolutionPosition: position
    });

    // Reset priority to caster (Rule 117.3c)
    this.resetPriority(playerId);
    return true;
  }

  // --- Mana System ---

  private parseManaCost(manaCost: string): { generic: number, colors: Record<string, number> } {
    const cost = { generic: 0, colors: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 } as Record<string, number> };

    if (!manaCost) return cost;

    // Use regex to match {X} blocks
    const matches = manaCost.match(/{[^{}]+}/g);
    if (!matches) return cost;

    matches.forEach(symbol => {
      const content = symbol.replace(/[{}]/g, '');

      // Check for generic number
      if (!isNaN(Number(content))) {
        cost.generic += Number(content);
      }
      // check for hybrid/phyrexian later if needed, for now exact colors
      else {
        // Standard colors
        if (['W', 'U', 'B', 'R', 'G', 'C'].includes(content)) {
          cost.colors[content]++;
        } else {
          // Handle 'X' or other symbols if necessary, currently ignored as 0 cost
        }
      }
    });

    return cost;
  }

  private getLandColor(card: any): string | null {
    if (!card.typeLine?.includes('Land') && !card.types.includes('Land')) return null;

    // Basic heuristic based on type line names
    if (card.typeLine.includes('Plains')) return 'W';
    if (card.typeLine.includes('Island')) return 'U';
    if (card.typeLine.includes('Swamp')) return 'B';
    if (card.typeLine.includes('Mountain')) return 'R';
    if (card.typeLine.includes('Forest')) return 'G';

    // Fallback: Wastes or special lands? 
    // For MVP, we assume typed basic lands or nothing.
    return null;
  }

  private payManaCost(playerId: string, manaCostStr: string) {
    const player = this.state.players[playerId];
    const cost = this.parseManaCost(manaCostStr);

    // 1. Gather Resources
    const pool = { ...player.manaPool }; // Copy pool
    const lands = Object.values(this.state.cards).filter(c =>
      c.controllerId === playerId &&
      c.zone === 'battlefield' &&
      !c.tapped &&
      (c.types.includes('Land') || c.typeLine?.includes('Land'))
    );

    const landsToTap: string[] = []; // List of IDs

    // 2. Pay Colored Costs
    for (const color of ['W', 'U', 'B', 'R', 'G', 'C']) {
      let required = cost.colors[color];
      if (required <= 0) continue;

      // a. Pay from Pool first
      if (pool[color] >= required) {
        pool[color] -= required;
        required = 0;
      } else {
        required -= pool[color];
        pool[color] = 0;
      }

      // b. Pay from Lands
      if (required > 0) {
        // Find lands producing this color
        const producers = lands.filter(l => !landsToTap.includes(l.instanceId) && this.getLandColor(l) === color);

        if (producers.length >= required) {
          // Mark first N as used
          for (let i = 0; i < required; i++) {
            landsToTap.push(producers[i].instanceId);
          }
          required = 0;
        } else {
          // Use all we have, but it's not enough
          throw new Error(`Insufficient ${color} mana.`);
        }
      }
    }

    // 3. Pay Generic Cost
    let genericRequired = cost.generic;

    if (genericRequired > 0) {
      // a. Consume any remaining pools (greedy, order doesn't matter for generic usually, but maybe keep 'better' colors? No, random for now)
      for (const color of Object.keys(pool)) {
        if (genericRequired <= 0) break;
        const available = pool[color];
        if (available > 0) {
          const params = Math.min(available, genericRequired);
          pool[color] -= params;
          genericRequired -= params;
        }
      }

      // b. Tap remaining unused lands
      if (genericRequired > 0) {
        // Filter lands not yet marked for tap
        const unusedLands = lands.filter(l => !landsToTap.includes(l.instanceId) && this.getLandColor(l) !== null);

        if (unusedLands.length >= genericRequired) {
          for (let i = 0; i < genericRequired; i++) {
            landsToTap.push(unusedLands[i].instanceId);
          }
          genericRequired = 0;
        } else {
          throw new Error("Insufficient mana for generic cost.");
        }
      }
    }

    // 4. Commit Payments
    // Update Pool
    player.manaPool = pool;
    // Tap Lands
    landsToTap.forEach(lid => {
      const land = this.state.cards[lid];
      land.tapped = true;
      console.log(`Auto-tapped ${land.name} for mana.`);
    });
    console.log(`Paid mana cost ${manaCostStr}. Remaining Pool:`, pool);
  }

  public addMana(playerId: string, mana: { color: string, amount: number }) {
    // Check if player has priority or if checking for mana abilities?
    // 605.3a: Player may activate mana ability whenever they have priority... or when rule/effect asks for mana payment.
    // For manual engine, we assume priority or loose check.

    // Validate Color
    const validColors = ['W', 'U', 'B', 'R', 'G', 'C'];
    if (!validColors.includes(mana.color)) throw new Error("Invalid mana color.");

    const player = this.state.players[playerId];
    if (!player) throw new Error("Invalid player.");

    if (!player.manaPool) player.manaPool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };

    player.manaPool[mana.color] = (player.manaPool[mana.color] || 0) + mana.amount;

    console.log(`Player ${playerId} added ${mana.amount}${mana.color} to pool.`, player.manaPool);
    return true;
  }

  public declareAttackers(playerId: string, attackers: { attackerId: string, targetId: string }[]) {
    // 508.1. Declare Attackers Step
    if (this.state.phase !== 'combat' || this.state.step !== 'declare_attackers') throw new Error("Not Declare Attackers step.");
    if (this.state.activePlayerId !== playerId) throw new Error("Only Active Player can declare attackers.");

    // Validate and Process
    attackers.forEach(({ attackerId, targetId }) => {
      const card = this.state.cards[attackerId];
      if (!card || card.controllerId !== playerId || card.zone !== 'battlefield') throw new Error(`Invalid attacker ${attackerId}`);
      if (!card.types.includes('Creature')) throw new Error(`${card.name} is not a creature.`);

      // Summoning Sickness
      const hasHaste = card.keywords.includes('Haste'); // Simple string check
      if (card.controlledSinceTurn === this.state.turnCount && !hasHaste) {
        throw new Error(`${card.name} has Summoning Sickness.`);
      }

      // Tap if not Vigilance
      const hasVigilance = card.keywords.includes('Vigilance');
      if (card.tapped && !hasVigilance) throw new Error(`${card.name} is tapped.`);

      if (!hasVigilance) {
        card.tapped = true;
      }

      card.attacking = targetId;
    });

    console.log(`Player ${playerId} declared ${attackers.length} attackers.`);
    this.state.attackersDeclared = true; // Flag for UI/Engine state

    // 508.2. Active Player gets priority
    // But usually passing happens immediately after declaration in digital?
    // We will reset priority to AP.
    this.resetPriority(playerId);
  }

  public declareBlockers(playerId: string, blockers: { blockerId: string, attackerId: string }[]) {
    if (this.state.phase !== 'combat' || this.state.step !== 'declare_blockers') throw new Error("Not Declare Blockers step.");
    if (this.state.activePlayerId === playerId) throw new Error("Active Player cannot declare blockers.");

    // Safe handling if blockers is undefined
    const declaredBlockers = blockers || [];
    declaredBlockers.forEach(({ blockerId, attackerId }) => {
      const blocker = this.state.cards[blockerId];
      const attacker = this.state.cards[attackerId];

      if (!blocker || blocker.controllerId !== playerId || blocker.zone !== 'battlefield') throw new Error(`Invalid blocker ${blockerId}`);
      if (blocker.tapped) throw new Error(`${blocker.name} is tapped.`);

      if (!attacker || !attacker.attacking) throw new Error(`Invalid attacker target ${attackerId}`);

      if (!blocker.blocking) blocker.blocking = [];
      blocker.blocking.push(attackerId);

      // Note: 509.2. Damage Assignment Order (if multiple blockers)
    });

    console.log(`Player ${playerId} declared ${declaredBlockers.length} blockers.`);

    this.state.blockersDeclared = true; // Fix: Ensure state reflects blockers were declared

    // Priority goes to Active Player first after blockers declared
    this.resetPriority(this.state.activePlayerId);
  }

  public resolveMulligan(playerId: string, keep: boolean, cardsToBottom: string[] = []) {
    if (this.state.step !== 'mulligan') throw new Error("Not mulligan step");

    const player = this.state.players[playerId];
    if (player.handKept) throw new Error("Already kept hand");

    if (keep) {
      // Validate Cards to Bottom
      // London Mulligan: Draw 7, put X on bottom. X = mulliganCount.
      const currentMulls = player.mulliganCount || 0;
      if (cardsToBottom.length !== currentMulls) {
        throw new Error(`Must put ${currentMulls} cards to bottom.`);
      }

      // Move cards to library bottom
      cardsToBottom.forEach(cid => {
        const c = this.state.cards[cid];
        if (c && c.ownerId === playerId && c.zone === 'hand') {
          // Move to library
          // We don't have explicit "bottom", just library? 
          // In random fetch, it doesn't matter. But strictly...
          // Let's just put them in 'library' zone.
          this.moveCardToZone(cid, 'library');
        }
      });

      player.handKept = true;
      console.log(`Player ${playerId} kept hand with ${cardsToBottom.length} on bottom.`);

      // Trigger check
      this.performTurnBasedActions();

    } else {
      // Take Mulligan
      // 1. Hand -> Library
      const hand = Object.values(this.state.cards).filter(c => c.ownerId === playerId && c.zone === 'hand');
      hand.forEach(c => this.moveCardToZone(c.instanceId, 'library'));

      // 2. Shuffle (noop here as library is bag)

      // 3. Draw 7
      for (let i = 0; i < 7; i++) {
        this.drawCard(playerId);
      }

      // 4. Increment count
      player.mulliganCount = (player.mulliganCount || 0) + 1;

      console.log(`Player ${playerId} took mulligan. Count: ${player.mulliganCount}`);
      // Wait for next decision
    }
  }

  public createToken(playerId: string, definition: {
    name: string,
    colors: string[],
    types: string[],
    subtypes: string[],
    power: number,
    toughness: number,
    keywords?: string[],
    imageUrl?: string
  }) {
    const token: any = { // Using any allowing partial CardObject construction
      instanceId: Math.random().toString(36).substring(7),
      oracleId: 'token-' + Math.random(),
      name: definition.name,
      controllerId: playerId,
      ownerId: playerId,
      zone: 'battlefield',
      tapped: false,
      faceDown: false,
      counters: [],
      keywords: definition.keywords || [],
      modifiers: [],
      colors: definition.colors,
      types: definition.types,
      subtypes: definition.subtypes,
      supertypes: [], // e.g. Legendary?
      basePower: definition.power,
      baseToughness: definition.toughness,
      power: definition.power, // Will be recalc-ed by layers
      toughness: definition.toughness,
      imageUrl: definition.imageUrl || '',
      damageMarked: 0,
      controlledSinceTurn: this.state.turnCount,
      position: { x: Math.random() * 80, y: Math.random() * 80, z: ++this.state.maxZ }
    };

    // Type-safe assignment
    this.state.cards[token.instanceId] = token;

    // Recalculate layers immediately
    this.recalculateLayers();

    console.log(`Created token ${definition.name} for ${playerId}`);
  }

  // --- Core State Machine ---

  private passPriorityToNext() {
    const currentIndex = this.state.turnOrder.indexOf(this.state.priorityPlayerId);
    const nextIndex = (currentIndex + 1) % this.state.turnOrder.length;
    this.state.priorityPlayerId = this.state.turnOrder[nextIndex];
  }

  private moveCardToZone(cardId: string, toZone: any, faceDown = false, position?: { x: number, y: number }) {
    const card = this.state.cards[cardId];
    if (card) {

      if (toZone === 'battlefield' && card.zone !== 'battlefield') {
        card.controlledSinceTurn = this.state.turnCount;
      }

      card.zone = toZone;
      card.faceDown = faceDown;
      card.tapped = false; // Reset tap usually on zone change (except battlefield->battlefield)

      if (position) {
        card.position = { ...position, z: ++this.state.maxZ };
      } else {
        // Reset X position?
        card.position = { x: 0, y: 0, z: ++this.state.maxZ };
      }
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
          this.moveCardToZone(card.instanceId, 'battlefield', false, item.resolutionPosition);
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
      setup: ['mulligan'],
      beginning: ['untap', 'upkeep', 'draw'],
      main1: ['main'],
      combat: ['beginning_combat', 'declare_attackers', 'declare_blockers', 'combat_damage', 'end_combat'],
      main2: ['main'],
      ending: ['end', 'cleanup']
    };

    const phaseOrder: Phase[] = ['setup', 'beginning', 'main1', 'combat', 'main2', 'ending'];

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

    // SKIP Logic for Combat
    // 508.8. If no creatures are declared as attackers... skip declare blockers/combat damage steps.
    if (this.state.phase === 'combat') {
      const attackers = Object.values(this.state.cards).filter(c => !!c.attacking);

      // If we are about to enter declare_blockers or combat_damage and NO attackers exist
      // Note: We check 'attacking' status. If we just finished declare_attackers, we might have reset it? 
      // No, 'attacking' property persists until end of combat.

      if (nextStep === 'declare_blockers' && attackers.length === 0) {
        console.log("No attackers. Skipping directly to End of Combat.");
        nextStep = 'end_combat';
      }
    }

    // Rule 500.4: Mana empties at end of each step and phase
    this.emptyManaPools();

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
    const { step, activePlayerId } = this.state;

    // 0. Mulligan Step
    if (step === 'mulligan') {
      const total = Object.keys(this.state.players).length;
      const kept = Object.values(this.state.players).filter(p => p.handKept).length;
      console.log(`[RulesEngine] Performing Mulligan TBA. Kept: ${kept}/${total}`);

      // Draw 7 for everyone if they have 0 cards in hand and haven't kept
      Object.values(this.state.players).forEach(p => {
        const hand = Object.values(this.state.cards).filter(c => c.ownerId === p.id && c.zone === 'hand');
        if (hand.length === 0 && !p.handKept) {
          console.log(`[RulesEngine] Initial Draw 7 for ${p.name}`);
          // Initial Draw
          for (let i = 0; i < 7; i++) {
            this.drawCard(p.id);
          }
        }
      });
      // Check if all kept
      const allKept = Object.values(this.state.players).every(p => p.handKept);
      if (allKept) {
        console.log("[RulesEngine] All players kept hand. Advancing Step.");
        // Normally untap is automatic?
        // advanceStep will go to beginning/untap
        this.advanceStep();
      } else {
        console.log("[RulesEngine] Waiting for more mulligan decisions.");
      }
      return; // Wait for actions
    }

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
      const player = this.state.players[activePlayerId];
      if (this.state.turnCount > 1 || this.state.turnOrder.length > 2) {
        // If Bot: Auto Draw
        if (player && player.isBot) {
          console.log(`[Auto] Bot ${player.name} drawing card.`);
          this.drawCard(activePlayerId);
          // After draw, AP priority
          this.resetPriority(activePlayerId);
        } else {
          // If Human: Wait for Manual Action
          console.log(`[Manual] Waiting for Human ${player?.name} to draw.`);
          // We do NOT call drawCard here.
          // We DO reset priority to them so they can take the action?
          // Actually, if we are in 'draw' step, strict rules say AP gets priority.
          // Yet, the "Turn Based Action" of drawing usually happens *immediately* at start of step, BEFORE priority.
          // 504.1. First, the active player draws a card. This turn-based action doesn't use the stack.
          // 504.2. Second, the active player gets priority.
          // So for "Manual" feeling, we pause BEFORE 504.1 is considered "done"?
          // Effectively, we treat the "DRAW_CARD" action as the completion of 504.1.

          // Ensure they are the priority player so the UI lets them act (if we key off priority)
          // But strict action validation for DRAW_CARD will check if they are AP and in Draw step.
          if (this.state.priorityPlayerId !== activePlayerId) {
            this.state.priorityPlayerId = activePlayerId;
          }
        }
      } else {
        // Skip draw (Turn 1 in 2p game)
        console.log("Skipping Draw (Turn 1 2P).");
        this.resetPriority(activePlayerId);
      }
      return;
    }

    // 3. Cleanup Step
    if (step === 'cleanup') {
      this.cleanupStep(activePlayerId);
      // Usually no priority in cleanup, unless triggers.
      // Assume auto-pass turn to next Untap.
      this.advanceTurn();
      return;
    }

    // 4. Combat Steps requiring declaration (Pause for External Action)
    if (step === 'declare_attackers') {
      // WAITING for declareAttackers() from Client
      // 508.1. Active Player gets priority to declare attackers.
      // Unlike other steps where AP gets priority to cast spells, here the "Action" determines the flow.
      // But technically, the AP *must* act. So we ensure they have priority.
      if (this.state.priorityPlayerId !== activePlayerId) {
        this.resetPriority(activePlayerId);
      }
      return;
    }

    if (step === 'declare_blockers') {
      // WAITING for declareBlockers() from Client (Defending Player)
      // 509.1. Defending Player gets priority to declare blockers.
      // In 1v1, this is the non-active player.
      const defendingPlayerId = this.state.turnOrder.find(id => id !== activePlayerId);
      if (defendingPlayerId) {
        if (this.state.priorityPlayerId !== defendingPlayerId) {
          this.resetPriority(defendingPlayerId);
        }
      }
      return;
    }

    // 5. Combat Damage Step
    if (step === 'combat_damage') {
      this.resolveCombatDamage();
      this.resetPriority(activePlayerId);
      return;
    }

    // Default: Reset priority to AP to start the step
    this.resetPriority(activePlayerId);

    // Empty Mana Pools at end of steps?
    // Actually, mana empties at the END of steps/phases.
    // Since we are STARTING a step here, we should have emptied prev step mana before transition.
    // Let's do it in advanceStep() immediately before changing steps.
  }

  // --- Combat Logic ---

  // --- Combat Logic ---


  private resolveCombatDamage() {
    console.log("Resolving Combat Damage...");
    const attackers = Object.values(this.state.cards).filter(c => !!c.attacking);

    for (const attacker of attackers) {
      const blockers = Object.values(this.state.cards).filter(c => c.blocking?.includes(attacker.instanceId));

      // 1. Assign Damage
      if (blockers.length > 0) {
        // Blocked
        // Logically: Attacker deals damage to blockers, Blockers deal damage to attacker.
        // Simple: 1v1 blocking
        const blocker = blockers[0];

        // Attacker -> Blocker
        console.log(`${attacker.name} deals ${attacker.power} damage to ${blocker.name}`);
        blocker.damageMarked = (blocker.damageMarked || 0) + attacker.power;

        // Blocker -> Attacker
        console.log(`${blocker.name} deals ${blocker.power} damage to ${attacker.name}`);
        attacker.damageMarked = (attacker.damageMarked || 0) + blocker.power;

      } else {
        // Unblocked -> Player/PW
        const targetId = attacker.attacking!;
        const targetPlayer = this.state.players[targetId];
        if (targetPlayer) {
          console.log(`${attacker.name} deals ${attacker.power} damage to Player ${targetPlayer.name}`);
          targetPlayer.life -= attacker.power;
        }
      }
    }
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

  public drawCard(playerId: string) {
    const library = Object.values(this.state.cards).filter(c => c.ownerId === playerId && c.zone === 'library');
    if (library.length > 0) {
      // Draw top card (random for now if not ordered?)
      // Assuming library is shuffled, pick random
      const card = library[Math.floor(Math.random() * library.length)];
      this.moveCardToZone(card.instanceId, 'hand');
      console.log(`Player ${playerId} draws ${card.name}`);
    } else {
      // Empty library loss?
      // Empty library loss?
      console.warn(`[RulesEngine] Player ${playerId} attempts to draw from empty library. (Deck size: 0)`);
    }
  }

  private cleanupStep(_playerId: string) {
    // Remove damage, discard down to 7
    console.log(`Cleanup execution.`);
    Object.values(this.state.cards).forEach(c => {
      c.damageMarked = 0;
      if (c.modifiers) {
        c.modifiers = c.modifiers.filter(m => !m.untilEndOfTurn);
      }
    });

    this.state.attackersDeclared = false;
    this.state.blockersDeclared = false;
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
      if (c.damageMarked >= c.toughness && !c.supertypes.includes('Indestructible')) {
        console.log(`SBA: ${c.name} destroyed (Lethal Damage: ${c.damageMarked}/${c.toughness}).`);
        c.zone = 'graveyard';
        sbaPerformed = true;
      }
    }

    // 3. Legend Rule (704.5j)
    // Map<Controller, Map<Name, Count>>
    // For now, simplify: Auto-keep oldest? Or newest? 
    // Rules say "choose one", so we can't automate strictly without pausing.
    // Let's implement auto-graveyard oldest duplicate for now to avoid stuck state.

    // 4. Aura Validity (704.5n)
    Object.values(cards).forEach(c => {
      if (c.zone === 'battlefield' && c.types.includes('Enchantment') && c.subtypes.includes('Aura')) {
        // If not attached to anything, or attached to invalid thing (not checking validity yet, just existence)
        if (!c.attachedTo) {
          console.log(`SBA: ${c.name} (Aura) unattached. Destroyed.`);
          c.zone = 'graveyard';
          sbaPerformed = true;
        } else {
          const target = cards[c.attachedTo];
          // If target is gone or no longer on battlefield
          if (!target || target.zone !== 'battlefield') {
            console.log(`SBA: ${c.name} (Aura) target invalid. Destroyed.`);
            c.zone = 'graveyard';
            sbaPerformed = true;
          }
        }
      }
    });

    return sbaPerformed;
  }


  // This method encapsulates the SBA loop and recalculation of layers
  private processStateBasedActions() {
    this.recalculateLayers();

    let loops = 0;
    while (this.checkStateBasedActions()) {
      loops++;
      if (loops > 100) {
        console.error("Infinite SBA Loop Detected");
        break;
      }
      this.recalculateLayers();
    }
  }

  public resetPriority(playerId: string) {
    this.processStateBasedActions();

    this.state.priorityPlayerId = playerId;
    this.state.passedPriorityCount = 0;
    Object.values(this.state.players).forEach(p => p.hasPassed = false);
  }



  private emptyManaPools() {
    Object.values(this.state.players).forEach(p => {
      if (p.manaPool) {
        p.manaPool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
      }
    });
  }

  private recalculateLayers() {
    // Basic Layer System Implementation (7. Interaction of Continuous Effects)
    Object.values(this.state.cards).forEach(card => {
      // Only process battlefield
      if (card.zone !== 'battlefield') {
        card.power = card.basePower;
        card.toughness = card.baseToughness;
        return;
      }

      // Layer 7a: Characteristic-Defining Abilities (CDA) - skipped for now
      let p = card.basePower;
      let t = card.baseToughness;

      // Layer 7b: Effects that set power and/or toughness to a specific number
      // e.g. "Become 0/1"
      if (card.modifiers) {
        card.modifiers.filter(m => m.type === 'set_pt').forEach(mod => {
          if (mod.value.power !== undefined) p = mod.value.power;
          if (mod.value.toughness !== undefined) t = mod.value.toughness;
        });
      }

      // Layer 7c: Effects that modify power and/or toughness (+X/+Y)
      // e.g. Giant Growth, Anthems
      if (card.modifiers) {
        card.modifiers.filter(m => m.type === 'pt_boost').forEach(mod => {
          p += (mod.value.power || 0);
          t += (mod.value.toughness || 0);
        });
      }

      // Layer 7d: Counters (+1/+1, -1/-1)
      if (card.counters) {
        card.counters.forEach(c => {
          if (c.type === '+1/+1') {
            p += c.count;
            t += c.count;
          } else if (c.type === '-1/-1') {
            p -= c.count;
            t -= c.count;
          }
        });
      }

      // Layer 7e: Switch Power/Toughness - skipped for now

      // Final Floor rule: T cannot be less than 0 for logic? No, T can be negative for calculation, but usually treated as 0 for damage?
      // Actually CR says negative numbers are real in calculation, but treated as 0 for dealing damage.
      // We store true values.

      card.power = p;
      card.toughness = t;
    });
  }

}
