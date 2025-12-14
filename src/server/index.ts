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

  socket.on('create_room', ({ hostId, hostName, packs }, callback) => {
    const room = roomManager.createRoom(hostId, hostName, packs);
    socket.join(room.id);
    console.log(`Room created: ${room.id} by ${hostName}`);
    callback({ success: true, room });
  });

  socket.on('join_room', ({ roomId, playerId, playerName }, callback) => {
    const room = roomManager.joinRoom(roomId, playerId, playerName);
    if (room) {
      socket.join(room.id);
      console.log(`Player ${playerName} joined room ${roomId}`);
      io.to(room.id).emit('room_update', room); // Broadcast update
      callback({ success: true, room });
    } else {
      callback({ success: false, message: 'Room not found or full' });
    }
  });

  socket.on('rejoin_room', ({ roomId }) => {
    // Just rejoin the socket channel if validation passes (not fully secure yet)
    socket.join(roomId);
    const room = roomManager.getRoom(roomId);
    if (room) socket.emit('room_update', room);
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
      // Create Draft
      // All packs in room.packs need to be flat list or handled
      // room.packs is currently JSON.
      const draft = draftManager.createDraft(roomId, room.players.map(p => p.id), room.packs);
      room.status = 'drafting';

      io.to(roomId).emit('room_update', room);
      io.to(roomId).emit('draft_update', draft);
    }
  });

  // Revised pick_card to actual impl
  socket.on('pick_card', ({ roomId, playerId, cardId }) => {
    const draft = draftManager.pickCard(roomId, playerId, cardId);
    if (draft) {
      io.to(roomId).emit('draft_update', draft);

      if (draft.status === 'deck_building') {
        // Notify room
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

      // Check if all active players are ready
      const activePlayers = room.players.filter(p => p.role === 'player');
      if (activePlayers.length > 0 && activePlayers.every(p => p.ready)) {
        console.log(`All players ready in room ${roomId}. Starting game...`);

        room.status = 'playing';
        io.to(roomId).emit('room_update', room);

        // Initialize Game
        const game = gameManager.createGame(roomId, room.players);

        // Load decks
        activePlayers.forEach(p => {
          if (p.deck) {
            p.deck.forEach((card: any) => {
              gameManager.addCardToGame(roomId, {
                ownerId: p.id,
                controllerId: p.id,
                oracleId: card.oracle_id || card.id,
                name: card.name,
                // Prioritize 'image' property which might hold the cached URL
                imageUrl: card.image || card.image_uris?.normal || card.card_faces?.[0]?.image_uris?.normal || "",
                zone: 'library'
              });
            });
            // TODO: Shuffle library
          }
        });

        io.to(roomId).emit('game_update', game);
      }
    }
  });

  socket.on('start_game', ({ roomId, decks }) => {
    const room = roomManager.startGame(roomId);
    if (room) {
      io.to(roomId).emit('room_update', room);

      // Initialize Game
      const game = gameManager.createGame(roomId, room.players);
      // If decks are provided, load them
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
              zone: 'library' // Start in library
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
    // TODO: Handle player disconnect (mark as offline but don't kick immediately)
  });
});

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
