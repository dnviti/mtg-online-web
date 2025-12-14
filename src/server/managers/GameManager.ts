
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
  maxZ: number; // Tracker for depth sorting
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
      maxZ: 100,
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
      case 'FLIP_CARD':
        this.flipCard(game, action);
        break;
      case 'ADD_COUNTER':
        this.addCounter(game, action);
        break;
      case 'CREATE_TOKEN':
        this.createToken(game, action);
        break;
      case 'DELETE_CARD':
        this.deleteCard(game, action);
        break;
      case 'UPDATE_LIFE':
        this.updateLife(game, action);
        break;
      case 'DRAW_CARD':
        this.drawCard(game, action);
        break;
      case 'SHUFFLE_LIBRARY':
        this.shuffleLibrary(game, action);
        break;
    }

    return game;
  }

  private moveCard(game: GameState, action: { cardId: string; toZone: CardInstance['zone']; position?: { x: number, y: number } }) {
    const card = game.cards[action.cardId];
    if (card) {
      // Bring to front
      card.position.z = ++game.maxZ;

      card.zone = action.toZone;
      if (action.position) {
        card.position = { ...card.position, ...action.position };
      }

      // Auto-untap and reveal if moving to public zones (optional, but helpful default)
      if (['hand', 'graveyard', 'exile'].includes(action.toZone)) {
        card.tapped = false;
        card.faceDown = false;
      }
      // Library is usually face down
      if (action.toZone === 'library') {
        card.faceDown = true;
        card.tapped = false;
      }
    }
  }

  private addCounter(game: GameState, action: { cardId: string; counterType: string; amount: number }) {
    const card = game.cards[action.cardId];
    if (card) {
      const existing = card.counters.find(c => c.type === action.counterType);
      if (existing) {
        existing.count += action.amount;
        // Remove if 0 or less? Usually yes for counters like +1/+1 but let's just keep logic simple
        if (existing.count <= 0) {
          card.counters = card.counters.filter(c => c.type !== action.counterType);
        }
      } else if (action.amount > 0) {
        card.counters.push({ type: action.counterType, count: action.amount });
      }
    }
  }

  private createToken(game: GameState, action: { ownerId: string; tokenData: any; position?: { x: number, y: number } }) {
    const tokenId = `token-${Math.random().toString(36).substring(7)}`;
    // @ts-ignore
    const token: CardInstance = {
      instanceId: tokenId,
      oracleId: 'token',
      name: action.tokenData.name || 'Token',
      imageUrl: action.tokenData.imageUrl || 'https://cards.scryfall.io/large/front/5/f/5f75e883-2574-4b9e-8fcb-5db3d9579fae.jpg?1692233606', // Generic token image
      controllerId: action.ownerId,
      ownerId: action.ownerId,
      zone: 'battlefield',
      tapped: false,
      faceDown: false,
      position: {
        x: action.position?.x || 50,
        y: action.position?.y || 50,
        z: ++game.maxZ
      },
      counters: [],
      ptModification: { power: action.tokenData.power || 0, toughness: action.tokenData.toughness || 0 }
    };
    game.cards[tokenId] = token;
  }

  private deleteCard(game: GameState, action: { cardId: string }) {
    if (game.cards[action.cardId]) {
      delete game.cards[action.cardId];
    }
  }

  private tapCard(game: GameState, action: { cardId: string }) {
    const card = game.cards[action.cardId];
    if (card) {
      card.tapped = !card.tapped;
    }
  }

  private flipCard(game: GameState, action: { cardId: string }) {
    const card = game.cards[action.cardId];
    if (card) {
      // Bring to front on flip too
      card.position.z = ++game.maxZ;
      card.faceDown = !card.faceDown;
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
      // Pick random one (simulating shuffle for now)
      const randomIndex = Math.floor(Math.random() * libraryCards.length);
      const card = libraryCards[randomIndex];

      card.zone = 'hand';
      card.faceDown = false;
      card.position.z = ++game.maxZ;
    }
  }

  private shuffleLibrary(_game: GameState, _action: { playerId: string }) {
    // No-op in current logic since we pick randomly
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
