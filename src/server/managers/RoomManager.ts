interface Player {
  id: string;
  name: string;
  isHost: boolean;
  role: 'player' | 'spectator';
}

interface ChatMessage {
  id: string;
  sender: string;
  text: string;
  timestamp: string;
}

interface Room {
  id: string;
  hostId: string;
  players: Player[];
  packs: any[]; // Store generated packs (JSON)
  status: 'waiting' | 'drafting' | 'deck_building' | 'finished';
  messages: ChatMessage[];
  maxPlayers: number;
}

export class RoomManager {
  private rooms: Map<string, Room> = new Map();

  createRoom(hostId: string, hostName: string, packs: any[]): Room {
    const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    const room: Room = {
      id: roomId,
      hostId,
      players: [{ id: hostId, name: hostName, isHost: true, role: 'player' }],
      packs,
      status: 'waiting',
      messages: [],
      maxPlayers: 8
    };
    this.rooms.set(roomId, room);
    return room;
  }

  joinRoom(roomId: string, playerId: string, playerName: string): Room | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    // Rejoin if already exists
    const existingPlayer = room.players.find(p => p.id === playerId);
    if (existingPlayer) {
      return room;
    }

    // Determine role
    let role: 'player' | 'spectator' = 'player';
    if (room.players.filter(p => p.role === 'player').length >= room.maxPlayers || room.status !== 'waiting') {
      role = 'spectator';
    }

    room.players.push({ id: playerId, name: playerName, isHost: false, role });
    return room;
  }

  leaveRoom(roomId: string, playerId: string): Room | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    room.players = room.players.filter(p => p.id !== playerId);

    // If host leaves, assign new host from remaining players
    if (room.players.length === 0) {
      this.rooms.delete(roomId);
      return null;
    } else if (room.hostId === playerId) {
      const nextPlayer = room.players.find(p => p.role === 'player') || room.players[0];
      if (nextPlayer) {
        room.hostId = nextPlayer.id;
        nextPlayer.isHost = true;
      }
    }
    return room;
  }

  startGame(roomId: string): Room | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    room.status = 'drafting';
    return room;
  }

  getRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  addMessage(roomId: string, sender: string, text: string): ChatMessage | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    const message: ChatMessage = {
      id: Math.random().toString(36).substring(7),
      sender,
      text,
      timestamp: new Date().toISOString()
    };
    room.messages.push(message);
    return message;
  }
}
