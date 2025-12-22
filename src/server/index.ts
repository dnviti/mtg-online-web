import 'dotenv/config';
import express, { Request, Response } from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { RoomManager } from './managers/RoomManager';
import { GameManager } from './managers/GameManager';
import { DraftManager } from './managers/DraftManager';
import { TournamentManager } from './managers/TournamentManager';
import { CardService } from './services/CardService';
import { ScryfallService } from './services/ScryfallService';
import { PackGeneratorService } from './services/PackGeneratorService';
import { CardParserService } from './services/CardParserService';
import { PersistenceManager } from './managers/PersistenceManager';
import { RulesEngine } from './game/RulesEngine';
import { GeminiService } from './services/GeminiService';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  maxHttpBufferSize: 1024 * 1024 * 1024, // 1GB (Unlimited for practical use)
  cors: {
    origin: "*", // Adjust for production,
    methods: ["GET", "POST"]
  }
});

const roomManager = new RoomManager();
const gameManager = new GameManager();
const draftManager = new DraftManager();
const tournamentManager = new TournamentManager();
const persistenceManager = new PersistenceManager(roomManager, draftManager, gameManager);

// Game Over Listener
gameManager.on('game_over', ({ gameId, winnerId }) => {
  console.log(`[Index] Game Over received: ${gameId}, Winner: ${winnerId}`);
  // ... existing logic ...
});

// Game Update Listener (For async bot actions)
gameManager.on('game_update', (roomId, game) => {
  if (game && roomId) {
    io.to(roomId).emit('game_update', game);
  }
});

// Load previous state
persistenceManager.load();

// Auto-Save Loop (Every 5 seconds)
const persistenceInterval = setInterval(() => {
  persistenceManager.save();
}, 5000);

const cardService = new CardService();
const scryfallService = new ScryfallService();
const packGeneratorService = new PackGeneratorService();
const cardParserService = new CardParserService();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '1000mb' })); // Increase limit for large card lists

// Serve static images (Nested)
import { RedisClientManager } from './managers/RedisClientManager';
import { fileStorageManager } from './managers/FileStorageManager';

const redisForFiles = RedisClientManager.getInstance().db1;

if (redisForFiles) {
  console.log('[Server] Using Redis for file serving');
  app.get('/cards/*', async (req: Request, res: Response) => {
    const relativePath = req.path;
    const filePath = path.join(__dirname, 'public', relativePath);

    const buffer = await fileStorageManager.readFile(filePath);
    if (buffer) {
      if (filePath.endsWith('.jpg')) res.type('image/jpeg');
      else if (filePath.endsWith('.png')) res.type('image/png');
      else if (filePath.endsWith('.json')) res.type('application/json');
      res.send(buffer);
    } else {
      res.status(404).send('Not Found');
    }
  });
} else {
  console.log('[Server] Using Local FS for file serving');
  app.use('/cards', express.static(path.join(__dirname, 'public/cards')));
}

app.use('/images', express.static(path.join(__dirname, 'public/images')));

// API Routes
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

// AI Routes
app.post('/api/ai/pick', async (req: Request, res: Response) => {
  const { pack, pool, suggestion } = req.body;
  const result = await GeminiService.getInstance().generatePick(pack, pool, suggestion);
  res.json({ pick: result });
});

app.post('/api/ai/deck', async (req: Request, res: Response) => {
  const { pool, suggestion } = req.body;
  const result = await GeminiService.getInstance().generateDeck(pool, suggestion);
  res.json({ deck: result });
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
    const related = req.query.related ? (req.query.related as string).split(',') : [];
    const cards = await scryfallService.fetchSetCards(req.params.code, related);

    // Implicitly cache images for these cards so local URLs work
    if (cards.length > 0) {
      console.log(`[API] Triggering image cache for set ${req.params.code} (${cards.length} potential images)...`);
      // We await this to ensure images are ready before user views them, 
      // although it might slow down the "Fetching..." phase.
      // Given the user requirement "upon downloading metadata, also ... must be cached", we wait.
      await cardService.cacheImages(cards);
    }

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

    // Cache Images for the resolved cards
    if (uniqueCards.length > 0) {
      console.log(`[API] Triggering image cache for parsed lists (${uniqueCards.length} unique cards)...`);
      await cardService.cacheImages(uniqueCards);
    }

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
      // Force infinite card pool for Expansion mode
      if (settings) {
        settings.withReplacement = true;
      }
    }

    // Default filters if missing
    const activeFilters = filters || {
      ignoreBasicLands: false,
      ignoreCommander: false,
      ignoreTokens: false
    };

    // Fetch metadata for merging subsets
    const allSets = await scryfallService.fetchSets();
    const setsMetadata: { [code: string]: { parent_set_code?: string } } = {};
    if (allSets && Array.isArray(allSets)) {
      allSets.forEach((s: any) => {
        if (selectedSets && selectedSets.includes(s.code)) {
          setsMetadata[s.code] = { parent_set_code: s.parent_set_code };
        }
      });
    }

    const { pools, sets } = packGeneratorService.processCards(poolCards, activeFilters, setsMetadata);

    // Extract available basic lands for deck building
    const basicLands = pools.lands.filter(c => c.typeLine?.includes('Basic'));
    // Deduplicate by Scryfall ID to get unique arts
    const uniqueBasicLands: any[] = [];
    const seenLandIds = new Set();
    for (const land of basicLands) {
      if (!seenLandIds.has(land.scryfallId)) {
        seenLandIds.add(land.scryfallId);
        uniqueBasicLands.push(land);
      }
    }

    const packs = packGeneratorService.generatePacks(pools, sets, settings, numPacks || 108);
    res.json({ packs, basicLands: uniqueBasicLands });
  } catch (e: any) {
    console.error("Generation error", e);
    res.status(500).json({ error: e.message });
  }
});

// Global Draft Timer Loop
const draftInterval = setInterval(() => {
  const updates = draftManager.checkTimers();
  updates.forEach(({ roomId, draft }) => {
    io.to(roomId).emit('draft_update', draft);

    // Check for Bot Readiness Sync (Deck Building Phase)
    if (draft.status === 'deck_building') {
      const room = roomManager.getRoom(roomId);
      if (room) {
        let roomUpdated = false;

        Object.values(draft.players).forEach(dp => {
          if (dp.isBot && dp.deck && dp.deck.length > 0) {
            const roomPlayer = room.players.find(rp => rp.id === dp.id);
            // Sync if not ready
            if (roomPlayer && !roomPlayer.ready) {
              const updated = roomManager.setPlayerReady(roomId, dp.id, dp.deck);
              if (updated) roomUpdated = true;
            }
          }
        });

        if (roomUpdated) {
          io.to(roomId).emit('room_update', room);

          // Check if EVERYONE is ready to start game automatically
          const activePlayers = room.players.filter(p => p.role === 'player');
          if (activePlayers.length > 0 && activePlayers.every(p => p.ready)) {
            console.log(`All players ready (including bots) in room ${roomId}. Starting TOURNAMENT.`);
            room.status = 'tournament';
            io.to(roomId).emit('room_update', room);

            // Create Tournament
            const tournament = tournamentManager.createTournament(roomId, room.players.map(p => ({
              id: p.id,
              name: p.name,
              isBot: !!p.isBot,
              deck: p.deck
            })));

            room.tournament = tournament;
            io.to(roomId).emit('tournament_update', tournament);
          }
        }
      }
    }

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
                zone: 'library',
                typeLine: card.typeLine || card.type_line || '',
                oracleText: card.oracleText || card.oracle_text || '',
                manaCost: card.manaCost || card.mana_cost || '',
                keywords: card.keywords || [],
                damageMarked: 0,
                controlledSinceTurn: 0
              });
            });
          }
        });

        // Initialize Game State (Draw Hands)
        const engine = new RulesEngine(game);
        engine.startGame();
        gameManager.triggerBotCheck(roomId);

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

  socket.on('create_room', ({ hostId, hostName, packs, basicLands }, callback) => {
    const room = roomManager.createRoom(hostId, hostName, packs, basicLands || [], socket.id);
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

      if (room.status === 'tournament' && room.tournament) {
        socket.emit('tournament_update', room.tournament);
        // Assuming join_room is initial join, probably not in a match yet unless re-joining
      }

      callback({ success: true, room, draftState: currentDraft, tournament: room.tournament });
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

        // Prepare Game State if exists
        let currentGame = null;
        if (room.status === 'playing') {
          currentGame = gameManager.getGame(roomId);
          if (currentGame) socket.emit('game_update', currentGame);
        } else if (room.status === 'tournament') {
          if (room.tournament) {
            socket.emit('tournament_update', room.tournament);

            // If player was in a match
            // We need to check if they have a matchId in their player object
            // room.players is the source of truth
            const p = room.players.find(rp => rp.id === playerId);
            if (p && p.matchId) {
              currentGame = gameManager.getGame(p.matchId);
              if (currentGame) {
                socket.join(p.matchId); // Re-join socket room
                socket.emit('game_update', currentGame);
              }
            }
          }
        }

        // ACK Callback
        if (typeof callback === 'function') {
          callback({ success: true, room, draftState: currentDraft, gameState: currentGame, tournament: room.tournament });
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

  socket.on('add_bot', ({ roomId }) => {
    const context = getContext();
    if (!context || !context.player.isHost) return; // Verify host

    const updatedRoom = roomManager.addBot(roomId);
    if (updatedRoom) {
      io.to(roomId).emit('room_update', updatedRoom);
      console.log(`Bot added to room ${roomId}`);
    } else {
      socket.emit('error', { message: 'Failed to add bot (Room full?)' });
    }
  });

  socket.on('remove_bot', ({ roomId, botId }) => {
    const context = getContext();
    if (!context || !context.player.isHost) return; // Verify host

    const updatedRoom = roomManager.removeBot(roomId, botId);
    if (updatedRoom) {
      io.to(roomId).emit('room_update', updatedRoom);
      console.log(`Bot ${botId} removed from room ${roomId}`);
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

      const draft = draftManager.createDraft(room.id, room.players.map(p => ({ id: p.id, isBot: !!p.isBot })), room.packs, room.basicLands);
      room.status = 'drafting';

      io.to(room.id).emit('room_update', room);
      io.to(room.id).emit('draft_update', draft);
    }
  });

  socket.on('pick_card', ({ cardId }) => {
    const context = getContext();
    if (!context) return;
    const { room, player } = context;

    console.log(`[Socket] 📩 Recv pick_card: Player ${player.name} (ID: ${player.id}) picked ${cardId}`);

    const draft = draftManager.pickCard(room.id, player.id, cardId);
    if (draft) {
      io.to(room.id).emit('draft_update', draft);

      if (draft.status === 'deck_building') {
        room.status = 'deck_building';
        io.to(room.id).emit('room_update', room);

        // Logic to Sync Bot Readiness (Decks built by DraftManager)
        const currentRoom = roomManager.getRoom(room.id); // Get latest room state
        if (currentRoom) {
          Object.values(draft.players).forEach(draftPlayer => {
            if (draftPlayer.isBot && draftPlayer.deck) {
              const roomPlayer = currentRoom.players.find(rp => rp.id === draftPlayer.id);
              if (roomPlayer && !roomPlayer.ready) {
                // Mark Bot Ready!
                const updatedRoom = roomManager.setPlayerReady(room.id, draftPlayer.id, draftPlayer.deck);
                if (updatedRoom) {
                  io.to(room.id).emit('room_update', updatedRoom);
                  console.log(`Bot ${draftPlayer.id} marked ready with deck (${draftPlayer.deck.length} cards).`);
                }
              }
            }
          });
        }
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
        updatedRoom.status = 'tournament';
        io.to(room.id).emit('room_update', updatedRoom);

        const tournament = tournamentManager.createTournament(room.id, updatedRoom.players.map(p => ({
          id: p.id,
          name: p.name,
          isBot: !!p.isBot,
          deck: p.deck
        })));
        updatedRoom.tournament = tournament;
        io.to(room.id).emit('tournament_update', tournament);
      }
    }
  });

  socket.on('start_solo_test', ({ playerId, playerName, packs, basicLands }, callback) => { // Updated signature
    // Solo test -> 1 Human + 7 Bots + Start Draft
    console.log(`Starting Solo Draft for ${playerName}`);

    const room = roomManager.createRoom(playerId, playerName, packs, basicLands || [], socket.id);
    socket.join(room.id);

    // Add 7 Bots
    for (let i = 0; i < 7; i++) {
      roomManager.addBot(room.id);
    }

    // Start Draft
    const draft = draftManager.createDraft(room.id, room.players.map(p => ({ id: p.id, isBot: !!p.isBot })), room.packs, room.basicLands);
    room.status = 'drafting';

    callback({ success: true, room, draftState: draft });
    io.to(room.id).emit('room_update', room);
    io.to(room.id).emit('draft_update', draft);
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
              zone: 'library',
              typeLine: card.typeLine || card.type_line || '',
              oracleText: card.oracleText || card.oracle_text || '',
              manaCost: card.manaCost || card.mana_cost || '',
              keywords: card.keywords || [],
              power: card.power,
              toughness: card.toughness,
              damageMarked: 0,
              controlledSinceTurn: 0
            });
          });
        });
      }

      // Initialize Game State (Draw Hands)
      const engine = new RulesEngine(game);
      engine.startGame();
      gameManager.triggerBotCheck(room.id);

      io.to(room.id).emit('game_update', game);
    }
  });

  socket.on('game_action', ({ action }) => {
    const context = getContext();
    if (!context) return;
    const { room, player } = context;

    // Fix: If in a match (Tournament), actions go to matchId, not roomId
    const targetGameId = player.matchId || room.id;

    const game = gameManager.handleAction(targetGameId, action, player.id);
    if (game) {
      io.to(game.roomId).emit('game_update', game);
    }
  });

  socket.on('game_strict_action', ({ action }) => {
    const context = getContext();
    if (!context) return;
    const { room, player } = context;

    // Fix: If in a match (Tournament), actions go to matchId, not roomId
    const targetGameId = player.matchId || room.id;

    const game = gameManager.handleStrictAction(targetGameId, action, player.id);
    if (game) {
      io.to(game.roomId).emit('game_update', game);
    }
  });

  socket.on('join_match', ({ matchId }, callback) => {
    const context = getContext();
    if (!context) return;
    const { room, player } = context;

    if (!room.tournament) {
      callback({ success: false, message: "No active tournament." });
      return;
    }

    const match = tournamentManager.getMatch(room.tournament, matchId);
    if (!match) {
      callback({ success: false, message: "Match not found." });
      return;
    }

    if (match.status === 'pending') {
      callback({ success: false, message: "Match is pending." });
      return;
    }

    // Check if Game Exists (Maybe it was already created by the other player becoming ready?)
    let game = gameManager.getGame(matchId);

    // Join Socket to Match Room
    socket.join(matchId);
    player.matchId = matchId; // Track match

    // If game exists (both players already ready), send it
    if (game) {
      socket.emit('game_update', game);
    }

    callback({ success: true, match, gameCreated: !!game });
  });

  socket.on('match_ready', ({ matchId, deck }) => {
    const context = getContext();
    if (!context) return;
    const { room, player } = context;

    if (!room.tournament) return;

    const readyState = tournamentManager.setMatchReady(room.id, matchId, player.id, deck);
    if (readyState?.bothReady) {
      console.log(`[Index] Both players ready for match ${matchId}. Starting Game.`);

      const match = tournamentManager.getMatch(room.tournament, matchId);
      if (match && match.player1 && match.player2) {
        const p1 = room.players.find(p => p.id === match.player1!.id)!;
        const p2 = room.players.find(p => p.id === match.player2!.id)!;

        // Get Decks from Ready State (stored in tournament manager)
        const deck1 = readyState.decks[p1.id];
        const deck2 = readyState.decks[p2.id];

        const game = gameManager.createGame(matchId, [
          { id: p1.id, name: p1.name, isBot: p1.isBot },
          { id: p2.id, name: p2.name, isBot: p2.isBot }
        ]);

        // Populate Decks
        [{ p: p1, d: deck1 }, { p: p2, d: deck2 }].forEach(({ p, d }) => {
          if (d) {
            d.forEach((card: any) => {
              gameManager.addCardToGame(matchId, {
                ownerId: p.id,
                controllerId: p.id,
                oracleId: card.oracle_id || card.id,
                name: card.name,
                imageUrl: card.image || card.image_uris?.normal || card.card_faces?.[0]?.image_uris?.normal || "",
                zone: 'library',
                typeLine: card.typeLine || card.type_line || '',
                oracleText: card.oracleText || card.oracle_text || '',
                manaCost: card.manaCost || card.mana_cost || '',
                keywords: card.keywords || [],
                power: card.power,
                toughness: card.toughness,
                damageMarked: 0,
                controlledSinceTurn: 0
              });
            });
          }
        });

        const engine = new RulesEngine(game);
        engine.startGame();
        gameManager.triggerBotCheck(matchId);

        io.to(matchId).emit('game_update', game);
        io.to(matchId).emit('match_start', { gameId: matchId });
      }
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

const gracefulShutdown = () => {
  console.log('Received kill signal, shutting down gracefully');
  clearInterval(draftInterval);
  clearInterval(persistenceInterval);
  persistenceManager.save(); // Save on exit

  io.close(() => {
    console.log('Socket.io closed');
  });

  httpServer.close(() => {
    console.log('Closed out remaining connections');
    process.exit(0);
  });

  setTimeout(() => {
    console.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
