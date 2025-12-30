import { Tournament } from './TournamentManager';

interface Player {
  id: string;
  name: string;
  isHost: boolean;
  role: 'player' | 'spectator';
  ready?: boolean;
  deck?: any[];
  socketId?: string; // Current or last known socket
  isOffline?: boolean;
  isBot?: boolean;
  matchId?: string; // Current match in tournament
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
  basicLands?: any[];
  status: 'waiting' | 'drafting' | 'deck_building' | 'playing' | 'finished' | 'tournament';
  messages: ChatMessage[];
  maxPlayers: number;
  lastActive: number; // For persistence cleanup
  tournament?: Tournament | null;
  format?: string;
}

export class RoomManager {
  private rooms: Map<string, Room> = new Map();

  constructor() {
    // Cleanup job: Check every 5 minutes
    setInterval(() => this.cleanupRooms(), 5 * 60 * 1000);
  }

  createRoom(hostId: string, hostName: string, packs: any[], basicLands: any[] = [], socketId?: string, format: string = 'standard'): Room {
    const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    const room: Room = {
      id: roomId,
      hostId,
      players: [{ id: hostId, name: hostName, isHost: true, role: 'player', ready: false, socketId, isOffline: false }],
      packs,
      basicLands,
      format,
      status: 'waiting',
      messages: [],
      maxPlayers: hostId.startsWith('SOLO_') ? 1 : 8, // Little hack for solo testing, though 8 is fine
      lastActive: Date.now()
    };
    this.rooms.set(roomId, room);
    return room;
  }

  setPlayerReady(roomId: string, playerId: string, deck: any[]): Room | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    room.lastActive = Date.now();
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

    room.lastActive = Date.now();

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

    room.lastActive = Date.now();

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
        // Do NOT update lastActive on disconnect, or maybe we should? 
        // No, lastActive is for "when was the room last used?". Disconnect is an event, but inactivity starts from here.
        // So keeping lastActive as previous interaction time is safer?
        // Actually, if everyone disconnects now, room should be kept for 8 hours from NOW.
        // So update lastActive.
        room.lastActive = Date.now();
        return { room, playerId: player.id };
      }
    }
    return null;
  }

  leaveRoom(roomId: string, playerId: string): Room | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    room.lastActive = Date.now();

    // Logic change: Explicit leave only removes player from list if waiting.
    // If playing, mark offline (abandon).
    // NEVER DELETE ROOM HERE. Rely on cleanup.

    if (room.status === 'waiting') {
      // Normal logic: Remove player completely
      room.players = room.players.filter(p => p.id !== playerId);

      // If host leaves, assign new host from remaining players
      if (room.players.length > 0 && room.hostId === playerId) {
        const nextPlayer = room.players.find(p => p.role === 'player') || room.players[0];
        if (nextPlayer) {
          room.hostId = nextPlayer.id;
          nextPlayer.isHost = true;
        }
      }
      // If 0 players, room remains in Map until cleanup
    } else {
      // Game in progress (Drafting/Playing)
      const player = room.players.find(p => p.id === playerId);
      if (player) {
        player.isOffline = true;
        player.socketId = undefined;
      }
      console.log(`Player ${playerId} left active game in room ${roomId}. Marked as offline.`);
    }
    return room;
  }

  startGame(roomId: string): Room | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    // Logic Branch based on Format
    if (room.format === 'draft') {
      room.status = 'drafting';
    } else {
      // Commander, Standard, etc. skip drafting and go to deck building
      room.status = 'deck_building';
    }

    room.lastActive = Date.now();
    return room;
  }

  getRoom(roomId: string): Room | undefined {
    // Refresh activity if accessed? Not necessarily, only write actions.
    // But rejoining calls getRoom implicitly in join logic or index logic?
    // Let's assume write actions update lastActive.
    return this.rooms.get(roomId);
  }

  kickPlayer(roomId: string, playerId: string): Room | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    room.lastActive = Date.now();

    room.players = room.players.filter(p => p.id !== playerId);
    return room;
  }

  addMessage(roomId: string, sender: string, text: string): ChatMessage | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    room.lastActive = Date.now();

    const message: ChatMessage = {
      id: Math.random().toString(36).substring(7),
      sender,
      text,
      timestamp: new Date().toISOString()
    };
    room.messages.push(message);
    return message;
  }

  addBot(roomId: string): Room | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    room.lastActive = Date.now();

    // Check limits
    if (room.players.length >= room.maxPlayers) return null;

    const botNumber = room.players.filter(p => p.isBot).length + 1;
    const botId = `bot-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;

    const botPlayer: Player = {
      id: botId,
      name: `Bot ${botNumber}`,
      isHost: false,
      role: 'player',
      ready: true, // Bots are always ready? Or host readies them? Let's say ready for now.
      isOffline: false,
      isBot: true
    };

    room.players.push(botPlayer);
    return room;
  }

  removeBot(roomId: string, botId: string): Room | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    room.lastActive = Date.now();
    const botIndex = room.players.findIndex(p => p.id === botId && p.isBot);
    if (botIndex !== -1) {
      room.players.splice(botIndex, 1);
      return room;
    }
    return null;
  }

  getPlayerBySocket(socketId: string): { player: Player, room: Room } | null {
    for (const room of this.rooms.values()) {
      const player = room.players.find(p => p.socketId === socketId);
      if (player) {
        return { player, room };
      }
    }
    return null;
  }

  getAllRooms(): Room[] {
    return Array.from(this.rooms.values());
  }

  private cleanupRooms() {
    const now = Date.now();
    const EXPIRATION_MS = 8 * 60 * 60 * 1000; // 8 Hours

    for (const [roomId, room] of this.rooms.entries()) {
      // Logic:
      // 1. If players are online, room is active. -> Don't delete.
      // 2. If NO players are online (all offline or empty), check lastActive.

      const anyOnline = room.players.some(p => !p.isOffline);
      if (anyOnline) {
        continue; // Active
      }

      // No one online. Check expiration.
      if (now - room.lastActive > EXPIRATION_MS) {
        console.log(`Cleaning up expired room ${roomId}. Inactive for > 8 hours.`);
        this.rooms.delete(roomId);
      }
    }
  }
}
