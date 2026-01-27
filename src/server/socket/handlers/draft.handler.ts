import { Server, Socket } from 'socket.io';
import { roomManager, draftManager, tournamentManager, scryfallService, gameManager } from '../../singletons';

export const registerDraftHandlers = (io: Server, socket: Socket) => {
  const getContext = async () => roomManager.getPlayerBySocket(socket.id);

  socket.on('start_draft', async () => {
    const context = await getContext();
    if (!context) return;
    const { room } = context;

    if (room.status === 'waiting') {
      const activePlayers = room.players.filter(p => p.role === 'player');
      if (activePlayers.length < 2) {
        // Check minimum players if needed
      }

      if (room.format === 'draft') {
        const draft = await draftManager.createDraft(room.id, room.players.map(p => ({ id: p.id, isBot: !!p.isBot })), room.packs, room.basicLands);
        room.status = 'drafting';
        await roomManager.saveRoom(room);

        io.to(room.id).emit('room_update', room);
        io.to(room.id).emit('draft_update', draft);
      } else {
        room.status = 'deck_building';
        await roomManager.saveRoom(room);
        io.to(room.id).emit('room_update', room);
      }
    }
  });

  socket.on('pick_card', async ({ cardId }) => {
    const context = await getContext();
    if (!context) return;
    const { room, player } = context;

    console.log(`[Socket] 📩 Recv pick_card: Player ${player.name} (ID: ${player.id}) picked ${cardId}`);

    const draft = await draftManager.pickCard(room.id, player.id, cardId);
    if (draft) {
      io.to(room.id).emit('draft_update', draft);

      if (draft.status === 'deck_building') {
        room.status = 'deck_building';
        await roomManager.saveRoom(room);
        io.to(room.id).emit('room_update', room);

        // Sync Bot Readiness
        const currentRoom = await roomManager.getRoom(room.id);
        if (currentRoom) {
          Object.values(draft.players).forEach(async (draftPlayer) => {
            if (draftPlayer.isBot && draftPlayer.deck) {
              const roomPlayer = currentRoom.players.find(rp => rp.id === draftPlayer.id);
              if (roomPlayer && (!roomPlayer.ready || !roomPlayer.deck || roomPlayer.deck.length === 0)) {
                const updatedRoom = await roomManager.setPlayerReady(room.id, draftPlayer.id, draftPlayer.deck);
                if (updatedRoom) {
                  io.to(room.id).emit('room_update', updatedRoom);
                  console.log(`Bot ${draftPlayer.id} marked ready with deck (${draftPlayer.deck.length} cards).`);
                }
              }
            }
          });
        }
      }
    } else {
      // Could send error to client: "Pick failed (race condition?)"
    }
  });

  socket.on('player_ready', async ({ deck }) => {
    const context = await getContext();
    if (!context) return;
    const { room, player } = context;

    console.log(`[DraftHandler] Player ${player.name} (${player.id}) submitted deck with ${deck ? deck.length : 0} cards`);

    // Validate deck is not empty
    if (!deck || !Array.isArray(deck) || deck.length === 0) {
      console.error(`[DraftHandler] ❌ Player ${player.name} submitted EMPTY deck!`);
      socket.emit('game_error', {
        message: 'Cannot submit empty deck. Please add cards to your deck.',
        userId: player.id
      });
      return;
    }

    // RE-HYDRATION FIX: Ensure server uses canonical data for image paths
    const hydratedDeck = [];
    if (deck && Array.isArray(deck)) {
      for (const card of deck) {
        // Use the scryfallId (canonical ID) to fetch metadata.
        // Fallback to card.definition.id if scryfallId missing (though it shouldn't be).
        const targetId = card.scryfallId || card.definition?.id;

        let canonicalData = null;
        if (targetId) {
          canonicalData = await scryfallService.getCachedCard(targetId);
        }

        if (canonicalData) {
          // Merge canonical data into the card, preserving instance props
          hydratedDeck.push({
            ...canonicalData, // Base properties from Scryfall (includes local_path_full)
            ...card, // Instance properties (id, count, etc.) override if needed
            // BUT: Ensure critical image paths from canonical defined in ScryfallService take precedence if missing in card
            // Actually, spread order: canonical first, then card. 
            // If 'card' has bad data (e.g. empty image_uris), it might overwrite?
            // Safer: Explicitly ensure paths.
            local_path_full: canonicalData.local_path_full || card.local_path_full,
            local_path_crop: canonicalData.local_path_crop || card.local_path_crop,
            set: canonicalData.set || card.set,
            image_uris: canonicalData.image_uris || card.image_uris,
            // Restore instance ID which is critical for game state
            id: card.id
          });
        } else {
          console.warn(`[DraftHandler] Failed to re-hydrate card ${card.name} (${targetId}). Using client data.`);
          hydratedDeck.push(card);
        }
      }
    } else {
      // Fallback if deck invalid
      console.warn("[DraftHandler] Deck received was not an array or empty.");
    }

    // Use hydratedDeck instead of raw deck
    const updatedRoom = await roomManager.setPlayerReady(room.id, player.id, hydratedDeck.length > 0 ? hydratedDeck : deck);
    if (updatedRoom) {
      io.to(room.id).emit('room_update', updatedRoom);
      const activePlayers = updatedRoom.players.filter(p => p.role === 'player');
      if (activePlayers.length > 0 && activePlayers.every(p => p.ready)) {
        // Ensure strictly > 1 total players (including bots) to make a tournament
        if (updatedRoom.players.length < 2) {
          console.warn("[DraftHandler] Not enough players for tournament.");
          return;
        }

        const tournament = tournamentManager.createTournament(room.id, updatedRoom.players.map(p => ({
          id: p.id,
          name: p.name,
          isBot: !!p.isBot,
          deck: p.deck
        })));

        updatedRoom.tournament = tournament;
        updatedRoom.status = 'tournament';

        await roomManager.saveRoom(updatedRoom);

        io.to(room.id).emit('room_update', updatedRoom);
        io.to(room.id).emit('tournament_update', tournament);
      }
    }
  });

  socket.on('start_solo_test', async ({ playerId, playerName, packs, basicLands, deck }, callback) => {
    // Handle two modes:
    // 1. Draft mode: packs and basicLands provided
    // 2. Direct game mode: deck provided

    if (deck && Array.isArray(deck) && deck.length > 0) {
      // DIRECT GAME MODE - Start game immediately with provided deck
      console.log(`[DeckTester] Starting Solo Game for ${playerName} (${playerId}) with ${deck.length} card deck`);

      const room = await roomManager.createRoom(playerId, playerName, [], [], socket.id, 'constructed');
      socket.join(room.id);
      console.log(`[DeckTester] Created room ${room.id}, human player: ${room.players[0].name} (${room.players[0].id}), isBot: ${room.players[0].isBot}`);

      // Add ONE bot opponent (not 7 for draft)
      await roomManager.addBot(room.id);
      console.log(`[DeckTester] Added bot opponent to room ${room.id}`);

      // Refresh room after adding bot
      const roomWithBot = await roomManager.getRoom(room.id);
      if (!roomWithBot) {
        if (typeof callback === 'function') callback({ success: false, message: "Failed to create room" });
        return;
      }

      // Set player deck
      const updatedRoom = await roomManager.setPlayerReady(room.id, playerId, deck);
      if (!updatedRoom) {
        if (typeof callback === 'function') callback({ success: false, message: "Failed to set player deck" });
        return;
      }
      console.log(`[DeckTester] Set deck for human player ${playerId}`);

      // Get bot player and set their deck (copy of human's deck for testing)
      const botPlayer = updatedRoom.players.find(p => p.isBot);
      if (botPlayer) {
        console.log(`[DeckTester] Found bot player: ${botPlayer.name} (${botPlayer.id}), isBot: ${botPlayer.isBot}`);
        await roomManager.setPlayerReady(room.id, botPlayer.id, deck);
        console.log(`[DeckTester] Set deck for bot player ${botPlayer.id}`);
      } else {
        console.warn(`[DeckTester] ⚠️ No bot player found in room!`);
      }

      // Refresh room after setting decks
      const readyRoom = await roomManager.getRoom(room.id);
      if (!readyRoom) {
        if (typeof callback === 'function') callback({ success: false, message: "Failed to refresh room" });
        return;
      }

      console.log(`[DeckTester] Room players after deck setup:`, readyRoom.players.map((p: any) => `${p.name} (${p.id}) isBot=${p.isBot}`));

      // Set status to 'playing' directly (skip drafting/deck_building)
      readyRoom.status = 'playing';
      await roomManager.saveRoom(readyRoom);

      io.to(readyRoom.id).emit('room_update', readyRoom);

      // Initialize game engine
      console.log(`[DeckTester] Creating game with players:`, readyRoom.players.map((p: any) => `${p.name} (${p.id}) isBot=${p.isBot}`));
      await gameManager.createGame(readyRoom.id, readyRoom.players, readyRoom.format);

      // Load decks into game (similar to game.handler.ts start_game)
      await Promise.all(readyRoom.players.map(async (p: any) => {
        if (p.deck && Array.isArray(p.deck)) {
          for (const card of p.deck) {
            // Cast to any since deck cards from client have Scryfall format
            const c = card as any;

            await gameManager.addCardToGame(readyRoom.id, {
              ownerId: p.id,
              controllerId: p.id,
              oracleId: c.oracle_id || c.id || `temp-${Math.random()}`,
              scryfallId: c.id || 'unknown',
              setCode: c.set || 'unknown',
              name: c.name || "Unknown Card",
              imageUrl: c.image_uris?.normal || "",
              imageArtCrop: c.image_uris?.art_crop || "",
              zone: 'library',
              typeLine: c.type_line || '',
              types: (c.type_line || '').split('—')[0].trim().split(' '),
              oracleText: c.oracle_text || '',
              manaCost: c.mana_cost || '',
              keywords: c.keywords || [],
              power: parseFloat(c.power || '0') || 0,
              toughness: parseFloat(c.toughness || '0') || 0,
              damageMarked: 0,
              controlledSinceTurn: 0,
              definition: {
                name: c.name,
                id: c.id,
                oracle_id: c.oracle_id,
                type_line: c.type_line,
                oracle_text: c.oracle_text,
                mana_cost: c.mana_cost,
                power: c.power,
                toughness: c.toughness,
                colors: c.colors,
                card_faces: c.card_faces,
                image_uris: c.image_uris,
                keywords: c.keywords,
                set: c.set
              }
            });
          }
        }
      }));

      // Start game (draw 7 cards, etc)
      const initializedGame = await gameManager.startGame(readyRoom.id);
      if (initializedGame) {
        console.log(`[DeckTester] Game initialized. Active player: ${initializedGame.activePlayerId}, Priority: ${initializedGame.priorityPlayerId}`);
        console.log(`[DeckTester] Game players:`, Object.values(initializedGame.players).map((p: any) => `${p.name} (${p.id}) isBot=${p.isBot}`));
        io.to(readyRoom.id).emit('game_update', initializedGame);
      }

      // Trigger bot check
      console.log(`[DeckTester] Triggering bot check...`);
      await gameManager.triggerBotCheck(readyRoom.id);

      const latestGame = await gameManager.getGame(readyRoom.id);
      if (latestGame) {
        console.log(`[DeckTester] Final game state - Active: ${latestGame.activePlayerId}, Priority: ${latestGame.priorityPlayerId}, Phase: ${latestGame.phase}, Step: ${latestGame.step}`);
        io.to(readyRoom.id).emit('game_update', latestGame);
      }

      if (typeof callback === 'function') {
        console.log(`[DeckTester] Deck tester game setup complete for room ${readyRoom.id}`);
        callback({ success: true, room: readyRoom, game: latestGame });
      }

    } else {
      // DRAFT MODE - Original behavior
      console.log(`Starting Solo Draft for ${playerName}`);

      const room = await roomManager.createRoom(playerId, playerName, packs, basicLands || [], socket.id, 'draft');
      socket.join(room.id);

      for (let i = 0; i < 7; i++) {
        await roomManager.addBot(room.id);
      }

      // Refresh room after adding bots to get correct player list
      const roomWithBots = await roomManager.getRoom(room.id);
      if (!roomWithBots) {
        if (typeof callback === 'function') callback({ success: false, message: "Failed to create room" });
        return;
      }

      const draft = await draftManager.createDraft(roomWithBots.id, roomWithBots.players.map(p => ({ id: p.id, isBot: !!p.isBot })), roomWithBots.packs, roomWithBots.basicLands);
      roomWithBots.status = 'drafting';
      await roomManager.saveRoom(roomWithBots);

      if (typeof callback === 'function') {
        callback({ success: true, room: roomWithBots, draftState: draft });
      }
      io.to(room.id).emit('room_update', roomWithBots);
      io.to(room.id).emit('draft_update', draft);
    }
  });

  socket.on('get_set_tokens', async ({ setCode }, callback) => {
    try {
      if (!setCode) {
        if (typeof callback === 'function') callback({ success: false, message: "Missing setCode" });
        return;
      }

      const tokens = await scryfallService.getTokensForSet(setCode);
      if (typeof callback === 'function') callback({ success: true, tokens });
    } catch (e: any) {
      console.error("Error getting tokens", e);
      if (typeof callback === 'function') callback({ success: false, message: e.message });
    }
  });
};
