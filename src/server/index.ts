import express, { Request, Response } from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { RoomManager } from './managers/RoomManager';
import { GameManager } from './managers/GameManager';
import { DraftManager } from './managers/DraftManager';
import { CardService } from './services/CardService';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*", // Adjust for production,
    methods: ["GET", "POST"]
  }
});

const roomManager = new RoomManager();
const gameManager = new GameManager();
const draftManager = new DraftManager();
const cardService = new CardService();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '50mb' })); // Increase limit for large card lists

// Serve static images
app.use('/cards', express.static(path.join(__dirname, 'public/cards')));

// API Routes
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

// Serve Frontend in Production
if (process.env.NODE_ENV === 'production') {
  const distPath = path.resolve(process.cwd(), 'dist');
  app.use(express.static(distPath));

}

app.post('/api/cards/cache', async (req: Request, res: Response) => {
  try {
    const { cards } = req.body;
    if (!cards || !Array.isArray(cards)) {
      res.status(400).json({ error: 'Invalid payload' });
      return;
    }

    console.log(`Caching images for ${cards.length} cards...`);
    const count = await cardService.cacheImages(cards);
    res.json({ success: true, downloaded: count });
  } catch (err: any) {
    console.error('Error in cache route:', err);
    res.status(500).json({ error: err.message });
  }
});

// Socket.IO logic
io.on('connection', (socket) => {
  console.log('A user connected', socket.id);

  // Timer management
  const playerTimers = new Map<string, NodeJS.Timeout>();

  const startAutoPickTimer = (roomId: string, playerId: string) => {
    // Clear existing if any (debounce)
    if (playerTimers.has(playerId)) {
      clearTimeout(playerTimers.get(playerId)!);
    }

    const timer = setTimeout(() => {
      console.log(`Timeout for player ${playerId}. Auto-picking...`);
      const draft = draftManager.autoPick(roomId, playerId);
      if (draft) {
        io.to(roomId).emit('draft_update', draft);
        // We only pick once. If they stay offline, the next pick depends on the next turn cycle.
        // If we wanted continuous auto-pick, we'd need to check if it's still their turn and recurse.
        // For now, this unblocks the current step.
      }
      playerTimers.delete(playerId);
    }, 30000); // 30s

    playerTimers.set(playerId, timer);
  };

  const stopAutoPickTimer = (playerId: string) => {
    if (playerTimers.has(playerId)) {
      clearTimeout(playerTimers.get(playerId)!);
      playerTimers.delete(playerId);
    }
  };

  const stopAllRoomTimers = (roomId: string) => {
    const room = roomManager.getRoom(roomId);
    if (room) {
      room.players.forEach(p => stopAutoPickTimer(p.id));
    }
  };

  const resumeRoomTimers = (roomId: string) => {
    const room = roomManager.getRoom(roomId);
    if (room && room.status === 'drafting') {
      room.players.forEach(p => {
        if (p.isOffline && p.role === 'player') {
          startAutoPickTimer(roomId, p.id);
        }
      });
    }
  };

  socket.on('create_room', ({ hostId, hostName, packs }, callback) => {
    const room = roomManager.createRoom(hostId, hostName, packs, socket.id); // Add socket.id
    socket.join(room.id);
    console.log(`Room created: ${room.id} by ${hostName}`);
    callback({ success: true, room });
  });

  socket.on('join_room', ({ roomId, playerId, playerName }, callback) => {
    const room = roomManager.joinRoom(roomId, playerId, playerName, socket.id); // Add socket.id
    if (room) {
      // Clear timeout if exists (User reconnected)
      stopAutoPickTimer(playerId);
      console.log(`Player ${playerName} reconnected. Auto-pick cancelled.`);

      socket.join(room.id);
      console.log(`Player ${playerName} joined room ${roomId}`);
      io.to(room.id).emit('room_update', room); // Broadcast update

      // Check if Host Reconnected -> Resume Game
      if (room.hostId === playerId) {
        console.log(`Host ${playerName} reconnected. Resuming draft timers.`);
        resumeRoomTimers(roomId);
      }

      // If drafting, send state immediately and include in callback
      let currentDraft = null;
      if (room.status === 'drafting') {
        currentDraft = draftManager.getDraft(roomId);
        if (currentDraft) socket.emit('draft_update', currentDraft);
      }

      callback({ success: true, room, draftState: currentDraft });
    } else {
      callback({ success: false, message: 'Room not found or full' });
    }
  });

  // RE-IMPLEMENTING rejoin_room with playerId
  socket.on('rejoin_room', ({ roomId, playerId }) => {
    socket.join(roomId);

    if (playerId) {
      // Update socket ID mapping
      const room = roomManager.updatePlayerSocket(roomId, playerId, socket.id);

      if (room) {
        // Clear Timer
        stopAutoPickTimer(playerId);
        console.log(`Player ${playerId} reconnected via rejoin.`);

        // Notify others (isOffline false)
        io.to(roomId).emit('room_update', room);

        // Check if Host Reconnected -> Resume Game
        if (room.hostId === playerId) {
          console.log(`Host ${playerId} reconnected. Resuming draft timers.`);
          resumeRoomTimers(roomId);
        }

        if (room.status === 'drafting') {
          const draft = draftManager.getDraft(roomId);
          if (draft) socket.emit('draft_update', draft);
        }
      }
    } else {
      // Just get room if no playerId? Should rare happen
      const room = roomManager.getRoom(roomId);
      if (room) socket.emit('room_update', room);
    }
  });

  socket.on('leave_room', ({ roomId, playerId }) => {
    const room = roomManager.leaveRoom(roomId, playerId);
    socket.leave(roomId);
    if (room) {
      console.log(`Player ${playerId} left room ${roomId}`);
      io.to(roomId).emit('room_update', room);
    } else {
      console.log(`Room ${roomId} closed/empty`);
    }
  });

  socket.on('send_message', ({ roomId, sender, text }) => {
    const message = roomManager.addMessage(roomId, sender, text);
    if (message) {
      io.to(roomId).emit('new_message', message);
    }
  });

  // Secure helper to get player context
  const getContext = () => roomManager.getPlayerBySocket(socket.id);

  socket.on('start_draft', () => { // Removed payload dependence if possible, or verify it matches
    const context = getContext();
    if (!context) return;
    const { room } = context;

    // Optional: Only host can start?
    // if (!player.isHost) return; 

    if (room.status === 'waiting') {
      const activePlayers = room.players.filter(p => p.role === 'player');
      if (activePlayers.length < 2) {
        // socket.emit('draft_error', { message: 'Draft cannot start. It requires at least 4 players.' });
        // return; 
      }

      const draft = draftManager.createDraft(room.id, room.players.map(p => p.id), room.packs);
      room.status = 'drafting';

      io.to(room.id).emit('room_update', room);
      io.to(room.id).emit('draft_update', draft);
    }
  });

  socket.on('pick_card', ({ cardId }) => {
    const context = getContext();
    if (!context) return;
    const { room, player } = context;

    const draft = draftManager.pickCard(room.id, player.id, cardId);
    if (draft) {
      io.to(room.id).emit('draft_update', draft);

      if (draft.status === 'deck_building') {
        room.status = 'deck_building';
        io.to(room.id).emit('room_update', room);
      }
    }
  });

  socket.on('player_ready', ({ deck }) => {
    const context = getContext();
    if (!context) return;
    const { room, player } = context;

    const updatedRoom = roomManager.setPlayerReady(room.id, player.id, deck);
    if (updatedRoom) {
      io.to(room.id).emit('room_update', updatedRoom);
      const activePlayers = updatedRoom.players.filter(p => p.role === 'player');
      if (activePlayers.length > 0 && activePlayers.every(p => p.ready)) {
        updatedRoom.status = 'playing';
        io.to(room.id).emit('room_update', updatedRoom);

        const game = gameManager.createGame(room.id, updatedRoom.players);
        activePlayers.forEach(p => {
          if (p.deck) {
            p.deck.forEach((card: any) => {
              gameManager.addCardToGame(room.id, {
                ownerId: p.id,
                controllerId: p.id,
                oracleId: card.oracle_id || card.id,
                name: card.name,
                imageUrl: card.image || card.image_uris?.normal || card.card_faces?.[0]?.image_uris?.normal || "",
                zone: 'library'
              });
            });
          }
        });
        io.to(room.id).emit('game_update', game);
      }
    }
  });

  socket.on('start_solo_test', ({ playerId, playerName, deck }, callback) => {
    // Solo test is a separate creation flow, doesn't require existing context
    const room = roomManager.createRoom(playerId, playerName, []);
    room.status = 'playing';
    socket.join(room.id);
    const game = gameManager.createGame(room.id, room.players);
    if (Array.isArray(deck)) {
      deck.forEach((card: any) => {
        gameManager.addCardToGame(room.id, {
          ownerId: playerId,
          controllerId: playerId,
          oracleId: card.id,
          name: card.name,
          imageUrl: card.image || card.image_uris?.normal || card.card_faces?.[0]?.image_uris?.normal || "",
          zone: 'library'
        });
      });
    }
    callback({ success: true, room, game });
    io.to(room.id).emit('room_update', room);
    io.to(room.id).emit('game_update', game);
  });

  socket.on('start_game', ({ decks }) => {
    const context = getContext();
    if (!context) return;
    const { room } = context;

    const updatedRoom = roomManager.startGame(room.id);
    if (updatedRoom) {
      io.to(room.id).emit('room_update', updatedRoom);
      const game = gameManager.createGame(room.id, updatedRoom.players);
      if (decks) {
        Object.entries(decks).forEach(([pid, deck]: [string, any]) => {
          // @ts-ignore
          deck.forEach(card => {
            gameManager.addCardToGame(room.id, {
              ownerId: pid,
              controllerId: pid,
              oracleId: card.oracle_id || card.id,
              name: card.name,
              imageUrl: card.image_uris?.normal || card.card_faces?.[0]?.image_uris?.normal || "",
              zone: 'library'
            });
          });
        });
      }
      io.to(room.id).emit('game_update', game);
    }
  });

  socket.on('game_action', ({ action }) => {
    const context = getContext();
    if (!context) return;
    const { room, player } = context;

    const game = gameManager.handleAction(room.id, action, player.id);
    if (game) {
      io.to(room.id).emit('game_update', game);
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected', socket.id);

    const result = roomManager.setPlayerOffline(socket.id);
    if (result) {
      const { room, playerId } = result;
      console.log(`Player ${playerId} disconnected from room ${room.id}`);

      // Notify room
      io.to(room.id).emit('room_update', room);

      if (room.status === 'drafting') {
        // Check if Host is currently offline (including self if self is host)
        // If Host is offline, PAUSE EVERYTHING.
        const hostOffline = room.players.find(p => p.id === room.hostId)?.isOffline;

        if (hostOffline) {
          console.log("Host is offline. Pausing game (stopping all timers).");
          stopAllRoomTimers(room.id);
        } else {
          // Host is online, but THIS player disconnected. Start timer for them.
          startAutoPickTimer(room.id, playerId);
        }
      }
    }
  });
});


// Handle Client-Side Routing (Catch-All) - Must be last
if (process.env.NODE_ENV === 'production') {
  app.get('*', (_req: Request, res: Response) => {
    // Check if request is for API
    if (_req.path.startsWith('/api') || _req.path.startsWith('/socket.io')) {
      return res.status(404).json({ error: 'Not found' });
    }
    const distPath = path.resolve(process.cwd(), 'dist');
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

import os from 'os';

httpServer.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);

  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]!) {
      if (iface.family === 'IPv4' && !iface.internal) {
        console.log(`  - Network IP: http://${iface.address}:${PORT}`);
      }
    }
  }
});
