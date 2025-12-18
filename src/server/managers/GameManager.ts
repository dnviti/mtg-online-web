
import { StrictGameState, PlayerState, CardObject } from '../game/types';
import { RulesEngine } from '../game/RulesEngine';

export class GameManager {
  public games: Map<string, StrictGameState> = new Map();

  createGame(roomId: string, players: { id: string; name: string }[]): StrictGameState {

    // Convert array to map
    const playerRecord: Record<string, PlayerState> = {};
    players.forEach(p => {
      playerRecord[p.id] = {
        id: p.id,
        name: p.name,
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

    return game;
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
