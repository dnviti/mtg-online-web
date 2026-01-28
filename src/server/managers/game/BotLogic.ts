import { StrictGameState, CardObject, ChoiceResult } from '../../game/types';
import { RulesEngine } from '../../game/RulesEngine';
import { ManaUtils } from '../../game/engine/ManaUtils';
import { ChoiceHandler } from '../../game/engine/ChoiceHandler';
import { OracleEffectResolver } from '../../game/engine/OracleEffectResolver';
import { DebugManager } from '../../game/engine/DebugManager';

/**
 * BotLogic
 *
 * Implements AI behavior for automated players.
 * Bots can play lands, cast spells, activate abilities, declare attacks/blocks, and pass priority.
 * Uses heuristic evaluation to make decisions similar to a human player.
 */
export class BotLogic {

  // Maximum iterations to prevent infinite loops
  private static MAX_ITERATIONS = 50;

  // Track spells cast this action loop to avoid infinite casting
  private static spellsCastThisLoop: Set<string> = new Set();

  /**
   * Processes bot actions in a loop until a human player has priority.
   * Returns true if any action was taken.
   * If debug mode is enabled, the loop will pause after each action for debugging.
   */
  static processActionsLoop(game: StrictGameState): boolean {
    let iterations = 0;
    let actionTaken = false;
    this.spellsCastThisLoop.clear();

    // Clear any stale pending action (in case we're resuming after debug continue)
    if (this.pendingBotAction && this.pendingBotAction.gameId === game.roomId) {
      this.pendingBotAction = null;
    }

    while (iterations < this.MAX_ITERATIONS) {
      iterations++;

      // Stop if debug mode is paused (waiting for continue signal)
      if (DebugManager.isPaused(game.roomId)) {
        console.log(`[BotLogic] Debug mode paused - stopping bot loop`);
        break;
      }

      const priorityPlayer = game.players[game.priorityPlayerId];

      // Stop if human has priority
      if (!priorityPlayer?.isBot) {
        break;
      }

      // Process single action
      const result = this.processSingleAction(game);
      if (result) {
        actionTaken = true;
      }

      // Safety: if no action was taken, break to avoid stuck loops
      if (!result) {
        break;
      }
    }

    if (iterations >= this.MAX_ITERATIONS) {
      console.warn(`[BotLogic] ⚠️ Max iterations reached (${this.MAX_ITERATIONS})`);
    }

    return actionTaken;
  }

  /**
   * Helper to check if an action should pause for debug mode.
   * Returns the pause event if paused, null otherwise.
   */
  private static checkDebugPause(game: StrictGameState, action: any, actorId: string): import('../../game/types/debug').DebugPauseEvent | null {
    if (!DebugManager.isEnabled(game.roomId)) return null;
    return DebugManager.createSnapshot(game, action, actorId);
  }

  /**
   * Stores the pending bot action for later execution after debug continue.
   */
  static pendingBotAction: { gameId: string; action: any; actorId: string } | null = null;

  /**
   * Executes a bot action after debug continue signal.
   */
  static executePendingBotAction(game: StrictGameState): boolean {
    if (!this.pendingBotAction || this.pendingBotAction.gameId !== game.roomId) {
      return false;
    }

    const { action, actorId } = this.pendingBotAction;
    this.pendingBotAction = null;

    const engine = new RulesEngine(game);
    const normalizedType = action.type.toLowerCase();

    try {
      switch (normalizedType) {
        case 'play_land':
          engine.playLand(actorId, action.cardId);
          break;
        case 'cast_spell':
          engine.castSpell(actorId, action.cardId, action.targets);
          break;
        case 'declare_attackers':
          engine.declareAttackers(actorId, action.attackers);
          break;
        case 'declare_blockers':
          engine.declareBlockers(actorId, action.blockers);
          break;
        case 'mulligan_decision':
          engine.resolveMulligan(actorId, action.keep);
          break;
        case 'pass_priority':
          engine.passPriority(actorId);
          break;
        default:
          console.warn(`[BotLogic] Unknown pending action type: ${normalizedType}`);
          return false;
      }
      return true;
    } catch (e) {
      console.error(`[BotLogic] Error executing pending bot action:`, e);
      return false;
    }
  }

  /**
   * Evaluates the game state and performs a single action for the current priority bot.
   * Returns true if an action was taken.
   * In debug mode, may pause and store the action for later execution.
   */
  static processSingleAction(game: StrictGameState): boolean {
    // 0a. Handle pending choice for bot
    if (game.pendingChoice) {
      const chooser = game.players[game.pendingChoice.choosingPlayerId];
      if (chooser?.isBot) {
        return this.handleBotChoice(game);
      }
      // Waiting for human to make choice
      return false;
    }

    // 0b. Mulligan Phase - all bots keep immediately
    if (game.step === 'mulligan') {
      let actionTaken = false;
      for (const p of Object.values(game.players)) {
        if (p.isBot && !p.handKept) {
          const action = { type: 'MULLIGAN_DECISION', keep: true };

          // Check for debug pause
          const pauseEvent = this.checkDebugPause(game, action, p.id);
          if (pauseEvent) {
            this.pendingBotAction = { gameId: game.roomId, action, actorId: p.id };
            console.log(`[BotLogic] Debug pause for bot mulligan: ${p.name}`);
            return false; // Paused, no action taken yet
          }

          console.log(`[Bot] ${p.name} keeps hand.`);
          new RulesEngine(game).resolveMulligan(p.id, true);
          actionTaken = true;
        }
      }
      return actionTaken;
    }

    const priorityPlayerId = game.priorityPlayerId;
    const player = game.players[priorityPlayerId];

    if (!player || !player.isBot) return false;

    const engine = new RulesEngine(game);
    const isOurTurn = game.activePlayerId === player.id;

    // 1. Draw step - bot draws automatically (no debug pause for draw)
    if (game.step === 'draw' && isOurTurn) {
      if (game.turnCount > 1 || game.turnOrder.length > 2) {
        console.log(`[Bot] ${player.name} draws a card.`);
        engine.drawCard(player.id);
      }
      engine.passPriority(player.id);
      return true;
    }

    // 2. Play Land (main phases only, prioritize this first)
    if ((game.phase === 'main1' || game.phase === 'main2') && game.landsPlayedThisTurn === 0 && isOurTurn) {
      const land = this.chooseBestLandToPlay(game, player.id);
      if (land) {
        const action = { type: 'PLAY_LAND', cardId: land.instanceId };

        // Check for debug pause
        const pauseEvent = this.checkDebugPause(game, action, player.id);
        if (pauseEvent) {
          this.pendingBotAction = { gameId: game.roomId, action, actorId: player.id };
          console.log(`[BotLogic] Debug pause for bot land: ${land.name}`);
          return false;
        }

        console.log(`[Bot] ${player.name} plays land: ${land.name}`);
        engine.playLand(player.id, land.instanceId);
        return true;
      }
    }

    // 3. Main Phase Actions (cast spells, only on our turn with empty stack for sorcery-speed)
    if ((game.phase === 'main1' || game.phase === 'main2') && isOurTurn && game.stack.length === 0) {
      const spellAction = this.chooseSorcerySpeedAction(game, player.id, engine);
      if (spellAction) {
        return true;
      }
    }

    // 4. Instant-speed responses (can be done anytime we have priority)
    if (game.stack.length > 0 || !isOurTurn) {
      const instantAction = this.chooseInstantSpeedAction(game, player.id, engine);
      if (instantAction) {
        return true;
      }
    }

    // 5. Declare Attackers
    if (game.phase === 'combat' && game.step === 'declare_attackers' && isOurTurn && !game.attackersDeclared) {
      const attackers = this.chooseAttackers(game, player.id);
      const action = { type: 'DECLARE_ATTACKERS', attackers };

      // Check for debug pause
      const pauseEvent = this.checkDebugPause(game, action, player.id);
      if (pauseEvent) {
        this.pendingBotAction = { gameId: game.roomId, action, actorId: player.id };
        console.log(`[BotLogic] Debug pause for bot attackers`);
        return false;
      }

      console.log(`[Bot] ${player.name} declares ${attackers.length} attacker(s)`);
      engine.declareAttackers(player.id, attackers);
      return true;
    }

    // 6. Declare Blockers
    if (game.phase === 'combat' && game.step === 'declare_blockers' && !isOurTurn && !game.blockersDeclared) {
      const blockers = this.chooseBlockers(game, player.id);
      const action = { type: 'DECLARE_BLOCKERS', blockers };

      // Check for debug pause
      const pauseEvent = this.checkDebugPause(game, action, player.id);
      if (pauseEvent) {
        this.pendingBotAction = { gameId: game.roomId, action, actorId: player.id };
        console.log(`[BotLogic] Debug pause for bot blockers`);
        return false;
      }

      console.log(`[Bot] ${player.name} declares ${blockers.length} blocker(s)`);
      engine.declareBlockers(player.id, blockers);
      return true;
    }

    // 7. Default: Pass Priority (no debug pause for pass)
    console.log(`[Bot] ${player.name} passes priority (Phase: ${game.phase}, Step: ${game.step})`);
    engine.passPriority(player.id);
    return true;
  }

  // ============================================
  // MANA EVALUATION HELPERS
  // ============================================

  /**
   * Calculates total available mana (pool + untapped lands)
   */
  static getAvailableMana(game: StrictGameState, playerId: string): { total: number, colors: Record<string, number> } {
    const player = game.players[playerId];
    const pool = { ...player.manaPool };

    // Count untapped lands
    const untappedLands = Object.values(game.cards).filter(c =>
      c.controllerId === playerId &&
      c.zone === 'battlefield' &&
      !c.tapped &&
      (c.types?.includes('Land') || c.typeLine?.includes('Land'))
    );

    // Add mana from untapped lands
    for (const land of untappedLands) {
      const colors = ManaUtils.getAvailableManaColors(land);
      if (colors.length > 0) {
        // For simplicity, count each land as 1 mana of its first color
        // More sophisticated would track all options
        for (const color of colors) {
          pool[color] = (pool[color] || 0) + 1;
          break; // Count each land once
        }
      }
    }

    const total = Object.values(pool).reduce((sum, val) => sum + val, 0);
    return { total, colors: pool };
  }

  /**
   * Checks if a card's mana cost can be paid
   */
  static canAfford(game: StrictGameState, playerId: string, card: CardObject): boolean {
    const manaCost = card.manaCost || card.definition?.mana_cost;
    if (!manaCost) return true; // No cost = free

    try {
      const cost = ManaUtils.parseManaCost(manaCost);
      const available = this.getAvailableMana(game, playerId);

      // Check colored requirements
      for (const color of ['W', 'U', 'B', 'R', 'G', 'C']) {
        if ((cost.colors[color] || 0) > (available.colors[color] || 0)) {
          return false;
        }
      }

      // Check total mana (generic + colored)
      const totalCost = cost.generic + Object.values(cost.colors).reduce((a, b) => a + b, 0);
      if (totalCost > available.total) {
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Gets the converted mana cost of a card
   */
  static getManaCost(card: CardObject): number {
    const manaCost = card.manaCost || card.definition?.mana_cost;
    if (!manaCost) return 0;

    const cost = ManaUtils.parseManaCost(manaCost);
    return cost.generic + Object.values(cost.colors).reduce((a, b) => a + b, 0);
  }

  // ============================================
  // CARD EVALUATION & SCORING
  // ============================================

  /**
   * Scores a card for casting priority (higher = more desirable to cast)
   */
  static scoreCard(game: StrictGameState, playerId: string, card: CardObject): number {
    let score = 0;
    const types = card.types || [];
    const typeLine = card.typeLine || card.definition?.type_line || '';
    const oracleText = (card.oracleText || card.definition?.oracle_text || '').toLowerCase();
    const keywords = card.keywords || card.definition?.keywords || [];

    // Base score by card type
    if (types.includes('Creature') || typeLine.includes('Creature')) {
      // Creatures: score based on stats
      const power = card.power || card.basePower || 0;
      const toughness = card.toughness || card.baseToughness || 0;
      score = (power * 2) + toughness;

      // Bonus for evasion
      if (keywords.includes('Flying') || oracleText.includes('flying')) score += 3;
      if (keywords.includes('Trample') || oracleText.includes('trample')) score += 2;
      if (keywords.includes('Lifelink') || oracleText.includes('lifelink')) score += 2;
      if (keywords.includes('Deathtouch') || oracleText.includes('deathtouch')) score += 3;
      if (keywords.includes('Haste') || oracleText.includes('haste')) score += 2;
      if (oracleText.includes("can't be blocked")) score += 4;

      // ETB effects are valuable
      if (oracleText.includes('enters the battlefield') || oracleText.includes('enters')) {
        score += 3;
      }
    } else if (types.includes('Instant') || typeLine.includes('Instant')) {
      // Instants: evaluate by effect
      score = this.scoreSpellEffect(oracleText, game, playerId);
    } else if (types.includes('Sorcery') || typeLine.includes('Sorcery')) {
      // Sorceries: evaluate by effect
      score = this.scoreSpellEffect(oracleText, game, playerId);
    } else if (types.includes('Enchantment') || typeLine.includes('Enchantment')) {
      score = 5; // Base enchantment value
      if (oracleText.includes('draw')) score += 3;
      if (oracleText.includes('destroy')) score += 4;
    } else if (types.includes('Artifact') || typeLine.includes('Artifact')) {
      score = 4; // Base artifact value
      if (oracleText.includes('mana')) score += 3;
    } else if (types.includes('Planeswalker') || typeLine.includes('Planeswalker')) {
      score = 15; // Planeswalkers are high value
    }

    // Penalize higher costs slightly (prefer efficient plays)
    const cmc = this.getManaCost(card);
    score -= cmc * 0.5;

    return score;
  }

  /**
   * Scores spell effects based on oracle text
   */
  static scoreSpellEffect(oracleText: string, game: StrictGameState, playerId: string): number {
    let score = 3; // Base spell value

    // Removal is high priority
    if (oracleText.includes('destroy target') || oracleText.includes('exile target')) {
      score += 8;
      // Even higher if opponent has threatening creatures
      const opponentThreats = this.countOpponentThreats(game, playerId);
      if (opponentThreats > 0) score += 3;
    }

    // Damage spells
    if (oracleText.includes('deals') && oracleText.includes('damage')) {
      score += 5;
      // Check if opponent has low life
      const opponent = this.getOpponent(game, playerId);
      if (opponent && opponent.life <= 10) score += 3;
    }

    // Card draw is valuable
    if (oracleText.includes('draw') && oracleText.includes('card')) {
      score += 4;
    }

    // Board wipes
    if (oracleText.includes('destroy all') || oracleText.includes('exile all')) {
      // Only valuable if opponent has more creatures
      const ourCreatures = this.countCreatures(game, playerId);
      const oppCreatures = this.countOpponentThreats(game, playerId);
      if (oppCreatures > ourCreatures + 1) {
        score += 10;
      } else {
        score -= 5; // Don't wipe if we're ahead
      }
    }

    // Pump spells during combat
    if ((oracleText.includes('+') && oracleText.includes('/')) || oracleText.includes('gets +')) {
      if (game.phase === 'combat') score += 4;
    }

    // Counter spells (only relevant if something on stack)
    if (oracleText.includes('counter target')) {
      if (game.stack.length > 0) score += 8;
      else score = 0; // Useless with empty stack
    }

    return score;
  }

  /**
   * Counts opponent's threatening creatures on battlefield
   */
  static countOpponentThreats(game: StrictGameState, playerId: string): number {
    return Object.values(game.cards).filter(c =>
      c.controllerId !== playerId &&
      c.zone === 'battlefield' &&
      (c.types?.includes('Creature') || c.typeLine?.includes('Creature'))
    ).length;
  }

  /**
   * Counts our creatures on battlefield
   */
  static countCreatures(game: StrictGameState, playerId: string): number {
    return Object.values(game.cards).filter(c =>
      c.controllerId === playerId &&
      c.zone === 'battlefield' &&
      (c.types?.includes('Creature') || c.typeLine?.includes('Creature'))
    ).length;
  }

  /**
   * Gets opponent player
   */
  static getOpponent(game: StrictGameState, playerId: string) {
    const oppId = game.turnOrder.find(id => id !== playerId);
    return oppId ? game.players[oppId] : null;
  }

  // ============================================
  // LAND SELECTION
  // ============================================

  /**
   * Chooses the best land to play based on mana needs
   */
  static chooseBestLandToPlay(game: StrictGameState, playerId: string): CardObject | null {
    const lands = Object.values(game.cards).filter(c =>
      c.zone === 'hand' &&
      c.controllerId === playerId &&
      (c.types?.includes('Land') || c.typeLine?.includes('Land'))
    );

    if (lands.length === 0) return null;

    // Analyze what colors we need based on cards in hand
    const neededColors = this.analyzeNeededColors(game, playerId);

    // Score each land based on how well it meets our needs
    let bestLand: CardObject | null = null;
    let bestScore = -1;

    for (const land of lands) {
      const colors = ManaUtils.getAvailableManaColors(land);
      let score = 0;

      for (const color of colors) {
        if (neededColors.has(color)) {
          score += 2;
        } else {
          score += 1; // Still useful even if not immediately needed
        }
      }

      // Prefer lands that produce multiple colors
      if (colors.length > 1) score += 1;

      if (score > bestScore) {
        bestScore = score;
        bestLand = land;
      }
    }

    return bestLand || lands[0];
  }

  /**
   * Analyzes what mana colors we need based on cards in hand
   */
  static analyzeNeededColors(game: StrictGameState, playerId: string): Set<string> {
    const needed = new Set<string>();

    const handCards = Object.values(game.cards).filter(c =>
      c.zone === 'hand' &&
      c.controllerId === playerId &&
      !(c.types?.includes('Land') || c.typeLine?.includes('Land'))
    );

    for (const card of handCards) {
      const manaCost = card.manaCost || card.definition?.mana_cost;
      if (manaCost) {
        const cost = ManaUtils.parseManaCost(manaCost);
        for (const color of ['W', 'U', 'B', 'R', 'G', 'C']) {
          if (cost.colors[color] > 0) {
            needed.add(color);
          }
        }
      }
    }

    return needed;
  }

  // ============================================
  // SPELL CASTING LOGIC
  // ============================================

  /**
   * Chooses and executes a sorcery-speed action (creatures, sorceries, etc.)
   */
  static chooseSorcerySpeedAction(game: StrictGameState, playerId: string, engine: RulesEngine): boolean {
    const player = game.players[playerId];

    // Get all castable cards from hand (non-instant, non-land)
    const castableCards = Object.values(game.cards).filter(c => {
      if (c.zone !== 'hand' || c.controllerId !== playerId) return false;
      if (this.spellsCastThisLoop.has(c.instanceId)) return false;

      const types = c.types || [];
      const typeLine = c.typeLine || c.definition?.type_line || '';

      // Skip lands
      if (types.includes('Land') || typeLine.includes('Land')) return false;

      // Skip instants (handled separately)
      const isInstant = types.includes('Instant') || typeLine.includes('Instant');
      if (isInstant) return false;

      // Check if we can afford it
      return this.canAfford(game, playerId, c);
    });

    if (castableCards.length === 0) return false;

    // Score and sort by priority
    const scored = castableCards.map(card => ({
      card,
      score: this.scoreCard(game, playerId, card)
    })).sort((a, b) => b.score - a.score);

    // Try to cast the highest scored card
    for (const { card, score } of scored) {
      if (score <= 0) continue; // Skip low-value plays

      const typeLine = card.typeLine || card.definition?.type_line || '';
      const isAura = typeLine.toLowerCase().includes('aura');

      try {
        let targets: string[] = [];

        // Handle targeting
        if (isAura) {
          targets = this.chooseAuraTarget(game, playerId, card);
          if (targets.length === 0) continue; // No valid target
        } else if (this.requiresTarget(card)) {
          targets = this.chooseSpellTargets(game, playerId, card);
          if (targets.length === 0) continue; // No valid target
        }

        const action = { type: 'CAST_SPELL', cardId: card.instanceId, targets };

        // Check for debug pause
        const pauseEvent = this.checkDebugPause(game, action, playerId);
        if (pauseEvent) {
          this.pendingBotAction = { gameId: game.roomId, action, actorId: playerId };
          console.log(`[BotLogic] Debug pause for bot spell: ${card.name}`);
          return false; // Paused, return false to stop loop
        }

        console.log(`[Bot] ${player.name} casts ${card.name} (score: ${score.toFixed(1)})`);
        engine.castSpell(playerId, card.instanceId, targets);
        this.spellsCastThisLoop.add(card.instanceId);
        return true;
      } catch (error) {
        console.log(`[Bot] Failed to cast ${card.name}: ${error}`);
        continue;
      }
    }

    return false;
  }

  /**
   * Chooses and executes an instant-speed action
   */
  static chooseInstantSpeedAction(game: StrictGameState, playerId: string, engine: RulesEngine): boolean {
    const player = game.players[playerId];

    // Get all instant-speed cards
    const instants = Object.values(game.cards).filter(c => {
      if (c.zone !== 'hand' || c.controllerId !== playerId) return false;
      if (this.spellsCastThisLoop.has(c.instanceId)) return false;

      const types = c.types || [];
      const typeLine = c.typeLine || c.definition?.type_line || '';
      const keywords = c.keywords || c.definition?.keywords || [];
      const oracleText = (c.oracleText || c.definition?.oracle_text || '').toLowerCase();

      const isInstant = types.includes('Instant') || typeLine.includes('Instant');
      const hasFlash = keywords.some((k: string) => k.toLowerCase() === 'flash') || oracleText.includes('flash');

      if (!isInstant && !hasFlash) return false;

      return this.canAfford(game, playerId, c);
    });

    if (instants.length === 0) return false;

    // Evaluate if we should cast anything
    const shouldRespond = this.shouldRespondInstant(game, playerId);
    if (!shouldRespond) return false;

    // Score instants based on current situation
    const scored = instants.map(card => ({
      card,
      score: this.scoreInstant(game, playerId, card)
    })).filter(s => s.score > 0).sort((a, b) => b.score - a.score);

    for (const { card, score } of scored) {
      try {
        const targets = this.chooseSpellTargets(game, playerId, card);
        if (this.requiresTarget(card) && targets.length === 0) continue;

        const action = { type: 'CAST_SPELL', cardId: card.instanceId, targets };

        // Check for debug pause
        const pauseEvent = this.checkDebugPause(game, action, playerId);
        if (pauseEvent) {
          this.pendingBotAction = { gameId: game.roomId, action, actorId: playerId };
          console.log(`[BotLogic] Debug pause for bot instant: ${card.name}`);
          return false; // Paused, return false to stop loop
        }

        console.log(`[Bot] ${player.name} casts instant ${card.name} (score: ${score.toFixed(1)})`);
        engine.castSpell(playerId, card.instanceId, targets);
        this.spellsCastThisLoop.add(card.instanceId);
        return true;
      } catch (error) {
        console.log(`[Bot] Failed to cast ${card.name}: ${error}`);
        continue;
      }
    }

    return false;
  }

  /**
   * Determines if we should respond with an instant
   */
  static shouldRespondInstant(game: StrictGameState, playerId: string): boolean {
    // Respond if there's a threatening spell on the stack
    if (game.stack.length > 0) {
      const topSpell = game.stack[game.stack.length - 1];
      if (topSpell.controllerId !== playerId) {
        return true; // Opponent's spell on stack
      }
    }

    // During combat, consider combat tricks
    if (game.phase === 'combat') {
      const attackers = Object.values(game.cards).filter(c => !!c.attacking);
      if (attackers.length > 0) return true;
    }

    return false;
  }

  /**
   * Scores an instant based on current game situation
   */
  static scoreInstant(game: StrictGameState, playerId: string, card: CardObject): number {
    const oracleText = (card.oracleText || card.definition?.oracle_text || '').toLowerCase();
    let score = 0;

    // Counter spells
    if (oracleText.includes('counter target')) {
      if (game.stack.length > 0) {
        const topSpell = game.stack[game.stack.length - 1];
        if (topSpell.controllerId !== playerId) {
          score += 10; // High priority to counter opponent's spells
        }
      }
      return score; // Don't cast counter spells with nothing to counter
    }

    // Removal instants
    if (oracleText.includes('destroy target') || oracleText.includes('exile target')) {
      const threats = this.countOpponentThreats(game, playerId);
      if (threats > 0) score += 7;
    }

    // Damage instants
    if (oracleText.includes('deals') && oracleText.includes('damage')) {
      const opponent = this.getOpponent(game, playerId);
      if (opponent && opponent.life <= 5) {
        score += 10; // Go for lethal
      } else if (game.phase === 'combat') {
        score += 5; // Combat trick
      }
    }

    // Combat tricks (pump spells)
    if (game.phase === 'combat' && (oracleText.includes('+') || oracleText.includes('gets'))) {
      const ourAttackers = Object.values(game.cards).filter(c =>
        c.controllerId === playerId && !!c.attacking
      );
      if (ourAttackers.length > 0) score += 6;
    }

    return score;
  }

  /**
   * Checks if a card requires a target
   */
  static requiresTarget(card: CardObject): boolean {
    const oracleText = (card.oracleText || card.definition?.oracle_text || '').toLowerCase();
    const typeLine = (card.typeLine || card.definition?.type_line || '').toLowerCase();

    if (typeLine.includes('aura')) return true;
    if (oracleText.includes('target creature')) return true;
    if (oracleText.includes('target player')) return true;
    if (oracleText.includes('target permanent')) return true;
    if (oracleText.includes('target spell')) return true;

    return false;
  }

  /**
   * Chooses targets for a spell
   */
  static chooseSpellTargets(game: StrictGameState, playerId: string, card: CardObject): string[] {
    const oracleText = (card.oracleText || card.definition?.oracle_text || '').toLowerCase();

    // Determine target type and find valid targets
    if (oracleText.includes('target creature you control')) {
      const creatures = Object.values(game.cards).filter(c =>
        c.controllerId === playerId &&
        c.zone === 'battlefield' &&
        (c.types?.includes('Creature') || c.typeLine?.includes('Creature'))
      );
      if (creatures.length > 0) {
        // Pick best creature (highest power for pump, or any for other effects)
        const sorted = creatures.sort((a, b) => (b.power || 0) - (a.power || 0));
        return [sorted[0].instanceId];
      }
    }

    if (oracleText.includes('target creature') || oracleText.includes('target permanent')) {
      const isRemoval = oracleText.includes('destroy') || oracleText.includes('exile') ||
        oracleText.includes('deals') || oracleText.includes('damage');

      if (isRemoval) {
        // Target opponent's best creature
        const oppCreatures = Object.values(game.cards).filter(c =>
          c.controllerId !== playerId &&
          c.zone === 'battlefield' &&
          (c.types?.includes('Creature') || c.typeLine?.includes('Creature'))
        );
        if (oppCreatures.length > 0) {
          const sorted = oppCreatures.sort((a, b) =>
            ((b.power || 0) + (b.toughness || 0)) - ((a.power || 0) + (a.toughness || 0))
          );
          return [sorted[0].instanceId];
        }
      } else {
        // Target our own creature (buff spell)
        const ourCreatures = Object.values(game.cards).filter(c =>
          c.controllerId === playerId &&
          c.zone === 'battlefield' &&
          (c.types?.includes('Creature') || c.typeLine?.includes('Creature'))
        );
        if (ourCreatures.length > 0) {
          const sorted = ourCreatures.sort((a, b) => (b.power || 0) - (a.power || 0));
          return [sorted[0].instanceId];
        }
      }
    }

    if (oracleText.includes('target player') || oracleText.includes('target opponent')) {
      const opponent = this.getOpponent(game, playerId);
      if (opponent) return [opponent.id];
    }

    if (oracleText.includes('target spell') && game.stack.length > 0) {
      // Counter the top spell
      const topSpell = game.stack[game.stack.length - 1];
      if (topSpell.controllerId !== playerId) {
        return [topSpell.id];
      }
    }

    return [];
  }

  /**
   * Chooses a target for an Aura
   */
  static chooseAuraTarget(game: StrictGameState, playerId: string, card: CardObject): string[] {
    const oracleText = (card.oracleText || card.definition?.oracle_text || '').toLowerCase();

    // Determine if it's a beneficial or harmful aura
    const isBeneficial = oracleText.includes('+') || oracleText.includes('hexproof') ||
      oracleText.includes('indestructible') || oracleText.includes('flying') ||
      oracleText.includes('lifelink');

    const creatures = Object.values(game.cards).filter(c =>
      c.zone === 'battlefield' &&
      (c.types?.includes('Creature') || c.typeLine?.includes('Creature'))
    );

    if (isBeneficial) {
      // Target our creatures
      const ours = creatures.filter(c => c.controllerId === playerId);
      if (ours.length > 0) {
        const sorted = ours.sort((a, b) => (b.power || 0) - (a.power || 0));
        return [sorted[0].instanceId];
      }
    } else {
      // Target opponent's creatures (e.g., Pacifism effects)
      const theirs = creatures.filter(c => c.controllerId !== playerId);
      if (theirs.length > 0) {
        const sorted = theirs.sort((a, b) =>
          ((b.power || 0) + (b.toughness || 0)) - ((a.power || 0) + (a.toughness || 0))
        );
        return [sorted[0].instanceId];
      }
    }

    return [];
  }

  /**
   * Legacy method - calls processActionsLoop for backwards compatibility
   */
  static processActions(game: StrictGameState) {
    this.processActionsLoop(game);
  }

  // ============================================
  // CHOICE HANDLING
  // ============================================

  /**
   * Handles pending choices for bot players.
   * Makes decisions based on heuristics and resumes spell resolution.
   */
  static handleBotChoice(game: StrictGameState): boolean {
    const pending = game.pendingChoice;
    if (!pending) return false;

    const player = game.players[pending.choosingPlayerId];
    if (!player?.isBot) return false;

    console.log(`[Bot] ${player.name} making choice: ${pending.type} - "${pending.prompt}"`);

    let result: ChoiceResult;

    switch (pending.type) {
      case 'mode_selection':
        result = this.chooseModes(game, pending);
        break;

      case 'card_selection':
        result = this.chooseCards(game, pending);
        break;

      case 'target_selection':
        result = this.chooseTargets(game, pending);
        break;

      case 'yes_no':
        result = this.chooseYesNo(game, pending);
        break;

      case 'player_selection':
        result = this.choosePlayer(game, pending);
        break;

      case 'number_selection':
        result = this.chooseNumber(game, pending);
        break;

      case 'order_selection':
        result = this.chooseOrder(game, pending);
        break;

      default:
        console.warn(`[Bot] Unknown choice type: ${pending.type}`);
        return false;
    }

    // Process the choice
    const stackItem = ChoiceHandler.processChoice(game, result);

    // Resume spell/ability resolution
    if (stackItem) {
      // For triggered abilities with target selection, store targets and let stack resolve naturally
      if (result.type === 'target_selection' && stackItem.type === 'trigger') {
        stackItem.targets = result.selectedCardIds || [];
        console.log(`[Bot] Stored targets for trigger: ${stackItem.targets.map(id => game.cards[id]?.name).join(', ')}`);
        // Don't resolve yet - let the stack resolve normally when priority passes
        return true;
      }

      // For other choices, resume resolution immediately
      const sourceCard = game.cards[stackItem.sourceId];
      if (sourceCard) {
        console.log(`[Bot] Resuming resolution for ${sourceCard.name}`);
        OracleEffectResolver.resolveSpellEffects(game, sourceCard, stackItem);
      }
    }

    return true;
  }

  /**
   * Bot mode selection - prioritize removal/damage modes
   */
  private static chooseModes(game: StrictGameState, pending: import('../../game/types').PendingChoice): ChoiceResult {
    const options = pending.options?.filter(o => !o.disabled) || [];
    const count = pending.constraints?.exactCount || 1;

    // Score modes based on effect type
    const scoredOptions = options.map(opt => {
      let score = 0;
      const text = opt.label.toLowerCase();

      if (text.includes('destroy') || text.includes('exile')) score += 10;
      if (text.includes('damage')) score += 8;
      if (text.includes('draw')) score += 6;
      if (text.includes('counter')) score += game.stack.length > 0 ? 10 : 0;
      if (text.includes('gain') && text.includes('life')) score += 3;
      if (text.includes('discard')) score += 5;
      if (text.includes('+') && text.includes('/')) score += 4; // Pump

      return { opt, score };
    });

    // Sort by score and pick top N
    scoredOptions.sort((a, b) => b.score - a.score);
    const selected = scoredOptions.slice(0, count).map(s => s.opt.id);

    console.log(`[Bot] Selected modes: ${selected.join(', ')}`);

    return {
      choiceId: pending.id,
      type: 'mode_selection',
      selectedOptionIds: selected
    };
  }

  /**
   * Bot card selection - choose best card to affect (remove from opponent, etc.)
   */
  private static chooseCards(game: StrictGameState, pending: import('../../game/types').PendingChoice): ChoiceResult {
    const selectableCards = (pending.selectableIds || [])
      .map(id => game.cards[id])
      .filter(Boolean);

    const count = pending.constraints?.exactCount ||
                  pending.constraints?.minCount || 1;

    // Score cards (higher = more valuable to select)
    const scoredCards = selectableCards.map(card => {
      let score = 0;

      // Creatures by power/toughness
      if (card.types?.includes('Creature') || card.typeLine?.includes('Creature')) {
        score += (card.power || 0) * 2 + (card.toughness || 0);
      }

      // Evasion keywords make creatures more threatening
      if (card.keywords?.includes('Flying')) score += 3;
      if (card.keywords?.includes('Trample')) score += 2;

      // Card types
      if (card.types?.includes('Planeswalker')) score += 15;
      if (card.types?.includes('Instant') || card.types?.includes('Sorcery')) {
        // Removal spells are high priority to discard
        const text = card.oracleText?.toLowerCase() || '';
        if (text.includes('destroy') || text.includes('exile') || text.includes('damage')) {
          score += 10;
        }
      }

      // Mana value (prefer removing expensive cards)
      const cmc = this.getManaCost(card);
      score += cmc * 0.5;

      return { card, score };
    });

    scoredCards.sort((a, b) => b.score - a.score);
    const selected = scoredCards.slice(0, count).map(s => s.card.instanceId);

    console.log(`[Bot] Selected cards: ${selected.map(id => game.cards[id]?.name).join(', ')}`);

    return {
      choiceId: pending.id,
      type: 'card_selection',
      selectedCardIds: selected
    };
  }

  /**
   * Bot target selection - similar to card selection but for targets
   */
  private static chooseTargets(game: StrictGameState, pending: import('../../game/types').PendingChoice): ChoiceResult {
    const prompt = pending.prompt.toLowerCase();
    const selectableIds = pending.selectableIds || [];
    const count = pending.constraints?.exactCount || pending.constraints?.minCount || 1;

    // Special handling for blight - choose a creature that can survive or is least valuable
    if (prompt.includes('blight') || prompt.includes('-1/-1 counter')) {
      const cards = selectableIds
        .map(id => game.cards[id])
        .filter(Boolean)
        .map(card => {
          // Extract blight amount from prompt
          const blightMatch = prompt.match(/blight\s+(\d+)|(\d+)\s*-1\/-1/i);
          const blightAmount = blightMatch ? parseInt(blightMatch[1] || blightMatch[2]) : 1;

          // Score: prefer creatures that survive the blight
          const survives = card.toughness > blightAmount;
          const value = (card.power || 0) + (card.toughness || 0);

          // High score = less likely to pick (we want to preserve valuable creatures)
          // But prioritize creatures that survive the blight
          let score = survives ? -1000 : 0; // Strongly prefer survivors
          score += value * 10; // Less valuable creatures are better blight targets

          return { card, score };
        })
        .sort((a, b) => a.score - b.score); // Lower score = better choice

      const selectedIds = cards.slice(0, count).map(c => c.card.instanceId);
      console.log(`[Bot] Blight target: ${selectedIds.map(id => game.cards[id]?.name).join(', ')}`);

      return {
        choiceId: pending.id,
        type: 'target_selection',
        selectedCardIds: selectedIds
      };
    }

    // Check for skip option (for "you may" abilities)
    if (pending.options?.some(o => o.id === 'skip')) {
      // Evaluate if blighting is worth it
      const sourceCard = game.cards[pending.sourceCardId];
      const oracleText = (sourceCard?.oracleText || '').toLowerCase();

      // If the "if you do" effect is beneficial, don't skip
      const hasBeneficialEffect = /if you do.*(?:create|draw|gain|deal|destroy|exile)/i.test(oracleText);

      if (!hasBeneficialEffect && selectableIds.length > 0) {
        // If no beneficial effect or no good targets, skip
        const bestCreature = selectableIds
          .map(id => game.cards[id])
          .filter(Boolean)
          .sort((a, b) => (b.power || 0) + (b.toughness || 0) - (a.power || 0) - (a.toughness || 0))[0];

        const blightMatch = prompt.match(/blight\s+(\d+)/i);
        const blightAmount = blightMatch ? parseInt(blightMatch[1]) : 1;

        // Skip if our best creature would die from blight
        if (bestCreature && bestCreature.toughness <= blightAmount) {
          console.log(`[Bot] Skipping blight - would kill our creature`);
          return {
            choiceId: pending.id,
            type: 'target_selection',
            selectedOptionIds: ['skip'],
            selectedCardIds: []
          };
        }
      }
    }

    // Default: use same logic as card selection
    return {
      ...this.chooseCards(game, pending),
      type: 'target_selection'
    };
  }

  /**
   * Bot yes/no decision - generally say yes to beneficial effects
   */
  private static chooseYesNo(game: StrictGameState, pending: import('../../game/types').PendingChoice): ChoiceResult {
    const prompt = pending.prompt.toLowerCase();
    let confirm = true;

    // Ward payment decision - usually pay if we can afford it
    if (prompt.includes('ward')) {
      const player = game.players[pending.choosingPlayerId];
      if (!player) {
        confirm = false;
      } else {
        // Check if it's a life cost
        const lifeMatch = prompt.match(/pay\s+(\d+)\s*life/i);
        if (lifeMatch) {
          const lifeCost = parseInt(lifeMatch[1]);
          confirm = player.life > lifeCost + 5; // Keep buffer of 5 life
        }

        // Check if it's a mana cost - bot will try to pay if spell seems important
        // For simplicity, bots usually try to pay Ward
        if (prompt.includes('{')) {
          // Check available mana roughly
          const totalMana = Object.values(player.manaPool || {}).reduce((a, b) => a + b, 0);
          const costMatch = prompt.match(/\{(\d+)\}/);
          if (costMatch && totalMana < parseInt(costMatch[1])) {
            confirm = false; // Can't afford it
          }
        }
      }
      console.log(`[Bot] Ward decision: ${confirm ? 'Pay' : 'Decline'}`);
    }
    // Don't confirm if it explicitly helps opponent
    else if (prompt.includes('opponent') && prompt.includes('draw')) {
      confirm = false;
    }
    // Don't pay costs that seem too high
    else if (prompt.includes('pay') && prompt.includes('life')) {
      const player = game.players[pending.choosingPlayerId];
      if (player && player.life <= 5) {
        confirm = false;
      }
    }

    console.log(`[Bot] Chose ${confirm ? 'Yes' : 'No'}`);

    return {
      choiceId: pending.id,
      type: 'yes_no',
      confirmed: confirm
    };
  }

  /**
   * Bot player selection - usually target opponent
   */
  private static choosePlayer(game: StrictGameState, pending: import('../../game/types').PendingChoice): ChoiceResult {
    const controllerId = pending.controllingPlayerId;
    const prompt = pending.prompt.toLowerCase();

    // For beneficial effects, choose self; for harmful, choose opponent
    let targetId: string;
    if (prompt.includes('gain') || prompt.includes('draw') || prompt.includes('untap')) {
      targetId = controllerId;
    } else {
      targetId = game.turnOrder.find(id => id !== controllerId) || controllerId;
    }

    console.log(`[Bot] Selected player: ${game.players[targetId]?.name}`);

    return {
      choiceId: pending.id,
      type: 'player_selection',
      selectedPlayerId: targetId
    };
  }

  /**
   * Bot number selection - usually maximize beneficial values
   */
  private static chooseNumber(_game: StrictGameState, pending: import('../../game/types').PendingChoice): ChoiceResult {
    const prompt = pending.prompt.toLowerCase();
    let value: number;

    if (prompt.includes('pay') || prompt.includes('sacrifice') || prompt.includes('discard')) {
      // Minimize costs
      value = pending.minValue || 0;
    } else {
      // Maximize benefits
      value = pending.maxValue || pending.minValue || 1;
    }

    console.log(`[Bot] Selected number: ${value}`);

    return {
      choiceId: pending.id,
      type: 'number_selection',
      selectedValue: value
    };
  }

  /**
   * Bot order selection - keep best cards on top
   */
  private static chooseOrder(game: StrictGameState, pending: import('../../game/types').PendingChoice): ChoiceResult {
    const cards = (pending.selectableIds || [])
      .map(id => game.cards[id])
      .filter(Boolean);

    // Score cards and order by score (best on top)
    const scoredCards = cards.map(card => ({
      card,
      score: this.scoreCard(game, pending.controllingPlayerId, card)
    }));

    scoredCards.sort((a, b) => b.score - a.score);
    const orderedIds = scoredCards.map(s => s.card.instanceId);

    console.log(`[Bot] Ordered cards (top to bottom): ${orderedIds.map(id => game.cards[id]?.name).join(', ')}`);

    return {
      choiceId: pending.id,
      type: 'order_selection',
      orderedIds: orderedIds
    };
  }

  /**
   * Bot logic for choosing attackers.
   * Strategy: Attack with creatures that won't die to obvious blocks, or attack all if lethal.
   */
  static chooseAttackers(game: StrictGameState, attackerId: string): { attackerId: string, targetId: string }[] {
    const attackers: { attackerId: string, targetId: string }[] = [];
    const player = game.players[attackerId];

    // Find the opponent (target for attacks)
    const opponentId = game.turnOrder.find(id => id !== attackerId);
    if (!opponentId) return attackers;

    const opponent = game.players[opponentId];

    // Get all eligible attackers (untapped creatures controlled since last turn or with haste)
    const eligibleCreatures = Object.values(game.cards).filter(c => {
      if (c.controllerId !== attackerId) return false;
      if (c.zone !== 'battlefield') return false;
      if (!c.types?.includes('Creature') && !c.typeLine?.includes('Creature')) return false;
      if (c.tapped) return false;

      // Check for "can't attack" modifier (e.g., from Pacifism-style auras)
      const cantAttack = c.modifiers?.some(m =>
        m.type === 'ability_grant' && m.value === 'cant_attack'
      );
      if (cantAttack) return false;

      // Check summoning sickness
      const hasHaste = c.keywords?.includes('Haste') ||
                       c.oracleText?.toLowerCase().includes('haste');
      if (c.controlledSinceTurn === game.turnCount && !hasHaste) return false;

      return true;
    });

    if (eligibleCreatures.length === 0) return attackers;

    // Get opponent's potential blockers
    const potentialBlockers = Object.values(game.cards).filter(c =>
      c.controllerId === opponentId &&
      c.zone === 'battlefield' &&
      !c.tapped &&
      (c.types?.includes('Creature') || c.typeLine?.includes('Creature'))
    );

    // Calculate total attack power
    const totalAttackPower = eligibleCreatures.reduce((sum, c) => sum + (c.power || 0), 0);
    const isLethal = totalAttackPower >= opponent.life;

    // Strategy: If lethal, attack with everything
    if (isLethal && potentialBlockers.length === 0) {
      console.log(`[Bot] ${player.name} going for lethal! (${totalAttackPower} damage, opponent at ${opponent.life} life)`);
      eligibleCreatures.forEach(c => {
        attackers.push({ attackerId: c.instanceId, targetId: opponentId });
      });
      return attackers;
    }

    // Non-lethal: Be more conservative
    // Attack with creatures that:
    // 1. Have evasion (flying, trample, unblockable)
    // 2. Are bigger than all potential blockers
    // 3. Won't trade unfavorably

    for (const creature of eligibleCreatures) {
      const creaturePower = creature.power || 0;
      const creatureToughness = creature.toughness || 0;

      // Check for evasion abilities
      const hasFlying = creature.keywords?.includes('Flying') ||
                        creature.oracleText?.toLowerCase().includes('flying');
      const hasTrample = creature.keywords?.includes('Trample') ||
                         creature.oracleText?.toLowerCase().includes('trample');
      const hasUnblockable = creature.oracleText?.toLowerCase().includes("can't be blocked");
      const hasMenace = creature.keywords?.includes('Menace') ||
                        creature.oracleText?.toLowerCase().includes('menace');

      // Flying blockers check
      const flyingBlockers = potentialBlockers.filter(b =>
        b.keywords?.includes('Flying') ||
        b.keywords?.includes('Reach') ||
        b.oracleText?.toLowerCase().includes('flying') ||
        b.oracleText?.toLowerCase().includes('reach')
      );

      // Evaluate if safe to attack
      let shouldAttack = false;

      if (hasUnblockable) {
        shouldAttack = true;
      } else if (hasFlying && flyingBlockers.length === 0) {
        shouldAttack = true;
      } else if (potentialBlockers.length === 0) {
        shouldAttack = true;
      } else {
        // Check if we can survive or trade favorably
        const bestBlocker = potentialBlockers.reduce((best, b) => {
          const bPower = b.power || 0;
          const bToughness = b.toughness || 0;
          if (!best) return b;
          // Prefer blocker that would kill our creature
          if (bPower >= creatureToughness && (best.power || 0) < creatureToughness) return b;
          // Otherwise prefer largest
          if (bPower + bToughness > (best.power || 0) + (best.toughness || 0)) return b;
          return best;
        }, null as any);

        if (bestBlocker) {
          const blockerPower = bestBlocker.power || 0;
          const blockerToughness = bestBlocker.toughness || 0;

          // We survive the block
          if (creatureToughness > blockerPower) {
            shouldAttack = true;
          }
          // We kill the blocker and have trample
          else if (creaturePower >= blockerToughness && hasTrample) {
            shouldAttack = true;
          }
          // We're significantly bigger (attack anyway for pressure)
          else if (creaturePower >= blockerToughness + 2 && creatureToughness >= blockerPower) {
            shouldAttack = true;
          }
          // Menace requires 2 blockers
          else if (hasMenace && potentialBlockers.length < 2) {
            shouldAttack = true;
          }
        }
      }

      if (shouldAttack) {
        attackers.push({ attackerId: creature.instanceId, targetId: opponentId });
      }
    }

    return attackers;
  }

  /**
   * Bot logic for choosing blockers.
   * Simple strategy: Block the largest attacker if we have a creature that can survive or trade favorably.
   */
  static chooseBlockers(game: StrictGameState, defenderId: string): { blockerId: string, attackerId: string }[] {
    const blockers: { blockerId: string, attackerId: string }[] = [];

    // Get all attackers
    const attackers = Object.values(game.cards).filter(c => !!c.attacking);

    if (attackers.length === 0) {
      return blockers; // No attackers to block
    }

    // Get all potential blockers (untapped creatures controlled by defender)
    const potentialBlockers = Object.values(game.cards).filter(c => {
      if (c.controllerId !== defenderId) return false;
      if (c.zone !== 'battlefield') return false;
      if (c.tapped) return false;
      if (!c.types?.includes('Creature') && !c.typeLine?.includes('Creature')) return false;

      // Check for "can't block" modifier
      const cantBlock = c.modifiers?.some(m =>
        m.type === 'ability_grant' && m.value === 'cant_block'
      );
      if (cantBlock) return false;

      return true;
    });

    if (potentialBlockers.length === 0) {
      console.log(`[Bot] ${game.players[defenderId].name} has no untapped creatures to block with`);
      return blockers; // No creatures available to block
    }

    // Simple blocking strategy: Block lethal damage first, then largest threats
    // Sort attackers by power (descending) - block biggest threats
    const sortedAttackers = [...attackers].sort((a, b) => (b.power || 0) - (a.power || 0));

    // Check if we're in lethal range
    const defender = game.players[defenderId];
    const totalAttackPower = attackers.reduce((sum, atk) => sum + (atk.power || 0), 0);
    const isLethal = totalAttackPower >= defender.life;

    if (isLethal) {
      // We must block to survive - block as many as possible
      console.log(`[Bot] ${defender.name} is facing lethal damage (${totalAttackPower} damage, ${defender.life} life) - blocking aggressively`);

      for (const attacker of sortedAttackers) {
        const blocker = potentialBlockers.find(b =>
          !blockers.some(block => block.blockerId === b.instanceId)
        );

        if (blocker) {
          blockers.push({ blockerId: blocker.instanceId, attackerId: attacker.instanceId });
          console.log(`[Bot] Blocking ${attacker.name} (${attacker.power}/${attacker.toughness}) with ${blocker.name} (${blocker.power}/${blocker.toughness})`);
        }
      }
    } else {
      // Not lethal - only block if we can trade favorably or survive
      for (const attacker of sortedAttackers) {
        const blocker = potentialBlockers.find(b => {
          // Don't reuse blockers
          if (blockers.some(block => block.blockerId === b.instanceId)) return false;

          const blockerPower = b.power || 0;
          const blockerToughness = b.toughness || 0;
          const attackerPower = attacker.power || 0;
          const attackerToughness = attacker.toughness || 0;

          // Good block scenarios:
          // 1. We kill the attacker and survive
          const weKill = blockerPower >= attackerToughness;
          const weSurvive = blockerToughness > attackerPower;

          // 2. We trade (both die)
          const weTrade = blockerPower >= attackerToughness && attackerPower >= blockerToughness;

          // 3. Blocker is bigger/better (higher combined power+toughness)
          const ourValue = blockerPower + blockerToughness;
          const theirValue = attackerPower + attackerToughness;

          // Block if: we survive, or it's a favorable trade
          return (weKill && weSurvive) || (weTrade && theirValue >= ourValue);
        });

        if (blocker) {
          blockers.push({ blockerId: blocker.instanceId, attackerId: attacker.instanceId });
          console.log(`[Bot] Blocking ${attacker.name} (${attacker.power}/${attacker.toughness}) with ${blocker.name} (${blocker.power}/${blocker.toughness})`);
        }
      }
    }

    return blockers;
  }
}
