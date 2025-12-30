import { Server, Socket } from 'socket.io';
import { roomManager, gameManager, tournamentManager } from '../../singletons';

export const registerTournamentHandlers = (io: Server, socket: Socket) => {
  const getContext = async () => await roomManager.getPlayerBySocket(socket.id);

  socket.on('join_match', async ({ matchId }, callback) => {
    const context = await getContext();
    if (!context) return;
    const { room, player } = context;

    if (!room.tournament) {
      if (typeof callback === 'function') callback({ success: false, message: "No active tournament." });
      return;
    }

    const match = tournamentManager.getMatch(room.tournament, matchId);
    if (!match) {
      if (typeof callback === 'function') callback({ success: false, message: "Match not found." });
      return;
    }

    if (match.status === 'pending') {
      if (typeof callback === 'function') callback({ success: false, message: "Match is pending." });
      return;
    }

    let game = await gameManager.getGame(matchId);

    socket.join(matchId);
    player.matchId = matchId;
    await roomManager.saveRoom(room); // Save player matchId change

    if (game) {
      socket.emit('game_update', game);
    }

    if (typeof callback === 'function') callback({ success: true, match, gameCreated: !!game });
  });



  socket.on('get_tournament_state', async ({ roomId }, callback) => {
    const context = await getContext();
    if (!context) {
      if (typeof callback === 'function') callback({ success: false, message: "Context not found" });
      return;
    }
    const { room } = context;

    if (room.id !== roomId) {
      if (typeof callback === 'function') callback({ success: false, message: "Room mismatch" });
      return;
    }

    console.log(`[TournamentHandler] get_tournament_state for ${roomId}. Status: ${room.status}, HasTournament: ${!!room.tournament}`);

    if (room.status === 'tournament' && room.tournament) {
      if (typeof callback === 'function') callback({ success: true, tournament: room.tournament });
    } else {
      if (typeof callback === 'function') callback({ success: false, message: "No active tournament found." });
    }
  });

  socket.on('match_ready', async ({ matchId, deck }) => {
    const context = await getContext();
    if (!context) return;
    const { room, player } = context;

    if (!room.tournament) return;

    // Stateless update
    const readyState = tournamentManager.setMatchReady(room.tournament, matchId, player.id, deck);

    if (readyState) {
      await roomManager.saveRoom(room); // Persist ready state

      if (readyState.bothReady) {
        console.log(`[Index] Both players ready for match ${matchId}. Starting Game.`);

        try {
          const match = tournamentManager.getMatch(room.tournament, matchId);
          if (match && match.player1 && match.player2) {
            const p1 = room.players.find(p => p.id === match.player1!.id)!;
            const p2 = room.players.find(p => p.id === match.player2!.id)!;

            const deck1 = readyState.decks[p1.id];
            const deck2 = readyState.decks[p2.id];

            await gameManager.createGame(matchId, [
              { id: p1.id, name: p1.name, isBot: p1.isBot },
              { id: p2.id, name: p2.name, isBot: p2.isBot }
            ]);

            const d1 = deck1 && deck1.length > 0 ? deck1 : (p1.deck || []);
            const d2 = deck2 && deck2.length > 0 ? deck2 : (p2.deck || []);

            // Serialize Deck Loading to prevent lock contention
            const loadDeck = async (p: any, d: any[]) => {
              if (d && d.length > 0) {
                console.log(`[GameStart] Match ${matchId}: Loading deck for ${p.name}: ${d.length} cards.`);
                for (const card of d) {
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

                  await gameManager.addCardToGame(matchId, {
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
                    definition: card.definition
                  });
                }
              }
            };

            await loadDeck(p1, d1 as any[]);
            await loadDeck(p2, d2 as any[]);

            // Start Game (Draw Hands)
            await gameManager.startGame(matchId);

            await gameManager.triggerBotCheck(matchId);

            const latestGame = await gameManager.getGame(matchId);
            io.to(matchId).emit('game_update', latestGame);
            io.to(matchId).emit('match_start', { gameId: matchId });
          }
        } catch (e: any) {
          console.error(`[MatchReady] Error starting game ${matchId}:`, e);
          socket.emit('game_error', { message: "Failed to start game: " + e.message });
        }
      }
    }
  });
};
