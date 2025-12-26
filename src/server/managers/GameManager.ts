
import { StrictGameState, PlayerState, CardObject } from '../game/types';
import { RulesEngine } from '../game/RulesEngine';

import { EventEmitter } from 'events';

// Augment EventEmitter to type the emit event if we could, but for now standard.
// We expect SocketService to listen to 'game_update' from GameManager.

export class GameManager extends EventEmitter {
  public games: Map<string, StrictGameState> = new Map();

  // Helper to emit generic game notifications
  public notify(roomId: string, message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info', targetId?: string) {
    this.emit('game_notification', roomId, { message, type, targetId });
  }

  createGame(gameId: string, players: { id: string; name: string; isBot?: boolean }[]): StrictGameState {

    // Convert array to map
    const playerRecord: Record<string, PlayerState> = {};
    players.forEach(p => {
      playerRecord[p.id] = {
        id: p.id,
        name: p.name,
        isBot: p.isBot,
        life: 20,
        poison: 0,
        energy: 0,
        isActive: false,
        hasPassed: false,
        manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 }
      };
    });

    const firstPlayerId = players.length > 0 ? players[0].id : '';

    const gameState: StrictGameState = {
      roomId: gameId,
      players: playerRecord,
      cards: {}, // Populated later
      stack: [],

      turnCount: 1,
      turnOrder: players.map(p => p.id),
      activePlayerId: firstPlayerId,
      priorityPlayerId: firstPlayerId,

      phase: 'setup',
      step: 'mulligan',

      passedPriorityCount: 0,
      landsPlayedThisTurn: 0,

      maxZ: 100
    };

    // Set First Player Active status
    if (gameState.players[firstPlayerId]) {
      gameState.players[firstPlayerId].isActive = true;
    }

    this.games.set(gameId, gameState);
    return gameState;
  }

  // Track rooms where a bot is currently "thinking" to avoid double-queuing
  private thinkingRooms: Set<string> = new Set();
  // Throttle logs
  private lastBotLog: Record<string, number> = {};

  // Helper to trigger bot actions if game is stuck or just started
  public triggerBotCheck(roomId: string): StrictGameState | null {
    const game = this.games.get(roomId);
    if (!game) return null;

    // specific hack for Mulligan phase synchronization
    if (game.step === 'mulligan') {
      Object.values(game.players).forEach(p => {
        if (p.isBot && !p.handKept) {
          const engine = new RulesEngine(game);
          try { engine.resolveMulligan(p.id, true, []); } catch (e) { }
        }
      });
      // If bots acted in mulligan, we might need to verify if game advances.
      // But for Mulligan, we don't need delays as much because it's a hidden phase usually.
      // Let's keep mulligan instant for simplicity, or we can delay it too?
      // Let's keep instant for mulligan to "Start Game" faster.
    }

    const priorityId = game.priorityPlayerId;
    const priorityPlayer = game.players[priorityId];

    // If it is a Bot's turn to have priority, and we aren't already processing
    if (priorityPlayer?.isBot && !this.thinkingRooms.has(roomId)) {
      const now = Date.now();
      if (!this.lastBotLog[roomId] || now - this.lastBotLog[roomId] > 5000) {
        console.log(`[Bot Loop] Bot ${priorityPlayer.name} is thinking...`);
        this.lastBotLog[roomId] = now;
      }
      this.thinkingRooms.add(roomId);

      setTimeout(() => {
        this.thinkingRooms.delete(roomId);
        this.processBotActions(game);
        // After processing one action, we trigger check again to see if we need to do more (e.g. Pass -> Pass -> My Turn)
        // But we need to emit the update first! 
        // processBotActions actually mutates state. 
        // We should ideally emit 'game_update' here if we were outside the main socket loop.
        // Since GameManager doesn't have the SocketService instance directly usually, 
        // strictly speaking we need to rely on the caller to emit, OR GameManager should emit.
        // GameManager extends EventEmitter. We can emit 'state_change'.
        this.emit('game_update', roomId, game); // Force emit update

        // Recursive check (will trigger next timeout if still bot's turn)
        this.triggerBotCheck(roomId);
      }, 1000);
    }

    return game;
  }

  getGame(roomId: string): StrictGameState | undefined {
    return this.games.get(roomId);
  }

  // --- Strict Rules Action Handler ---
  handleStrictAction(roomId: string, action: any, actorId: string): StrictGameState | null {
    const game = this.games.get(roomId);
    if (!game) return null;

    const engine = new RulesEngine(game);

    try {
      switch (action.type) {
        case 'PASS_PRIORITY':
          engine.passPriority(actorId);
          break;
        case 'TOGGLE_STOP':
          engine.toggleStop(actorId);
          break;
        case 'PLAY_LAND':
          engine.playLand(actorId, action.cardId, action.position, action.faceIndex);
          break;
        case 'ADD_MANA':
          engine.addMana(actorId, action.mana); // action.mana = { color: 'R', amount: 1 }
          break;
        case 'CAST_SPELL':
          const c = engine.state.cards[action.cardId];
          console.log(`[DEBUG] CAST_SPELL: Name=${c?.name} DFC=${c?.isDoubleFaced} Faces=${c?.card_faces?.length} DefFaces=${c?.definition?.card_faces?.length} FaceIdx=${action.faceIndex}`);
          engine.castSpell(actorId, action.cardId, action.targets, action.position, action.faceIndex);
          break;
        case 'DECLARE_ATTACKERS':
          try {
            engine.declareAttackers(actorId, action.attackers);
          } catch (err: any) {
            console.error(`[DeclareAttackers Error] Actor: ${actorId}, Active: ${game.activePlayerId}, Priority: ${game.priorityPlayerId}, Step: ${game.step}`);
            throw err; // Re-throw to catch block below
          }
          break;
        case 'DECLARE_BLOCKERS':
          engine.declareBlockers(actorId, action.blockers);
          break;
        case 'CREATE_TOKEN':
          engine.createToken(actorId, action.definition, action.position);
          break;
        case 'MULLIGAN_DECISION':
          engine.resolveMulligan(actorId, action.keep, action.cardsToBottom);
          break;
        case 'DRAW_CARD':
          // Strict validation: Must be Draw step, Must be Active Player
          if (game.step !== 'draw') throw new Error("Can only draw in Draw Step.");
          if (game.activePlayerId !== actorId) throw new Error("Only Active Player can draw.");

          engine.drawCard(actorId);
          // After drawing, 504.2 says AP gets priority.
          engine.resetPriority(actorId);
          break;
        // TODO: Activate Ability
        case 'ADD_COUNTER':
          engine.addCounter(actorId, action.cardId, action.counterType, action.count || action.amount);
          break;
        default:
          console.warn(`Unknown strict action: ${action.type}`);
          return null;
      }
    } catch (e: any) {
      console.error(`Rule Violation [${action?.type || 'UNKNOWN'}]: ${e.message}`);
      // Notify the user (and others?) about the error
      this.emit('game_error', roomId, { message: e.message, userId: actorId });
      return null;
    }

    // Bot Cycle: Trigger Async Check (Instead of synchronous loop)
    this.triggerBotCheck(roomId);

    // Check Win Condition
    this.checkWinCondition(game, roomId);

    return game;
  }

  // Check if game is over
  public checkWinCondition(game: StrictGameState, gameId: string) {
    const alivePlayers = Object.values(game.players).filter(p => p.life > 0 && p.poison < 10);

    // 1v1 Logic
    if (alivePlayers.length === 1 && Object.keys(game.players).length > 1) {
      // Winner found
      const winner = alivePlayers[0];
      // Only emit once
      if (game.phase !== 'ending') {
        console.log(`[GameManager] Game Over. Winner: ${winner.name}`);
        this.emit('game_over', { gameId, winnerId: winner.id });
        this.notify(gameId, `Game Over! ${winner.name} wins!`, 'success');
        game.phase = 'ending'; // Mark as ending so we don't double emit
      }
    }
  }

  // --- Bot AI Logic ---
  private processBotActions(game: StrictGameState) {
    const engine = new RulesEngine(game);
    const botId = game.priorityPlayerId;
    const bot = game.players[botId];

    if (!bot || !bot.isBot) return;

    // 1. Mulligan: Always Keep (but check if we have cards?)
    if (game.step === 'mulligan') {
      const hand = Object.values(game.cards).filter(c => c.ownerId === botId && c.zone === 'hand');
      if (hand.length === 0 && !bot.handKept) {
        // We have NO cards to keep? Something is wrong (deck didn't load?).
        // Don't loop infinitely trying to keep an empty hand if that's invalid, 
        // but technically "keeping" 0 cards is just accepting 0 cards.
        // However, usually this means initialization failed.
        // We'll log once and stop? Or just keep to unstuck the game?
        // Let's try to keep.
        // console.warn(`[Bot AI] ${bot.name} has 0 cards in hand during Mulligan. Initializing?`);
      }
      if (!bot.handKept) {
        try { engine.resolveMulligan(botId, true, []); } catch (e) { }
      }
      return;
    }

    // 2. Play Land (Main Phase, empty stack)
    if ((game.phase === 'main1' || game.phase === 'main2') && game.stack.length === 0) {
      if (game.landsPlayedThisTurn < 1) {
        const hand = Object.values(game.cards).filter(c => c.ownerId === botId && c.zone === 'hand');
        const land = hand.find(c => c.typeLine?.includes('Land') || c.types.includes('Land'));
        if (land) {
          console.log(`[Bot AI] ${bot.name} plays land ${land.name}`);
          try {
            engine.playLand(botId, land.instanceId);
            return;
          } catch (e) {
            console.warn("Bot failed to play land:", e);
          }
        }
      }
    }

    // 3. Play Spell (Main Phase, empty stack)
    if ((game.phase === 'main1' || game.phase === 'main2') && game.stack.length === 0) {
      const hand = Object.values(game.cards).filter(c => c.ownerId === botId && c.zone === 'hand');

      // Filter candidates (non-lands)
      const spells = hand.filter(c => !c.typeLine?.includes('Land') && !c.types.includes('Land'));

      // Sort by CMC descending (Try to play biggest threat first)
      // Note: c.manaCost might be string, need parsing or use c.cmc if available. 
      // For now, heuristic: just try all of them.

      for (const spell of spells) {
        // Only cast creatures for now to be safe with targets
        if (spell.types.includes('Creature')) {
          try {
            console.log(`[Bot AI] ${bot.name} attempting to cast ${spell.name}`);
            engine.castSpell(botId, spell.instanceId, []);
            // If successful, return immediately (Action taken)
            return;
          } catch (e: any) {
            // Failed (likely mana). Continue to next card.
            // console.warn(`[Bot AI] Failed to cast ${spell.name}: ${e.message}`);
          }
        }
      }
    }

    // 4. Combat: Declare Attackers (Active Player only)
    if (game.step === 'declare_attackers' && game.activePlayerId === botId && !game.attackersDeclared) {
      const attackers = Object.values(game.cards).filter(c =>
        c.controllerId === botId &&
        c.zone === 'battlefield' &&
        c.types.includes('Creature') &&
        !c.tapped &&
        !c.keywords.includes('Defender') // Simple check
      );

      const opponents = game.turnOrder.filter(pid => pid !== botId);
      const targetId = opponents[0];

      // Simple Heuristic: Attack with everything if we have profitable attacks?
      // For now: Attack with everything that isn't summon sick or defender.
      if (attackers.length > 0 && targetId) {
        // Randomly decide to attack to simulate "thinking" or non-suicidal behavior? 
        // For MVP: Aggro Bot - always attacks.
        const declaration = attackers.map(c => ({ attackerId: c.instanceId, targetId }));
        console.log(`[Bot AI] ${bot.name} attacks with ${attackers.length} creatures.`);
        try {
          engine.declareAttackers(botId, declaration);
        } catch (e) {
          console.warn(`[Bot AI] Attack failed: ${e}. Fallback to Skip Combat.`);
          try { engine.declareAttackers(botId, []); } catch (e2) { }
        }
        return;
      } else {
        console.log(`[Bot AI] ${bot.name} skips combat.`);
        try { engine.declareAttackers(botId, []); } catch (e) { }
        return;
      }
    }

    // 5. Combat: Declare Blockers (Defending Player)
    if (game.step === 'declare_blockers' && game.activePlayerId !== botId && !game.blockersDeclared) {
      // Identify attackers attacking ME
      const attackers = Object.values(game.cards).filter(c => c.attacking === botId);

      if (attackers.length > 0) {
        // Identify my blockers
        const blockers = Object.values(game.cards).filter(c =>
          c.controllerId === botId &&
          c.zone === 'battlefield' &&
          c.types.includes('Creature') &&
          !c.tapped
        );

        // Simple Heuristic: Block 1-to-1 if possible, just to stop damage.
        // Don't double block.
        const declaration: { blockerId: string, attackerId: string }[] = [];

        blockers.forEach((blocker, idx) => {
          if (idx < attackers.length) {
            declaration.push({ blockerId: blocker.instanceId, attackerId: attackers[idx].instanceId });
          }
        });

        if (declaration.length > 0) {
          console.log(`[Bot AI] ${bot.name} declares ${declaration.length} blockers.`);
          try { engine.declareBlockers(botId, declaration); } catch (e) { }
          return;
        }
      }

      // Default: No blocks
      console.log(`[Bot AI] ${bot.name} declares no blockers.`);
      try { engine.declareBlockers(botId, []); } catch (e) { }
      return;
    }

    // 6. End Step / Cleanup -> Pass
    if (game.phase === 'ending') {
      try { engine.passPriority(botId); } catch (e) { }
      return;
    }

    // 7. Default: Pass Priority (Catch-all for response windows, or empty stack)
    // Add artificial delay logic here? Use setTimeout? 
    // We can't easily wait in this synchronous loop. The loop relies on state updating.
    // If we want delay, we should likely return from the loop and use `setTimeout` to call `triggerBotCheck` again?
    // But `handleStrictAction` expects immediate return.
    // Ideally, the BOT actions should happen asynchronously if we want delay.
    // For now, we accept instant-speed bots.

    // console.log(`[Bot AI] ${bot.name} passes priority.`);
    try { engine.passPriority(botId); } catch (e) {
      console.warn("Bot failed to pass priority", e);
      // Force break loop if we are stuck?
      // RulesEngine.passPriority usually always succeeds if it's your turn.
    }
  }


  // --- Legacy Sandbox Action Handler (for Admin/Testing) ---
  handleAction(roomId: string, action: any, actorId: string): StrictGameState | null {
    const game = this.games.get(roomId);
    if (!game) return null;

    // Basic Validation: Ensure actor exists in game (or is host/admin?)
    if (!game.players[actorId]) {
      console.warn(`handleAction: Player ${actorId} not found in room ${roomId}`);
      return null;
    }

    console.log(`[GameManager] Handling Action: ${action.type} for ${roomId} by ${actorId}`);

    try {
      switch (action.type) {
        case 'UPDATE_LIFE':
          if (game.players[actorId]) {
            game.players[actorId].life += (action.amount || 0);
          }
          break;
        case 'MOVE_CARD':
          this.moveCard(game, action, actorId);
          break;
        case 'TAP_CARD':
          this.tapCard(game, action, actorId);
          break;
        case 'DRAW_CARD':
          const engine = new RulesEngine(game);
          engine.drawCard(actorId);
          break;
        case 'RESTART_GAME':
          this.restartGame(roomId);
          break;
        case 'ADD_COUNTER':
          const engineForCounter = new RulesEngine(game);
          engineForCounter.addCounter(actorId, action.cardId, action.counterType, action.count || action.amount);
          break;
      }
    } catch (e: any) {
      console.error(`Legacy Action Error [${action?.type}]: ${e.message}`);
      this.emit('game_error', roomId, { message: e.message, userId: actorId });
      return null;
    }

    return game;
  }

  // ... Legacy methods refactored to use StrictGameState types ...

  private moveCard(game: StrictGameState, action: any, actorId: string) {
    const card = game.cards[action.cardId];
    if (card) {
      if (card.controllerId !== actorId) return;

      const engine = new RulesEngine(game);
      // Use the engine method which handles cleanup (counters, modifiers, P/T reset)
      engine.moveCardToZone(action.cardId, action.toZone, false, action.position);
    }
  }

  private tapCard(game: StrictGameState, action: any, actorId: string) {
    const card = game.cards[action.cardId];
    if (card && card.controllerId === actorId) {
      const wuzUntapped = !card.tapped;
      card.tapped = !card.tapped;

      // Auto-Add Mana for Basic Lands if we just tapped it
      // Auto-Add Mana for Lands (Universal Support)
      if (wuzUntapped && card.tapped) {
        const engine = new RulesEngine(game);
        // Use shared logic to find production capability
        const colors = engine.getAvailableManaColors(card);

        if (colors.length > 0) {
          // Heuristic: If multiple colors (e.g. Command Tower), just return the first one for manual tap.
          // This is a QoL feature. Ideally, UI asks user. But for speed, default is better than nothing.
          engine.addMana(actorId, { color: colors[0], amount: 1 });
        }
      }
    }
  }

  // Helper to add cards (e.g. at game start)
  addCardToGame(roomId: string, cardData: Partial<CardObject>) {
    const game = this.games.get(roomId);
    if (!game) return;

    // @ts-ignore - aligning types roughly
    const cardDataAny = cardData as any;
    const card: CardObject = {
      instanceId: cardData.instanceId || Math.random().toString(36).substring(7),
      zone: cardDataAny.isCommander ? 'command' : 'library',
      tapped: false,
      faceDown: true,
      counters: [],
      keywords: [], // Default empty
      modifiers: [],
      colors: [],
      types: [],
      subtypes: [],
      supertypes: [],
      power: 0,
      toughness: 0,
      basePower: 0,
      baseToughness: 0,
      imageUrl: cardData.imageUrl || '',
      controllerId: '',
      ownerId: '',
      oracleId: '',
      scryfallId: cardData.scryfallId || '',
      setCode: cardData.setCode || '',
      name: '',
      ...cardData,
      isDoubleFaced: (cardData.definition?.card_faces?.length || 0) > 1 || (cardData.name || '').includes('//'),
      damageMarked: 0,
      controlledSinceTurn: 0, // Will be updated on draw/play
      definition: cardData.definition // Ensure definition is passed
    };

    // Auto-Parse Types if missing
    if (card.types.length === 0 && card.typeLine) {
      const [typePart, subtypePart] = card.typeLine.split('—').map(s => s.trim());
      const typeWords = typePart.split(' ');

      const supertypeList = ['Legendary', 'Basic', 'Snow', 'World'];
      const typeList = ['Land', 'Creature', 'Artifact', 'Enchantment', 'Planeswalker', 'Instant', 'Sorcery', 'Tribal', 'Battle', 'Kindred']; // Kindred = Tribal

      card.supertypes = typeWords.filter(w => supertypeList.includes(w));
      card.types = typeWords.filter(w => typeList.includes(w));

      if (subtypePart) {
        card.subtypes = subtypePart.split(' ');
      }
    }

    // Auto-Parse P/T from cardData if provided specifically as strings or numbers, ensuring numbers
    if (cardData.power !== undefined) card.basePower = Number(cardData.power);
    if (cardData.toughness !== undefined) card.baseToughness = Number(cardData.toughness);

    // Set current values to base
    card.power = card.basePower;
    card.toughness = card.baseToughness;

    game.cards[card.instanceId] = card;
  }

  private restartGame(roomId: string) {
    const game = this.games.get(roomId);
    if (!game) return;

    // 1. Reset Game Global State
    game.turnCount = 1;
    game.phase = 'setup';
    game.step = 'mulligan';
    game.stack = [];
    game.activePlayerId = game.turnOrder[0];
    game.priorityPlayerId = game.activePlayerId;
    game.passedPriorityCount = 0;
    game.landsPlayedThisTurn = 0;
    game.attackersDeclared = false;
    game.blockersDeclared = false;
    game.maxZ = 100;

    // 2. Reset Players
    Object.keys(game.players).forEach(pid => {
      const p = game.players[pid];
      p.life = 20;
      p.poison = 0;
      p.energy = 0;
      p.isActive = (pid === game.activePlayerId);
      p.hasPassed = false;
      p.manaPool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
      p.handKept = false;
      p.mulliganCount = 0;
    });

    // 3. Reset Cards
    const tokensToRemove: string[] = [];
    Object.values(game.cards).forEach(c => {
      if (c.oracleId.startsWith('token-')) {
        tokensToRemove.push(c.instanceId);
      } else {
        // Move to Library
        c.zone = 'library';
        c.tapped = false;
        c.faceDown = true;
        c.counters = [];
        c.modifiers = [];
        c.damageMarked = 0;
        c.controlledSinceTurn = 0;
        c.power = c.basePower;
        c.toughness = c.baseToughness;
        c.attachedTo = undefined;
        c.blocking = undefined;
        c.attacking = undefined;
        // Reset position?
        c.position = undefined;
      }
    });

    // Remove tokens
    tokensToRemove.forEach(id => {
      delete game.cards[id];
    });

    console.log(`Game ${roomId} restarted.`);

    // 4. Trigger Start Game (Draw Hands via Rules Engine)
    const engine = new RulesEngine(game);
    engine.startGame();
  }
}
