interface Player {
  id: string;
  name: string;
  isHost: boolean;
  role: 'player' | 'spectator';
  ready?: boolean;
  deck?: any[];
  socketId?: string; // Current or last known socket
  isOffline?: boolean;
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
  status: 'waiting' | 'drafting' | 'deck_building' | 'playing' | 'finished';
  messages: ChatMessage[];
  maxPlayers: number;
}

export class RoomManager {
  private rooms: Map<string, Room> = new Map();

  createRoom(hostId: string, hostName: string, packs: any[], socketId?: string): Room {
    const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    const room: Room = {
      id: roomId,
      hostId,
      players: [{ id: hostId, name: hostName, isHost: true, role: 'player', ready: false, socketId, isOffline: false }],
      packs,
      status: 'waiting',
      messages: [],
      maxPlayers: 8
    };
    this.rooms.set(roomId, room);
    return room;
  }

  setPlayerReady(roomId: string, playerId: string, deck: any[]): Room | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    const player = room.players.find(p => p.id === playerId);
    if (player) {
      player.ready = true;
      player.deck = deck;
    }
    return room;
  }

  joinRoom(roomId: string, playerId: string, playerName: string, socketId?: string): Room | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    // Rejoin if already exists
    const existingPlayer = room.players.find(p => p.id === playerId);
    if (existingPlayer) {
      existingPlayer.socketId = socketId;
      existingPlayer.isOffline = false;
      return room;
    }

    // Determine role
    let role: 'player' | 'spectator' = 'player';
    if (room.players.filter(p => p.role === 'player').length >= room.maxPlayers || room.status !== 'waiting') {
      role = 'spectator';
    }

    room.players.push({ id: playerId, name: playerName, isHost: false, role, socketId, isOffline: false });
    return room;
  }

  updatePlayerSocket(roomId: string, playerId: string, socketId: string): Room | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    const player = room.players.find(p => p.id === playerId);
    if (player) {
      player.socketId = socketId;
      player.isOffline = false;
    }
    return room;
  }

  setPlayerOffline(socketId: string): { room: Room, playerId: string } | null {
    // Find room and player by socketId (inefficient but works for now)
    for (const room of this.rooms.values()) {
      const player = room.players.find(p => p.socketId === socketId);
      if (player) {
        player.isOffline = true;
        return { room, playerId: player.id };
      }
    }
    return null;
  }

  leaveRoom(roomId: string, playerId: string): Room | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    if (room.status === 'waiting') {
      // Normal logic: Remove player completely
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
    } else {
      // Game in progress (Drafting/Playing)
      // DO NOT REMOVE PLAYER. Just mark offline.
      // This allows them to rejoin and reclaim their seat (and deck).
      const player = room.players.find(p => p.id === playerId);
      if (player) {
        player.isOffline = true;
        // Note: socketId is already handled by disconnect event usually, but if explicit leave, we should clear it?
        player.socketId = undefined;
      }
      console.log(`Player ${playerId} left active game in room ${roomId}. Marked as offline.`);
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

  kickPlayer(roomId: string, playerId: string): Room | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    room.players = room.players.filter(p => p.id !== playerId);

    // If game was running, we might need more cleanup, but for now just removal.
    return room;
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

  getPlayerBySocket(socketId: string): { player: Player, room: Room } | null {
    // Inefficient linear search, but robust for now. Maps would be better for high scale.
    for (const room of this.rooms.values()) {
      const player = room.players.find(p => p.socketId === socketId);
      if (player) {
        return { player, room };
      }
    }
    return null;
  }
}
