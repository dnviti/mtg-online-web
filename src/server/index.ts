import express, { Request, Response } from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { RoomManager } from './managers/RoomManager';
import { GameManager } from './managers/GameManager';
import { DraftManager } from './managers/DraftManager';
import { CardService } from './services/CardService';
import { ScryfallService } from './services/ScryfallService';
import { PackGeneratorService } from './services/PackGeneratorService';
import { CardParserService } from './services/CardParserService';

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
const scryfallService = new ScryfallService();
const packGeneratorService = new PackGeneratorService();
const cardParserService = new CardParserService();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '50mb' })); // Increase limit for large card lists

// Serve static images (Nested)
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

    console.log(`Caching images and metadata for ${cards.length} cards...`);
    const imgCount = await cardService.cacheImages(cards);
    const metaCount = await cardService.cacheMetadata(cards);
    res.json({ success: true, downloadedImages: imgCount, savedMetadata: metaCount });
  } catch (err: any) {
    console.error('Error in cache route:', err);
    res.status(500).json({ error: err.message });
  }
});

// --- NEW ROUTES ---

app.get('/api/sets', async (_req: Request, res: Response) => {
  const sets = await scryfallService.fetchSets();
  res.json(sets);
});

app.get('/api/sets/:code/cards', async (req: Request, res: Response) => {
  try {
    const cards = await scryfallService.fetchSetCards(req.params.code);
    res.json(cards);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/cards/parse', async (req: Request, res: Response) => {
  try {
    const { text } = req.body;
    const identifiers = cardParserService.parse(text);

    // Resolve
    const uniqueIds = identifiers.map(id => id.type === 'id' ? { id: id.value } : { name: id.value });
    const uniqueCards = await scryfallService.fetchCollection(uniqueIds);

    // Expand
    const expanded: any[] = [];
    const cardMap = new Map();
    uniqueCards.forEach(c => {
      cardMap.set(c.id, c);
      if (c.name) cardMap.set(c.name.toLowerCase(), c);
    });

    identifiers.forEach(req => {
      let card = null;
      if (req.type === 'id') card = cardMap.get(req.value);
      else card = cardMap.get(req.value.toLowerCase());

      if (card) {
        for (let i = 0; i < req.quantity; i++) {
          const clone = { ...card };
          if (req.finish) clone.finish = req.finish;
          // Add quantity to object? No, we duplicate objects in the list as requested by client flow usually
          expanded.push(clone);
        }
      }
    });

    res.json(expanded);
  } catch (e: any) {
    console.error("Parse error", e);
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/packs/generate', async (req: Request, res: Response) => {
  try {
    const { cards, settings, numPacks, sourceMode, selectedSets, filters } = req.body;

    let poolCards = cards || [];

    // If server-side expansion fetching is requested
    if (sourceMode === 'set' && selectedSets && Array.isArray(selectedSets)) {
      console.log(`[API] Fetching sets for generation: ${selectedSets.join(', ')}`);
      for (const code of selectedSets) {
        const setCards = await scryfallService.fetchSetCards(code);
        poolCards.push(...setCards);
      }
    }

    // Default filters if missing
    const activeFilters = filters || {
      ignoreBasicLands: true,
      ignoreCommander: true,
      ignoreTokens: true
    };

    const { pools, sets } = packGeneratorService.processCards(poolCards, activeFilters);

    const packs = packGeneratorService.generatePacks(pools, sets, settings, numPacks || 108);
    res.json(packs);
  } catch (e: any) {
    console.error("Generation error", e);
    res.status(500).json({ error: e.message });
  }
});

// Global Draft Timer Loop
setInterval(() => {
  const updates = draftManager.checkTimers();
  updates.forEach(({ roomId, draft }) => {
    io.to(roomId).emit('draft_update', draft);

    // Check for forced game start (Deck Building Timeout)
    if (draft.status === 'complete') {
      const room = roomManager.getRoom(roomId);
      // Only trigger if room exists and not already playing
      if (room && room.status !== 'playing') {
        console.log(`Deck building timeout for Room ${roomId}. Forcing start.`);

        // Force ready for unready players
        const activePlayers = room.players.filter(p => p.role === 'player');
        activePlayers.forEach(p => {
          if (!p.ready) {
            const pool = draft.players[p.id]?.pool || [];
            roomManager.setPlayerReady(roomId, p.id, pool);
          }
        });

        // Start Game Logic
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
}, 1000);

// Socket.IO logic
io.on('connection', (socket) => {
  console.log('A user connected', socket.id);

  // Timer management
  // Timer management removed (Global loop handled)

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
      // stopAutoPickTimer(playerId); // Global timer handles this now
      console.log(`Player ${playerName} reconnected.`);

      socket.join(room.id);
      console.log(`Player ${playerName} joined room ${roomId}`);
      io.to(room.id).emit('room_update', room); // Broadcast update

      // Check if Host Reconnected -> Resume Game
      if (room.hostId === playerId) {
        console.log(`Host ${playerName} reconnected. Resuming draft timers.`);
        draftManager.setPaused(roomId, false);
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
  socket.on('rejoin_room', ({ roomId, playerId }, callback) => {
    socket.join(roomId);

    if (playerId) {
      // Update socket ID mapping
      const room = roomManager.updatePlayerSocket(roomId, playerId, socket.id);

      if (room) {
        // Clear Timer
        // stopAutoPickTimer(playerId);
        console.log(`Player ${playerId} reconnected via rejoin.`);

        // Notify others (isOffline false)
        io.to(roomId).emit('room_update', room);

        // Check if Host Reconnected -> Resume Game
        if (room.hostId === playerId) {
          console.log(`Host ${playerId} reconnected. Resuming draft timers.`);
          draftManager.setPaused(roomId, false);
        }

        // Prepare Draft State if exists
        let currentDraft = null;
        if (room.status === 'drafting') {
          currentDraft = draftManager.getDraft(roomId);
          if (currentDraft) socket.emit('draft_update', currentDraft);
        }

        // ACK Callback
        if (typeof callback === 'function') {
          callback({ success: true, room, draftState: currentDraft });
        }
      } else {
        // Room found but player not in it? Or room not found?
        // If room exists but player not in list, it failed.
        if (typeof callback === 'function') {
          callback({ success: false, message: 'Player not found in room or room closed' });
        }
      }
    } else {
      // Missing playerId
      if (typeof callback === 'function') {
        callback({ success: false, message: 'Missing Player ID' });
      }
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

  socket.on('kick_player', ({ roomId, targetId }) => {
    const context = getContext();
    if (!context || !context.player.isHost) return; // Verify host

    // Get target socketId before removal to notify them
    // Note: getPlayerBySocket works if they are connected.
    // We might need to find target in room.players directly.
    const room = roomManager.getRoom(roomId);
    if (room) {
      const target = room.players.find(p => p.id === targetId);
      if (target) {
        const updatedRoom = roomManager.kickPlayer(roomId, targetId);
        if (updatedRoom) {
          io.to(roomId).emit('room_update', updatedRoom);
          if (target.socketId) {
            io.to(target.socketId).emit('kicked', { message: 'You have been kicked by the host.' });
          }
          console.log(`Player ${targetId} kicked from room ${roomId} by host.`);
        }
      }
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
          draftManager.setPaused(room.id, true);
        } else {
          // Host is online, but THIS player disconnected. Timer continues automatically.
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
