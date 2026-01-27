import { Tournament } from './TournamentManager';
import { StateStoreManager } from './StateStoreManager';
import { Card } from '../interfaces/DraftInterfaces';
import { CardOptimization } from '../game/engine/CardOptimization';

interface Player {
  id: string;
  name: string;
  isHost: boolean;
  role: 'player' | 'spectator';
  ready?: boolean;
  deck?: Card[];
  socketId?: string; // Current or last known socket
  isOffline?: boolean;
  isBot?: boolean;
  matchId?: string; // Current match in tournament
  pool?: Card[]; // Drafted cards
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
  closed?: boolean; // Room intentionally closed by host (for history only)
  closedBy?: string; // Player ID who closed the room
  closedAt?: number; // Timestamp when room was closed
}

export class RoomManager {
  private get store() {
    const client = StateStoreManager.getInstance().store;
    if (!client) throw new Error("State Store not initialized");
    return client;
  }

  // --- Redis Helpers ---

  private async getRoomState(roomId: string): Promise<Room | null> {
    const data = await this.store.get(`room:${roomId}`);
    return data ? JSON.parse(data) : null;
  }

  async saveRoom(room: Room) {
    await this.saveRoomState(room);
  }

  private async saveRoomState(room: Room) {
    await this.store.set(`room:${room.id}`, JSON.stringify(room));
    await this.store.sadd('active_rooms', room.id);
  }

  private async deleteRoomState(roomId: string) {
    await this.store.del(`room:${roomId}`);
    await this.store.srem('active_rooms', roomId);
  }

  private async mapSocket(socketId: string, roomId: string, playerId: string) {
    await this.store.set(`socket_map:${socketId}`, JSON.stringify({ roomId, playerId }), 86400); // 24h
  }

  private async unmapSocket(socketId: string) {
    await this.store.del(`socket_map:${socketId}`);
  }

  private async acquireLock(roomId: string): Promise<boolean> {
    return this.store.acquireLock(`lock:room:${roomId}`, 5);
  }

  private async releaseLock(roomId: string) {
    await this.store.releaseLock(`lock:room:${roomId}`);
  }

  constructor() {
    // Cleanup job: Check every 5 minutes in ONE worker only?
    // Or just let all workers compete.
    setInterval(() => this.cleanupRooms(), 5 * 60 * 1000);
  }

  // --- Methods ---

  async createRoom(hostId: string, hostName: string, packs: any[], basicLands: any[] = [], socketId?: string, format: string = 'standard'): Promise<Room> {
    console.log(`[RoomManager] createRoom called for ${hostName}`);
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
      maxPlayers: hostId.startsWith('SOLO_') ? 1 : 8,
      lastActive: Date.now(),
      closed: false
    };

    console.log(`[RoomManager] Saving room state for ${roomId}`);
    await this.saveRoomState(room);
    console.log(`[RoomManager] Room state saved for ${roomId}`);

    if (socketId) {
      console.log(`[RoomManager] Mapping socket for ${roomId}`);
      await this.mapSocket(socketId, roomId, hostId);
    }
    return room;
  }

  async setPlayerReady(roomId: string, playerId: string, deck: any[]): Promise<Room | null> {
    if (!await this.acquireLock(roomId)) return null;
    try {
      const room = await this.getRoomState(roomId);
      if (!room) return null;

      room.lastActive = Date.now();
      const player = room.players.find(p => p.id === playerId);
      if (player) {
        player.ready = true;
        // Optimize deck cards before saving
        player.deck = deck.map(c => CardOptimization.optimize(c) as any);
      }
      await this.saveRoomState(room);
      return room;
    } finally {
      await this.releaseLock(roomId);
    }
  }

  async saveDeckState(roomId: string, playerId: string, deck: Card[]): Promise<Room | null> {
    if (!await this.acquireLock(roomId)) return null;
    try {
      const room = await this.getRoomState(roomId);
      if (!room) return null;

      room.lastActive = Date.now();
      const player = room.players.find(p => p.id === playerId);
      if (player) {
        player.deck = deck.map(c => CardOptimization.optimize(c) as any);
        // Do NOT set ready=true
      }
      await this.saveRoomState(room);
      return room;
    } finally {
      await this.releaseLock(roomId);
    }
  }

  async updatePlayerPool(roomId: string, playerId: string, pool: Card[]): Promise<Room | null> {
    if (!await this.acquireLock(roomId)) return null;
    try {
      const room = await this.getRoomState(roomId);
      if (!room) return null;

      room.lastActive = Date.now();
      const player = room.players.find(p => p.id === playerId);
      if (player) {
        player.pool = pool.map(c => CardOptimization.optimize(c) as any);
      }
      await this.saveRoomState(room);
      return room;
    } finally {
      await this.releaseLock(roomId);
    }
  }

  async joinRoom(roomId: string, playerId: string, playerName: string, socketId?: string): Promise<Room | null> {
    if (!await this.acquireLock(roomId)) return null;
    try {
      const room = await this.getRoomState(roomId);
      if (!room) return null;

      // Prevent joining closed rooms
      if (room.closed) {
        console.log(`Player ${playerId} attempted to join closed room ${roomId}`);
        return null;
      }

      room.lastActive = Date.now();

      // Rejoin if already exists
      const existingPlayer = room.players.find(p => p.id === playerId);
      if (existingPlayer) {
        existingPlayer.socketId = socketId;
        existingPlayer.isOffline = false;
        await this.saveRoomState(room);
        if (socketId) await this.mapSocket(socketId, roomId, playerId);
        return room;
      }

      // Determine role
      let role: 'player' | 'spectator' = 'player';
      if (room.players.filter(p => p.role === 'player').length >= room.maxPlayers || room.status !== 'waiting') {
        role = 'spectator';
      }

      room.players.push({ id: playerId, name: playerName, isHost: false, role, socketId, isOffline: false });
      await this.saveRoomState(room);
      if (socketId) await this.mapSocket(socketId, roomId, playerId);
      return room;
    } finally {
      await this.releaseLock(roomId);
    }
  }

  // Simplified update without full lock? No, concurrency implies lock.
  async updatePlayerSocket(roomId: string, playerId: string, socketId: string): Promise<Room | null> {
    if (!await this.acquireLock(roomId)) return null;
    try {
      const room = await this.getRoomState(roomId);
      if (!room) return null;

      // Prevent reconnecting to closed rooms
      if (room.closed) {
        console.log(`Player ${playerId} attempted to reconnect to closed room ${roomId}`);
        return null;
      }

      room.lastActive = Date.now();
      const player = room.players.find(p => p.id === playerId);
      if (player) {
        player.socketId = socketId;
        player.isOffline = false;
      }
      await this.saveRoomState(room);
      await this.mapSocket(socketId, roomId, playerId);
      return room;
    } finally {
      await this.releaseLock(roomId);
    }
  }

  async setPlayerOffline(socketId: string): Promise<{ room: Room, playerId: string } | null> {
    // 1. Resolve socket map
    const mappingStr = await this.store.get(`socket_map:${socketId}`);
    if (!mappingStr) return null; // Can't find player by socket

    const { roomId, playerId } = JSON.parse(mappingStr);

    if (!await this.acquireLock(roomId)) return null;
    try {
      const room = await this.getRoomState(roomId);
      if (!room) return null;

      const player = room.players.find(p => p.id === playerId);
      if (player) {
        player.isOffline = true;
        // player.socketId = undefined; // Optional: keep last known for reconnect?
        room.lastActive = Date.now();
        await this.saveRoomState(room);
        await this.unmapSocket(socketId);
        return { room, playerId };
      }
      return null; // Should not happen if map exists
    } finally {
      await this.releaseLock(roomId);
    }
  }

  async leaveRoom(roomId: string, playerId: string): Promise<Room | null> {
    if (!await this.acquireLock(roomId)) return null;
    try {
      const room = await this.getRoomState(roomId);
      if (!room) return null;

      room.lastActive = Date.now();

      if (room.status === 'waiting') {
        room.players = room.players.filter(p => p.id !== playerId);

        if (room.players.length > 0 && room.hostId === playerId) {
          const nextPlayer = room.players.find(p => p.role === 'player') || room.players[0];
          if (nextPlayer) {
            room.hostId = nextPlayer.id;
            nextPlayer.isHost = true;
          }
        }
        // If empty, cleanup handles it later
      } else {
        const player = room.players.find(p => p.id === playerId);
        if (player) {
          player.isOffline = true;
          player.socketId = undefined;
        }
        console.log(`Player ${playerId} left active game in room ${roomId}. Marked as offline.`);
      }

      await this.saveRoomState(room);
      return room;
    } finally {
      await this.releaseLock(roomId);
    }
  }

  async closeRoom(roomId: string, playerId: string): Promise<Room | null> {
    if (!await this.acquireLock(roomId)) return null;
    try {
      const room = await this.getRoomState(roomId);
      if (!room) return null;

      // Only the host can close the room
      if (room.hostId !== playerId) {
        console.log(`Player ${playerId} attempted to close room ${roomId} but is not the host.`);
        return null;
      }

      // Mark room as closed
      room.closed = true;
      room.closedBy = playerId;
      room.closedAt = Date.now();
      room.lastActive = Date.now();

      await this.saveRoomState(room);
      console.log(`Room ${roomId} has been closed by host ${playerId}.`);
      return room;
    } finally {
      await this.releaseLock(roomId);
    }
  }

  async startGame(roomId: string): Promise<Room | null> {
    if (!await this.acquireLock(roomId)) return null;
    try {
      const room = await this.getRoomState(roomId);
      if (!room) return null;

      if (room.format === 'draft') {
        room.status = 'drafting';
      } else {
        room.status = 'deck_building';
      }
      room.lastActive = Date.now();
      await this.saveRoomState(room);
      return room;

    } finally {
      await this.releaseLock(roomId);
    }
  }

  async startTournament(roomId: string, tournament: Tournament): Promise<Room | null> {
    if (!await this.acquireLock(roomId)) return null;
    try {
      const room = await this.getRoomState(roomId);
      if (!room) return null;

      room.status = 'tournament';
      room.tournament = tournament;
      room.lastActive = Date.now();

      await this.saveRoomState(room);
      return room;
    } finally {
      await this.releaseLock(roomId);
    }
  }

  async getRoom(roomId: string): Promise<Room | null> {
    return this.getRoomState(roomId);
  }

  async kickPlayer(roomId: string, playerId: string): Promise<Room | null> {
    if (!await this.acquireLock(roomId)) return null;
    try {
      const room = await this.getRoomState(roomId);
      if (!room) return null;
      room.lastActive = Date.now();
      room.players = room.players.filter(p => p.id !== playerId);
      await this.saveRoomState(room);
      return room;
    } finally {
      await this.releaseLock(roomId);
    }
  }

  async addMessage(roomId: string, sender: string, text: string): Promise<{ message: ChatMessage, room: Room } | null> {
    if (!await this.acquireLock(roomId)) return null;
    try {
      const room = await this.getRoomState(roomId);
      if (!room) return null;
      room.lastActive = Date.now();

      const message: ChatMessage = {
        id: Math.random().toString(36).substring(7),
        sender,
        text,
        timestamp: new Date().toISOString()
      };
      room.messages.push(message);

      await this.saveRoomState(room);
      return { message, room };
    } finally {
      await this.releaseLock(roomId);
    }
  }

  async addBot(roomId: string): Promise<Room | null> {
    if (!await this.acquireLock(roomId)) return null;
    try {
      const room = await this.getRoomState(roomId);
      if (!room) return null;
      room.lastActive = Date.now();

      if (room.players.length >= room.maxPlayers) return null;

      const botNumber = room.players.filter(p => p.isBot).length + 1;
      const botId = `bot-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
      const botPlayer: Player = {
        id: botId,
        name: `Bot ${botNumber}`,
        isHost: false,
        role: 'player',
        ready: true,
        isOffline: false,
        isBot: true
      };

      room.players.push(botPlayer);
      await this.saveRoomState(room);
      return room;
    } finally {
      await this.releaseLock(roomId);
    }
  }

  async removeBot(roomId: string, botId: string): Promise<Room | null> {
    if (!await this.acquireLock(roomId)) return null;
    try {
      const room = await this.getRoomState(roomId);
      if (!room) return null;
      room.lastActive = Date.now();

      const botIndex = room.players.findIndex(p => p.id === botId && p.isBot);
      if (botIndex !== -1) {
        room.players.splice(botIndex, 1);
        await this.saveRoomState(room);
        return room;
      }
      return null;
    } finally {
      await this.releaseLock(roomId);
    }
  }

  async getPlayerBySocket(socketId: string): Promise<{ player: Player, room: Room } | null> {
    const mappingStr = await this.store.get(`socket_map:${socketId}`);
    if (!mappingStr) return null;

    const { roomId, playerId } = JSON.parse(mappingStr);
    const room = await this.getRoomState(roomId);
    if (!room) return null;

    const player = room.players.find(p => p.id === playerId);
    if (!player) return null;

    return { player, room };
  }

  async getAllRooms(): Promise<Room[]> {
    const keys = await this.store.smembers('active_rooms');
    const rooms: Room[] = [];
    for (const key of keys) {
      const r = await this.getRoomState(key);
      // Filter out closed rooms from the list
      if (r && !r.closed) rooms.push(r);
    }
    return rooms;
  }

  async findPlayerOpenRooms(playerId: string): Promise<Room[]> {
    const keys = await this.store.smembers('active_rooms');
    const openRooms: Room[] = [];

    for (const roomId of keys) {
      const room = await this.getRoomState(roomId);
      if (!room) continue;

      // Skip closed rooms
      if (room.closed) continue;

      // Check if player is in this room
      const playerInRoom = room.players.find(p => p.id === playerId);
      if (playerInRoom) {
        openRooms.push(room);
      }
    }

    return openRooms;
  }

  private async cleanupRooms() {
    // Only Try to lock 'cleanup' global key?
    // Or just let everyone cleanup. 
    // Deleting expired room is safe if atomic check.
    const now = Date.now();
    const EXPIRATION_MS = 8 * 60 * 60 * 1000;

    const keys = await this.store.smembers('active_rooms');
    for (const roomId of keys) {
      // Try lock individual room to check expiration
      if (await this.acquireLock(roomId)) {
        try {
          const room = await this.getRoomState(roomId);
          if (!room) {
            await this.deleteRoomState(roomId); // Clean dangling key
            continue;
          }

          const anyOnline = room.players.some(p => !p.isOffline);
          if (!anyOnline) {
            if (now - room.lastActive > EXPIRATION_MS) {
              console.log(`Cleaning up expired room ${roomId}.`);
              await this.deleteRoomState(roomId);
            }
          }
        } finally {
          await this.releaseLock(roomId);
        }
      }
    }
  }
}
