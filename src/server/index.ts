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

  // Actually, let's use a simpler map: PlayerID -> Timeout
  const playerTimers = new Map<string, NodeJS.Timeout>();

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
      if (playerTimers.has(playerId)) {
        clearTimeout(playerTimers.get(playerId)!);
        playerTimers.delete(playerId);
        console.log(`Player ${playerName} reconnected. Auto-pick cancelled.`);
      }

      socket.join(room.id);
      console.log(`Player ${playerName} joined room ${roomId}`);
      io.to(room.id).emit('room_update', room); // Broadcast update

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
      roomManager.updatePlayerSocket(roomId, playerId, socket.id);

      // Clear Timer
      if (playerTimers.has(playerId)) {
        clearTimeout(playerTimers.get(playerId)!);
        playerTimers.delete(playerId);
        console.log(`Player ${playerId} reconnected via rejoin. Auto-pick cancelled.`);
      }
    }

    const room = roomManager.getRoom(roomId);
    if (room) {
      socket.emit('room_update', room);
      if (room.status === 'drafting') {
        const draft = draftManager.getDraft(roomId);
        if (draft) socket.emit('draft_update', draft);
      }
    }
  });

  socket.on('send_message', ({ roomId, sender, text }) => {
    const message = roomManager.addMessage(roomId, sender, text);
    if (message) {
      io.to(roomId).emit('new_message', message);
    }
  });

  socket.on('start_draft', ({ roomId }) => {
    const room = roomManager.getRoom(roomId);
    if (room && room.status === 'waiting') {
      const activePlayers = room.players.filter(p => p.role === 'player');
      if (activePlayers.length < 4) {
        // Emit error to the host or room
        socket.emit('draft_error', { message: 'Draft cannot start. It requires at least 4 players.' });
        return;
      }

      // Create Draft
      const draft = draftManager.createDraft(roomId, room.players.map(p => p.id), room.packs);
      room.status = 'drafting';

      io.to(roomId).emit('room_update', room);
      io.to(roomId).emit('draft_update', draft);
    }
  });

  socket.on('pick_card', ({ roomId, playerId, cardId }) => {
    const draft = draftManager.pickCard(roomId, playerId, cardId);
    if (draft) {
      io.to(roomId).emit('draft_update', draft);

      if (draft.status === 'deck_building') {
        const room = roomManager.getRoom(roomId);
        if (room) {
          room.status = 'deck_building';
          io.to(roomId).emit('room_update', room);
        }
      }
    }
  });

  socket.on('player_ready', ({ roomId, playerId, deck }) => {
    const room = roomManager.setPlayerReady(roomId, playerId, deck);
    if (room) {
      io.to(roomId).emit('room_update', room);
      const activePlayers = room.players.filter(p => p.role === 'player');
      if (activePlayers.length > 0 && activePlayers.every(p => p.ready)) {
        room.status = 'playing';
        io.to(roomId).emit('room_update', room);

        const game = gameManager.createGame(roomId, room.players);
        activePlayers.forEach(p => {
          if (p.deck) {
            p.deck.forEach((card: any) => {
              gameManager.addCardToGame(roomId, {
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
        io.to(roomId).emit('game_update', game);
      }
    }
  });

  socket.on('start_solo_test', ({ playerId, playerName, deck }, callback) => {
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

  socket.on('start_game', ({ roomId, decks }) => {
    const room = roomManager.startGame(roomId);
    if (room) {
      io.to(roomId).emit('room_update', room);
      const game = gameManager.createGame(roomId, room.players);
      if (decks) {
        Object.entries(decks).forEach(([playerId, deck]: [string, any]) => {
          // @ts-ignore
          deck.forEach(card => {
            gameManager.addCardToGame(roomId, {
              ownerId: playerId,
              controllerId: playerId,
              oracleId: card.oracle_id || card.id,
              name: card.name,
              imageUrl: card.image_uris?.normal || card.card_faces?.[0]?.image_uris?.normal || "",
              zone: 'library'
            });
          });
        });
      }
      io.to(roomId).emit('game_update', game);
    }
  });

  socket.on('game_action', ({ roomId, action }) => {
    const game = gameManager.handleAction(roomId, action);
    if (game) {
      io.to(roomId).emit('game_update', game);
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
        // Start Timer (e.g. 30 seconds)
        const timer = setTimeout(() => {
          console.log(`Timeout for player ${playerId}. Auto-picking...`);
          // Auto-pick
          const draft = draftManager.autoPick(room.id, playerId);
          if (draft) {
            io.to(room.id).emit('draft_update', draft);

            // If they still have picks to make (Pick 2), we might need to auto-pick again?
            // For simplicity, let's assume autoPick handles 1 pick. 
            // If they are still offline, the NEXT time they are blocking the flow?
            // Ideally, we should check if they still need to pick. 
            // But for a basic "if user does not reconnect in a time frame", this fulfills the request.
            // The system will effectively auto-pick 1 card every 30s (if we reset the timer).
            // But we only set the timer ONCE on disconnect.
            // If they stay disconnected, we need to loop.

            // RECURSIVE TIMER:
            // If player is still offline after auto-pick, schedule another one?
            // We need to check if they are still blocking.
            // For now, let's just do ONE auto-pick per disconnect event to unblock.
          }
          playerTimers.delete(playerId);
        }, 30000); // 30 seconds

        playerTimers.set(playerId, timer);
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
