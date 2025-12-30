import { Server, Socket } from 'socket.io';
import { roomManager, gameManager } from '../../singletons';

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

      updatedRoom.players.forEach(async p => {
        let finalDeck = (decks && decks[p.id]) ? decks[p.id] : p.deck;

        if (finalDeck && Array.isArray(finalDeck)) {
          console.log(`[GameStart] Loading deck for ${p.name} (${p.id}): ${finalDeck.length} cards.`);

          finalDeck.forEach(async (card: any) => {
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

            await gameManager.addCardToGame(room.id, {
              ownerId: p.id,
              controllerId: p.id,
              oracleId: card.oracle_id || card.id || card.definition?.oracle_id,
              scryfallId: scryfallId,
              setCode: setCode,
              name: card.name,
              imageUrl: (setCode && scryfallId) ? "" : (card.image_uris?.normal || card.image_uris?.large || card.imageUrl || ""),
              imageArtCrop: card.image_uris?.art_crop || card.image_uris?.crop || card.imageArtCrop || "",
              zone: 'library',
              typeLine: card.typeLine || card.type_line || '',
              oracleText: card.oracleText || card.oracle_text || '',
              manaCost: card.manaCost || card.mana_cost || '',
              keywords: card.keywords || [],
              power: card.power,
              toughness: card.toughness,
              damageMarked: 0,
              controlledSinceTurn: 0,
              definition: card.definition // Pass definition for DFC support
            });
          });
        } else {
          console.warn(`[GameStart] ⚠️ No deck found for player ${p.name} (${p.id})! IsBot=${p.isBot}`);
        }
      });

      // We need to wait for cards to be added? 
      // The old code was synchronous loop. 
      // The async nature of redis means `addCardToGame` is async.
      // We should probably await all deck loading before starting game engine?
      // But `createGame` already initialized engine.
      // The engine startup `startGame()` is called inside `createGame`.
      // We trigger bot check.

      await gameManager.triggerBotCheck(room.id);

      // Fetch latest state to emit
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
    const context = await getContext();
    if (!context) return;
    const { room, player } = context;

    const targetGameId = player.matchId || room.id;

    const game = await gameManager.handleStrictAction(targetGameId, action, player.id);
    if (game) {
      io.to(game.roomId).emit('game_update', game);
    }
  });
};
