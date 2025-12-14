
interface CardInstance {
  instanceId: string;
  oracleId: string; // Scryfall ID
  name: string;
  imageUrl: string;
  controllerId: string;
  ownerId: string;
  zone: 'library' | 'hand' | 'battlefield' | 'graveyard' | 'exile' | 'command';
  tapped: boolean;
  faceDown: boolean;
  position: { x: number; y: number; z: number }; // For freeform placement
  counters: { type: string; count: number }[];
  ptModification: { power: number; toughness: number };
}

interface PlayerState {
  id: string;
  name: string;
  life: number;
  poison: number;
  energy: number;
  isActive: boolean;
}

interface GameState {
  roomId: string;
  players: Record<string, PlayerState>;
  cards: Record<string, CardInstance>; // Keyed by instanceId
  order: string[]; // Turn order (player IDs)
  turn: number;
  phase: string;
}

export class GameManager {
  private games: Map<string, GameState> = new Map();

  createGame(roomId: string, players: { id: string; name: string }[]): GameState {
    const gameState: GameState = {
      roomId,
      players: {},
      cards: {},
      order: players.map(p => p.id),
      turn: 1,
      phase: 'beginning',
    };

    players.forEach(p => {
      gameState.players[p.id] = {
        id: p.id,
        name: p.name,
        life: 20,
        poison: 0,
        energy: 0,
        isActive: false
      };
    });

    // Set first player active
    if (gameState.order.length > 0) {
      gameState.players[gameState.order[0]].isActive = true;
    }

    // TODO: Load decks here. For now, we start with empty board/library.

    this.games.set(roomId, gameState);
    return gameState;
  }

  getGame(roomId: string): GameState | undefined {
    return this.games.get(roomId);
  }

  // Generic action handler for sandbox mode
  handleAction(roomId: string, action: any): GameState | null {
    const game = this.games.get(roomId);
    if (!game) return null;

    switch (action.type) {
      case 'MOVE_CARD':
        this.moveCard(game, action);
        break;
      case 'TAP_CARD':
        this.tapCard(game, action);
        break;
      case 'UPDATE_LIFE':
        this.updateLife(game, action);
        break;
      case 'DRAW_CARD':
        this.drawCard(game, action);
        break;
      case 'SHUFFLE_LIBRARY':
        this.shuffleLibrary(game, action); // Placeholder logic
        break;
    }

    return game;
  }

  private moveCard(game: GameState, action: { cardId: string; toZone: CardInstance['zone']; position?: { x: number, y: number } }) {
    const card = game.cards[action.cardId];
    if (card) {
      card.zone = action.toZone;
      if (action.position) {
        card.position = { ...card.position, ...action.position };
      }
      // Reset tapped state if moving to hand/library/graveyard?
      if (['hand', 'library', 'graveyard', 'exile'].includes(action.toZone)) {
        card.tapped = false;
        card.faceDown = action.toZone === 'library';
      }
    }
  }

  private tapCard(game: GameState, action: { cardId: string }) {
    const card = game.cards[action.cardId];
    if (card) {
      card.tapped = !card.tapped;
    }
  }

  private updateLife(game: GameState, action: { playerId: string; amount: number }) {
    const player = game.players[action.playerId];
    if (player) {
      player.life += action.amount;
    }
  }

  private drawCard(game: GameState, action: { playerId: string }) {
    // Find top card of library for this player
    const libraryCards = Object.values(game.cards).filter(c => c.ownerId === action.playerId && c.zone === 'library');
    if (libraryCards.length > 0) {
      // In a real implementation this should be ordered.
      // For now, just pick one (random or first).
      const card = libraryCards[0];
      card.zone = 'hand';
      card.faceDown = false;
    }
  }

  private shuffleLibrary(_game: GameState, _action: { playerId: string }) {
    // In a real implementation we would shuffle the order array.
    // Since we retrieve by filtering currently, we don't have order. 
    // We need to implement order index if we want shuffling.
  }

  // Helper to add cards (e.g. at game start)
  addCardToGame(roomId: string, cardData: Partial<CardInstance>) {
    const game = this.games.get(roomId);
    if (!game) return;

    // @ts-ignore
    const card: CardInstance = {
      instanceId: cardData.instanceId || Math.random().toString(36).substring(7),
      zone: 'library',
      tapped: false,
      faceDown: true,
      position: { x: 0, y: 0, z: 0 },
      counters: [],
      ptModification: { power: 0, toughness: 0 },
      ...cardData
    };
    game.cards[card.instanceId] = card;
  }
}
