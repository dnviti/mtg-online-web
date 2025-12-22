
import { StrictGameState, PlayerState, CardObject } from '../game/types';
import { RulesEngine } from '../game/RulesEngine';

export class GameManager {
  public games: Map<string, StrictGameState> = new Map();

  createGame(roomId: string, players: { id: string; name: string; isBot?: boolean }[]): StrictGameState {

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
      roomId,
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

    this.games.set(roomId, gameState);
    return gameState;
  }

  // Helper to trigger bot actions if game is stuck or just started
  public triggerBotCheck(roomId: string): StrictGameState | null {
    const game = this.games.get(roomId);
    if (!game) return null;

    const MAX_LOOPS = 50;
    let loops = 0;
    // Iterate if current priority player is bot, OR if we are in Mulligan and ANY bot needs to act?
    // My processBotActions handles priorityPlayerId.
    // In Mulligan, does priorityPlayerId matter?
    // RulesEngine: resolveMulligan checks playerId.
    // We should iterate ALL bots in mulligan phase.

    if (game.step === 'mulligan') {
      Object.values(game.players).forEach(p => {
        if (p.isBot && !p.handKept) {
          const engine = new RulesEngine(game);
          try { engine.resolveMulligan(p.id, true, []); } catch (e) { }
        }
      });
      // After mulligan, game might auto-advance.
    }

    while (game.players[game.priorityPlayerId]?.isBot && loops < MAX_LOOPS) {
      loops++;
      this.processBotActions(game);
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
        case 'PLAY_LAND':
          engine.playLand(actorId, action.cardId, action.position);
          break;
        case 'ADD_MANA':
          engine.addMana(actorId, action.mana); // action.mana = { color: 'R', amount: 1 }
          break;
        case 'CAST_SPELL':
          engine.castSpell(actorId, action.cardId, action.targets, action.position);
          break;
        case 'DECLARE_ATTACKERS':
          engine.declareAttackers(actorId, action.attackers);
          break;
        case 'DECLARE_BLOCKERS':
          engine.declareBlockers(actorId, action.blockers);
          break;
        case 'CREATE_TOKEN':
          engine.createToken(actorId, action.definition);
          break;
        case 'MULLIGAN_DECISION':
          engine.resolveMulligan(actorId, action.keep, action.cardsToBottom);
          break;
        // TODO: Activate Ability
        default:
          console.warn(`Unknown strict action: ${action.type}`);
          return null;
      }
    } catch (e: any) {
      console.error(`Rule Violation [${action?.type || 'UNKNOWN'}]: ${e.message}`);
      // TODO: Return error to user?
      // For now, just logging and not updating state (transactional-ish)
      return null;
    }

    // Bot Cycle: If priority passed to a bot, or it's a bot's turn to act
    const MAX_LOOPS = 50;
    let loops = 0;
    while (game.players[game.priorityPlayerId]?.isBot && loops < MAX_LOOPS) {
      loops++;
      this.processBotActions(game);
    }

    return game;
  }

  // --- Bot AI Logic ---
  private processBotActions(game: StrictGameState) {
    const engine = new RulesEngine(game);
    const botId = game.priorityPlayerId;
    const bot = game.players[botId];

    if (!bot || !bot.isBot) return;

    // 1. Mulligan: Always Keep
    if (game.step === 'mulligan') {
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
      const spell = hand.find(c => !c.typeLine?.includes('Land') && !c.types.includes('Land'));

      if (spell) {
        // Only cast creatures for now to be safe with targets
        if (spell.types.includes('Creature')) {
          console.log(`[Bot AI] ${bot.name} casts creature ${spell.name}`);
          try {
            engine.castSpell(botId, spell.instanceId, []);
            return;
          } catch (e) { console.warn("Bot failed to cast spell:", e); }
        }
      }
    }

    // 4. Combat: Declare Attackers (Active Player only)
    if (game.step === 'declare_attackers' && game.activePlayerId === botId && !game.attackersDeclared) {
      const attackers = Object.values(game.cards).filter(c =>
        c.controllerId === botId &&
        c.zone === 'battlefield' &&
        c.types.includes('Creature') &&
        !c.tapped
      );
      const opponents = game.turnOrder.filter(pid => pid !== botId);
      const targetId = opponents[0];

      if (attackers.length > 0 && targetId) {
        const declaration = attackers.map(c => ({ attackerId: c.instanceId, targetId }));
        console.log(`[Bot AI] ${bot.name} attacks with ${attackers.length} creatures.`);
        try { engine.declareAttackers(botId, declaration); } catch (e) { }
        return;
      } else {
        console.log(`[Bot AI] ${bot.name} skips combat.`);
        try { engine.declareAttackers(botId, []); } catch (e) { }
        return;
      }
    }

    // 6. Default: Pass Priority
    try { engine.passPriority(botId); } catch (e) { console.warn("Bot failed to pass priority", e); }
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
    }

    return game;
  }

  // ... Legacy methods refactored to use StrictGameState types ...

  private moveCard(game: StrictGameState, action: any, actorId: string) {
    const card = game.cards[action.cardId];
    if (card) {
      if (card.controllerId !== actorId) return;
      // @ts-ignore
      card.position = { x: 0, y: 0, z: ++game.maxZ, ...action.position }; // type hack relative to legacy visual pos
      card.zone = action.toZone;
    }
  }

  private tapCard(game: StrictGameState, action: any, actorId: string) {
    const card = game.cards[action.cardId];
    if (card && card.controllerId === actorId) {
      const wuzUntapped = !card.tapped;
      card.tapped = !card.tapped;

      // Auto-Add Mana for Basic Lands if we just tapped it
      if (wuzUntapped && card.tapped && card.typeLine?.includes('Land')) {
        const engine = new RulesEngine(game); // Re-instantiate engine just for this helper
        // Infer color from type or oracle text or name? 
        // Simple: Basic Land Types
        if (card.typeLine.includes('Plains')) engine.addMana(actorId, { color: 'W', amount: 1 });
        else if (card.typeLine.includes('Island')) engine.addMana(actorId, { color: 'U', amount: 1 });
        else if (card.typeLine.includes('Swamp')) engine.addMana(actorId, { color: 'B', amount: 1 });
        else if (card.typeLine.includes('Mountain')) engine.addMana(actorId, { color: 'R', amount: 1 });
        else if (card.typeLine.includes('Forest')) engine.addMana(actorId, { color: 'G', amount: 1 });
        // TODO: Non-basic lands?
      }
    }
  }

  // Helper to add cards (e.g. at game start)
  addCardToGame(roomId: string, cardData: Partial<CardObject>) {
    const game = this.games.get(roomId);
    if (!game) return;

    // @ts-ignore - aligning types roughly
    const card: CardObject = {
      instanceId: cardData.instanceId || Math.random().toString(36).substring(7),
      zone: 'library',
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
      imageUrl: '',
      controllerId: '',
      ownerId: '',
      oracleId: '',
      name: '',
      ...cardData,
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
