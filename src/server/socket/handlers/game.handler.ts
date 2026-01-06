import { Server, Socket } from 'socket.io';
import { roomManager, gameManager, scryfallService } from '../../singletons';

export const registerGameHandlers = (io: Server, socket: Socket) => {
  const getContext = () => roomManager.getPlayerBySocket(socket.id);

  socket.on('start_game', async ({ decks }) => {
    const context = await getContext();
    if (!context) return;
    const { room } = context;

    const updatedRoom = await roomManager.startGame(room.id);
    if (updatedRoom) {
      io.to(room.id).emit('room_update', updatedRoom);
      await gameManager.createGame(room.id, updatedRoom.players, updatedRoom.format);

      // 1. Gather all Scryfall IDs from all decks
      const allIdentifiers: { id: string }[] = [];
      updatedRoom.players.forEach(p => {
        const finalDeck = (decks && decks[p.id]) ? decks[p.id] : p.deck;
        if (finalDeck && Array.isArray(finalDeck)) {
          finalDeck.forEach((card: any) => {
            // Prioritize explicit scryfallId, then id, then try to parse from metadata
            let id = card.scryfallId || card.id || card.definition?.id;
            if (id) allIdentifiers.push({ id });
          });
        }
      });

      // 2. Bulk fetch authoritative data
      console.log(`[GameStart] Fetching authoritative data for ${allIdentifiers.length} cards...`);
      const authoritativeCards = await scryfallService.fetchCollection(allIdentifiers);
      const cardMap = new Map(authoritativeCards.map(c => [c.id, c]));
      console.log(`[GameStart] Resolved ${cardMap.size} unique cards from service.`);

      // Load decks for all players
      await Promise.all(updatedRoom.players.map(async p => {
        let finalDeck = (decks && decks[p.id]) ? decks[p.id] : p.deck;

        if (finalDeck && Array.isArray(finalDeck)) {
          console.log(`[GameStart] Loading deck for ${p.name} (${p.id}): ${finalDeck.length} cards.`);

          // Add cards sequentially to avoid race conditions or DB overload
          for (const card of finalDeck) {

            // Resolve ID
            let setCode = card.setCode || card.set || card.definition?.set;
            let scryfallId = card.scryfallId || card.id || card.definition?.id;

            if ((!setCode || !scryfallId) && card.imageUrl && card.imageUrl.includes('/cards/images/')) {
              const parts = card.imageUrl.split('/cards/images/');
              if (parts[1]) {
                const pathParts = parts[1].split('/');
                if (!setCode) setCode = pathParts[0];
                if (!scryfallId) {
                  const filename = pathParts[pathParts.length - 1]; // uuid.jpg
                  scryfallId = filename.replace(/\.(jpg|png)$/, '');
                }
              }
            }

            // --- AUTHORITATIVE DATA MERGE ---
            // Use the fetched Scryfall data to populate definition
            const authCard = cardMap.get(scryfallId);
            if (authCard) {
              // If we found the card in Scryfall Service, use it as the source of truth
              // We construct a definition on the fly from the reliable data if one doesn't exist 
              // OR we prioritize the auth data over the potentially weak client data
              card.definition = {
                name: authCard.name,
                id: authCard.id,
                oracle_id: authCard.oracle_id,
                type_line: authCard.type_line,
                oracle_text: authCard.oracle_text || (authCard.card_faces ? authCard.card_faces[0].oracle_text : ''),
                mana_cost: authCard.mana_cost || (authCard.card_faces ? authCard.card_faces[0].mana_cost : ''),
                power: authCard.power,
                toughness: authCard.toughness,
                colors: authCard.colors,
                card_faces: authCard.card_faces,
                image_uris: authCard.image_uris,
                keywords: authCard.keywords || [],
                set: authCard.set,
                ...card.definition, // Keep extra props
                // Force authoritative paths from Redis
                local_path_full: authCard.local_path_full,
                local_path_crop: authCard.local_path_crop
              };
            }

            // Normalize definition if STILL missing (fallback to old logic)
            if (!card.definition) {
              card.definition = {
                name: card.name,
                id: card.id,
                oracle_id: card.oracle_id || card.oracleId,
                type_line: card.type_line || card.typeLine,
                oracle_text: card.oracle_text || card.oracleText,
                mana_cost: card.mana_cost || card.manaCost,
                power: card.power?.toString(),
                toughness: card.toughness?.toString(),
                colors: card.colors,
                card_faces: card.card_faces || card.cardFaces,
                image_uris: card.image_uris,
                keywords: card.keywords,
                set: card.set || card.setCode
              };
            }



            // Console log strict validation
            // console.log(`[DeckLoad] Adding ${card.name} (${scryfallId}) for ${p.name}`);

            await gameManager.addCardToGame(room.id, {
              ownerId: p.id,
              controllerId: p.id,
              oracleId: card.oracle_id || card.id || card.definition?.oracle_id || `temp-${Math.random()}`,
              scryfallId: scryfallId || 'unknown',
              setCode: setCode || 'unknown',
              name: card.name || card.definition?.name || "Unknown Card",
              imageUrl: card.definition?.local_path_full || ((setCode && scryfallId) ? "" : (card.image_uris?.normal || card.image_uris?.large || card.image_uris?.png || "")),
              imageArtCrop: card.definition?.local_path_crop || card.image_uris?.art_crop || card.image_uris?.crop || card.imageArtCrop || "",
              zone: 'library',
              typeLine: card.typeLine || card.type_line || card.definition?.type_line || '',
              types: card.types || (card.typeLine || card.type_line || card.definition?.type_line || '').split('—')[0].trim().split(' '),
              oracleText: card.oracleText || card.oracle_text || card.definition?.oracle_text || '',
              manaCost: card.manaCost || card.mana_cost || card.definition?.mana_cost || '',
              keywords: card.keywords || card.definition?.keywords || [],
              power: (typeof card.power === 'number' ? card.power : parseFloat(card.power || card.definition?.power || '0')) || 0,
              toughness: (typeof card.toughness === 'number' ? card.toughness : parseFloat(card.toughness || card.definition?.toughness || '0')) || 0,
              damageMarked: 0,
              controlledSinceTurn: 0,
              definition: card.definition
            });
          }
          // Shuffle Library after loading
          // Actually Utils might shuffle, but currently shuffling happens in Mulligan logic? 
          // No, usually library is shuffled at start. 
          // But strict game state doesn't have an explicit shuffle action here yet. 
          // The RulesEngine.startGame() might handle it if I add it, or just rely on random Draw.
          // For now, random draw is fine or let startGame handle it.
        } else {
          console.warn(`[GameStart] ⚠️ No deck found for player ${p.name} (${p.id})! IsBot=${p.isBot}`);
        }
      }));

      // Initialize Game Engine (Draw 7 cards, etc)
      const initializedGame = await gameManager.startGame(room.id);

      console.log(`[GameStart] Game Initialized. Turn: ${initializedGame?.turnCount}. Players: ${Object.keys(initializedGame?.players || {}).length}`);

      if (initializedGame) {
        io.to(room.id).emit('game_update', initializedGame);
      } else {
        console.error("[GameStart] Failed to initialize game engine (startGame returned null).");
      }

      // Trigger bot check
      await gameManager.triggerBotCheck(room.id);

      // We explicitly emitted initializedGame, so we don't strictly need the fallback `getGame` unless triggerBotCheck changed something immediately.
      // But let's keep the final sync just in case bot check did something.
      const latestGame = await gameManager.getGame(room.id);
      if (latestGame) {
        io.to(room.id).emit('game_update', latestGame);
      }
    }
  });

  socket.on('game_action', async ({ action }) => {
    const context = await getContext();
    if (!context) return;
    const { room, player } = context;

    const targetGameId = player.matchId || room.id;

    const game = await gameManager.handleAction(targetGameId, action, player.id);
    if (game) {
      io.to(game.roomId).emit('game_update', game);
    }
  });

  socket.on('game_strict_action', async ({ action }) => {
    console.log(`[Socket] 📥 Received game_strict_action from ${socket.id}`, action);
    const context = await getContext();
    if (!context) {
      console.warn(`[Socket] ⚠️ No context found for socket ${socket.id} in game_strict_action`);
      return;
    }
    const { room, player } = context;

    const targetGameId = player.matchId || room.id;
    console.log(`[Socket] Processing strict action for game ${targetGameId} (Player: ${player.id})`);

    try {
      const game = await gameManager.handleStrictAction(targetGameId, action, player.id);
      if (game) {
        console.log(`[Socket] ✅ Strict action handled. Emitting update to room ${game.roomId}`);
        io.to(game.roomId).emit('game_update', game);
      } else {
        console.warn(`[Socket] ⚠️ handleStrictAction returned null/undefined for game ${targetGameId}`);
      }
    } catch (error) {
      console.error(`[Socket] ❌ Error handling strict action:`, error);
    }
  });
};
