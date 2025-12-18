
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
        hasPassed: false
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

      phase: 'beginning',
      step: 'untap', // Will be skipped/advanced immediately on start usually

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
          engine.playLand(actorId, action.cardId);
          break;
        case 'CAST_SPELL':
          engine.castSpell(actorId, action.cardId, action.targets);
          break;
        // TODO: Activate Ability
        default:
          console.warn(`Unknown strict action: ${action.type}`);
          return null;
      }
    } catch (e: any) {
      console.error(`Rule Violation [${action.type}]: ${e.message}`);
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
    if (!game.players[actorId]) return null;

    switch (action.type) {
      case 'MOVE_CARD':
        this.moveCard(game, action, actorId);
        break;
      case 'TAP_CARD':
        this.tapCard(game, action, actorId);
        break;
      // ... (Other cases can be ported if needed)
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
      card.tapped = !card.tapped;
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
      ...cardData
    };
    game.cards[card.instanceId] = card;
  }
}
