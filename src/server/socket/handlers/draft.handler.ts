import { Server, Socket } from 'socket.io';
import { roomManager, draftManager, tournamentManager, scryfallService, gameManager, cardService } from '../../singletons';

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
        const draft = await draftManager.createDraft(room.id, room.players.map(p => ({ id: p.id })), room.packs, room.basicLands);
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

  /**
   * Start a test game - supports three modes:
   * 1. Playtest mode (playtest: true): Single player testing their deck alone
   * 2. Joinable room mode (deck provided, no playtest): Creates an online room others can join
   * 3. Draft mode (packs provided): Creates a draft room for online players to join
   */
  socket.on('start_solo_test', async ({ playerId, playerName, packs, basicLands, deck, playtest }, callback) => {
    if (deck && Array.isArray(deck) && deck.length > 0) {
      if (playtest) {
        // PLAYTEST MODE - Single player testing their deck alone
        console.log(`[Playtest] Starting playtest for ${playerName} (${playerId}) with ${deck.length} card deck`);

        const room = await roomManager.createRoom(playerId, playerName, [], [], socket.id, 'playtest');
        socket.join(room.id);

        // Set player deck
        const updatedRoom = await roomManager.setPlayerReady(room.id, playerId, deck);
        if (!updatedRoom) {
          if (typeof callback === 'function') callback({ success: false, message: "Failed to set player deck" });
          return;
        }

        // Set status to 'playing' directly
        updatedRoom.status = 'playing';
        await roomManager.saveRoom(updatedRoom);

        io.to(updatedRoom.id).emit('room_update', updatedRoom);

        // Initialize game engine with single player
        console.log(`[Playtest] Creating single-player game for ${playerName}`);
        await gameManager.createGame(updatedRoom.id, updatedRoom.players, updatedRoom.format);

        // Load deck into game
        for (const card of deck) {
          const c = card as any;
          await gameManager.addCardToGame(updatedRoom.id, {
            ownerId: playerId,
            controllerId: playerId,
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

        // Cache tokens
        const allSetCodes = new Set<string>();
        deck.forEach((c: any) => {
          const setCode = c.setCode || c.set || c.definition?.set;
          if (setCode) allSetCodes.add(setCode.toLowerCase());
        });

        if (allSetCodes.size > 0) {
          const primarySetCode = Array.from(allSetCodes)[0];
          try {
            const tokens = await scryfallService.getTokensForSet(primarySetCode);
            if (tokens.length > 0) {
              const cachedCount = await cardService.cacheImages(tokens);
              if (cachedCount > 0) {
                console.log(`[Playtest] Downloaded ${cachedCount} token images for set ${primarySetCode}`);
              }
              await gameManager.cacheTokensForGame(updatedRoom.id, primarySetCode, tokens);
            }
          } catch (e) {
            console.warn(`[Playtest] Failed to cache tokens:`, e);
          }
        }

        // Start game
        const initializedGame = await gameManager.startGame(updatedRoom.id);
        if (initializedGame) {
          console.log(`[Playtest] Game initialized for ${playerName}`);
          io.to(updatedRoom.id).emit('game_update', initializedGame);
        }

        if (typeof callback === 'function') {
          callback({ success: true, room: updatedRoom, game: initializedGame, playtest: true });
        }

      } else {
        // JOINABLE ROOM MODE - Create online room for deck testing that others can join
        console.log(`[DeckTester] Creating joinable room for ${playerName} (${playerId}) with ${deck.length} card deck`);

        const room = await roomManager.createRoom(playerId, playerName, [], [], socket.id, 'constructed');
        socket.join(room.id);

        // Set player deck and mark ready
        const updatedRoom = await roomManager.setPlayerReady(room.id, playerId, deck);
        if (!updatedRoom) {
          if (typeof callback === 'function') callback({ success: false, message: "Failed to set player deck" });
          return;
        }

        // Keep room in 'waiting' status so other players can join
        console.log(`[DeckTester] Created joinable room ${room.id} - waiting for opponent to join`);

        io.to(room.id).emit('room_update', updatedRoom);

        if (typeof callback === 'function') {
          callback({
            success: true,
            room: updatedRoom,
            roomId: room.id,
            message: `Room created! Share room code: ${room.id}`
          });
        }
      }

    } else if (packs && Array.isArray(packs) && packs.length > 0) {
      // DRAFT MODE - Create joinable draft room (no bots, wait for players)
      console.log(`[Draft] Creating joinable draft room for ${playerName}`);

      const room = await roomManager.createRoom(playerId, playerName, packs, basicLands || [], socket.id, 'draft');
      socket.join(room.id);

      // Keep room in 'waiting' status for other players to join
      console.log(`[Draft] Created joinable draft room ${room.id} - waiting for players to join`);

      if (typeof callback === 'function') {
        callback({
          success: true,
          room,
          roomId: room.id,
          message: `Draft room created! Share room code: ${room.id}`
        });
      }
      io.to(room.id).emit('room_update', room);

    } else {
      if (typeof callback === 'function') {
        callback({ success: false, message: "Must provide either a deck or packs to start a game" });
      }
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
