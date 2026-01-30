import { Server, Socket } from 'socket.io';
import { roomManager, gameManager, scryfallService, cardService } from '../../singletons';
import { GameLogger } from '../../game/engine/GameLogger';
import { StrictGameState } from '../../game/types';
import { DebugPauseEvent } from '../../game/types/debug';

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
      console.log(`[GameStart] Starting deck loading for ${updatedRoom.players.length} players`);

      await Promise.all(updatedRoom.players.map(async p => {
        let finalDeck = (decks && decks[p.id]) ? decks[p.id] : p.deck;

        console.log(`[GameStart] Player ${p.name} (${p.id}): deck=${finalDeck ? finalDeck.length : 'undefined'} cards`);

        if (finalDeck && Array.isArray(finalDeck)) {
          console.log(`[GameStart] Loading deck for ${p.name} (${p.id}): ${finalDeck.length} cards.`);

          for (const card of finalDeck) {
            let setCode = card.setCode || card.set || card.definition?.set;
            let scryfallId = card.scryfallId || card.id || card.definition?.id;

            if ((!setCode || !scryfallId) && card.imageUrl && card.imageUrl.includes('/cards/images/')) {
              const parts = card.imageUrl.split('/cards/images/');
              if (parts[1]) {
                const pathParts = parts[1].split('/');
                if (!setCode) setCode = pathParts[0];
                if (!scryfallId) {
                  const filename = pathParts[pathParts.length - 1];
                  scryfallId = filename.replace(/\.(jpg|png)$/, '');
                }
              }
            }

            const authCard = cardMap.get(scryfallId);
            if (authCard) {
              if (authCard.type_line?.includes('Planeswalker')) {
                console.log(`[GameStart] Planeswalker ${authCard.name}: loyalty=${authCard.loyalty}`);
              }
              const typeLine = authCard.type_line || '';
              const typeParts = typeLine.split('—');
              const parsedTypes = typeParts[0].trim().split(' ').filter(Boolean);
              const parsedSubtypes = typeParts[1] ? typeParts[1].trim().split(' ').filter(Boolean) : [];

              card.definition = {
                ...card.definition,
                name: authCard.name,
                id: authCard.id,
                oracle_id: authCard.oracle_id,
                type_line: authCard.type_line,
                types: parsedTypes,
                subtypes: parsedSubtypes,
                oracle_text: authCard.oracle_text || (authCard.card_faces ? authCard.card_faces[0].oracle_text : ''),
                mana_cost: authCard.mana_cost || (authCard.card_faces ? authCard.card_faces[0].mana_cost : ''),
                power: authCard.power,
                toughness: authCard.toughness,
                loyalty: authCard.loyalty || authCard.card_faces?.[0]?.loyalty || authCard.card_faces?.[1]?.loyalty,
                defense: authCard.defense,
                colors: authCard.colors,
                card_faces: authCard.card_faces,
                image_uris: authCard.image_uris,
                keywords: authCard.keywords || [],
                set: authCard.set,
                local_path_full: authCard.local_path_full,
                local_path_crop: authCard.local_path_crop
              };
            }

            if (!card.definition) {
              const fallbackTypeLine = card.type_line || card.typeLine || '';
              const fallbackTypeParts = fallbackTypeLine.split('—');
              const fallbackTypes = fallbackTypeParts[0].trim().split(' ').filter(Boolean);
              const fallbackSubtypes = fallbackTypeParts[1] ? fallbackTypeParts[1].trim().split(' ').filter(Boolean) : [];

              card.definition = {
                name: card.name,
                id: card.id,
                oracle_id: card.oracle_id || card.oracleId,
                type_line: fallbackTypeLine,
                types: card.types || fallbackTypes,
                subtypes: card.subtypes || fallbackSubtypes,
                oracle_text: card.oracle_text || card.oracleText,
                mana_cost: card.mana_cost || card.manaCost,
                power: card.power?.toString(),
                toughness: card.toughness?.toString(),
                loyalty: card.loyalty || card.card_faces?.[0]?.loyalty || card.card_faces?.[1]?.loyalty || card.cardFaces?.[0]?.loyalty || card.cardFaces?.[1]?.loyalty,
                defense: card.defense,
                colors: card.colors,
                card_faces: card.card_faces || card.cardFaces,
                image_uris: card.image_uris,
                keywords: card.keywords,
                set: card.set || card.setCode
              };
            }

            const cardTypeLine = card.typeLine || card.type_line || card.definition?.type_line || '';
            let cardTypes = card.definition?.types;
            if (!cardTypes || cardTypes.length === 0) {
              cardTypes = card.types;
            }
            if (!cardTypes || cardTypes.length === 0) {
              cardTypes = cardTypeLine.split('—')[0].trim().split(' ').filter(Boolean);
            }

            const loyaltyValue = card.definition?.loyalty || card.loyalty;

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
              typeLine: cardTypeLine,
              types: cardTypes,
              oracleText: card.oracleText || card.oracle_text || card.definition?.oracle_text || '',
              manaCost: card.manaCost || card.mana_cost || card.definition?.mana_cost || '',
              keywords: card.keywords || card.definition?.keywords || [],
              power: (typeof card.power === 'number' ? card.power : parseFloat(card.power || card.definition?.power || '0')) || 0,
              toughness: (typeof card.toughness === 'number' ? card.toughness : parseFloat(card.toughness || card.definition?.toughness || '0')) || 0,
              baseLoyalty: loyaltyValue ? parseInt(loyaltyValue) : undefined,
              damageMarked: 0,
              controlledSinceTurn: 0,
              definition: card.definition
            });
          }
        } else {
          console.warn(`[GameStart] No deck found for player ${p.name} (${p.id})!`);
        }
      }));

      // Determine primary set code from loaded cards and cache tokens
      const allSetCodes = new Set<string>();
      authoritativeCards.forEach(c => {
        if (c.set) allSetCodes.add(c.set.toLowerCase());
      });

      if (allSetCodes.size === 0) {
        console.log(`[GameStart] No set codes from authoritative data, checking deck cards...`);
        updatedRoom.players.forEach(p => {
          const finalDeck = (decks && decks[p.id]) ? decks[p.id] : p.deck;
          if (finalDeck && Array.isArray(finalDeck)) {
            finalDeck.forEach((card: any) => {
              const setCode = card.setCode || card.set || card.definition?.set;
              if (setCode) allSetCodes.add(setCode.toLowerCase());
            });
          }
        });
      }

      if (allSetCodes.size > 0) {
        const primarySetCode = Array.from(allSetCodes)[0];
        console.log(`[GameStart] Primary set code: ${primarySetCode}. Caching tokens...`);

        try {
          const tokens = await scryfallService.getTokensForSet(primarySetCode);
          if (tokens.length > 0) {
            const cachedCount = await cardService.cacheImages(tokens);
            if (cachedCount > 0) {
              console.log(`[GameStart] Downloaded ${cachedCount} token images for set ${primarySetCode}`);
            }
            await gameManager.cacheTokensForGame(room.id, primarySetCode, tokens);
            console.log(`[GameStart] Cached ${tokens.length} tokens for set ${primarySetCode}`);
          }
        } catch (e) {
          console.warn(`[GameStart] Failed to cache tokens for set ${primarySetCode}:`, e);
        }
      }

      // Initialize Game Engine
      const initializedGame = await gameManager.startGame(room.id);

      console.log(`[GameStart] Game Initialized. Turn: ${initializedGame?.turnCount}. Players: ${Object.keys(initializedGame?.players || {}).length}`);

      if (initializedGame) {
        io.to(room.id).emit('game_update', initializedGame);
      } else {
        console.error("[GameStart] Failed to initialize game engine.");
      }
    }
  });

  socket.on('game_action', async ({ action }) => {
    const context = await getContext();
    if (!context) return;
    const { room, player } = context;

    const targetGameId = player.matchId || room.id;

    const result = await gameManager.handleAction(targetGameId, action, player.id);

    if (result && 'debugPause' in result) {
      const pauseEvent = (result as { debugPause: DebugPauseEvent }).debugPause;
      io.to(targetGameId).emit('debug_pause', pauseEvent);
      return;
    }

    const game = result as StrictGameState | null;
    if (game) {
      const logs = GameLogger.flushLogs(game);
      if (logs.length > 0) {
        io.to(game.roomId).emit('game_log', { logs });
      }
      io.to(game.roomId).emit('game_update', game);
    }
  });

  socket.on('game_strict_action', async ({ action }) => {
    console.log(`[Socket] Received game_strict_action from ${socket.id}`, action);
    const context = await getContext();
    if (!context) {
      console.warn(`[Socket] No context found for socket ${socket.id}`);
      return;
    }
    const { room, player } = context;

    const targetGameId = player.matchId || room.id;
    console.log(`[Socket] Processing strict action for game ${targetGameId}`);

    try {
      const result = await gameManager.handleStrictAction(targetGameId, action, player.id);

      if (result && 'debugPause' in result) {
        const pauseEvent = (result as { debugPause: DebugPauseEvent }).debugPause;
        console.log(`[Socket] Debug pause: ${pauseEvent.description}`);
        io.to(targetGameId).emit('debug_pause', pauseEvent);
        return;
      }

      const game = result as StrictGameState | null;
      if (game) {
        console.log(`[Socket] Strict action handled. Emitting update to room ${game.roomId}`);
        const logs = GameLogger.flushLogs(game);
        if (logs.length > 0) {
          io.to(game.roomId).emit('game_log', { logs });
        }
        io.to(game.roomId).emit('game_update', game);

        if (process.env.DEV_MODE === 'true') {
          io.to(game.roomId).emit('debug_state', gameManager.getDebugState(game.roomId));
        }
      } else {
        console.warn(`[Socket] handleStrictAction returned null for game ${targetGameId}`);
      }
    } catch (error) {
      console.error(`[Socket] Error handling strict action:`, error);
    }
  });

  // ============================================
  // DEBUG MODE SOCKET HANDLERS
  // ============================================

  socket.on('debug_continue', async ({ snapshotId }) => {
    console.log(`[Socket] Debug continue: ${snapshotId}`);
    const context = await getContext();
    if (!context) return;
    const { room, player } = context;

    const targetGameId = player.matchId || room.id;

    try {
      const result = await gameManager.handleDebugContinue(targetGameId, snapshotId);
      if (result) {
        const { state } = result;

        const logs = GameLogger.flushLogs(state);
        if (logs.length > 0) {
          io.to(state.roomId).emit('game_log', { logs });
        }
        io.to(state.roomId).emit('game_update', state);
        io.to(state.roomId).emit('debug_state', gameManager.getDebugState(state.roomId));
      }
    } catch (error) {
      console.error(`[Socket] Error in debug_continue:`, error);
    }
  });

  socket.on('debug_cancel', async ({ snapshotId }) => {
    console.log(`[Socket] Debug cancel: ${snapshotId}`);
    const context = await getContext();
    if (!context) return;
    const { room, player } = context;

    const targetGameId = player.matchId || room.id;

    try {
      const result = await gameManager.handleDebugCancel(targetGameId, snapshotId);
      if (result) {
        io.to(result.state.roomId).emit('game_update', result.state);
        io.to(result.state.roomId).emit('debug_state', result.debugState);
      }
    } catch (error) {
      console.error(`[Socket] Error in debug_cancel:`, error);
    }
  });

  socket.on('debug_undo', async () => {
    console.log(`[Socket] Debug undo`);
    const context = await getContext();
    if (!context) return;
    const { room, player } = context;

    const targetGameId = player.matchId || room.id;

    try {
      const result = await gameManager.handleDebugUndo(targetGameId);
      if (result) {
        io.to(result.state.roomId).emit('game_update', result.state);
        io.to(result.state.roomId).emit('debug_state', result.debugState);
      }
    } catch (error) {
      console.error(`[Socket] Error in debug_undo:`, error);
    }
  });

  socket.on('debug_redo', async () => {
    console.log(`[Socket] Debug redo`);
    const context = await getContext();
    if (!context) return;
    const { room, player } = context;

    const targetGameId = player.matchId || room.id;

    try {
      const result = await gameManager.handleDebugRedo(targetGameId);
      if (result) {
        io.to(result.state.roomId).emit('game_update', result.state);
        io.to(result.state.roomId).emit('debug_state', result.debugState);
      }
    } catch (error) {
      console.error(`[Socket] Error in debug_redo:`, error);
    }
  });

  socket.on('debug_toggle', async ({ enabled }) => {
    console.log(`[Socket] Debug toggle: ${enabled}`);
    const context = await getContext();
    if (!context) return;
    const { room, player } = context;

    const targetGameId = player.matchId || room.id;

    try {
      const debugState = await gameManager.handleDebugToggle(targetGameId, enabled);
      io.to(targetGameId).emit('debug_state', debugState);
    } catch (error) {
      console.error(`[Socket] Error in debug_toggle:`, error);
    }
  });

  socket.on('debug_clear_history', async () => {
    console.log(`[Socket] Debug clear history`);
    const context = await getContext();
    if (!context) return;
    const { room, player } = context;

    const targetGameId = player.matchId || room.id;

    try {
      const debugState = await gameManager.handleDebugClearHistory(targetGameId);
      io.to(targetGameId).emit('debug_state', debugState);
    } catch (error) {
      console.error(`[Socket] Error in debug_clear_history:`, error);
    }
  });
};
