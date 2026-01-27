import { Server, Socket } from 'socket.io';
import { roomManager, gameManager, tournamentManager, scryfallService } from '../../singletons';

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

    console.log(`[TournamentHandler] Player ${player.name} (${player.id}) submitted deck for match ${matchId} with ${deck ? deck.length : 0} cards`);

    // Validate deck is not empty
    if (!deck || !Array.isArray(deck) || deck.length === 0) {
      console.error(`[TournamentHandler] ❌ Player ${player.name} submitted EMPTY deck for match ${matchId}!`);
      socket.emit('game_error', {
        message: 'Cannot start match with empty deck. Please build a deck first.',
        userId: player.id
      });
      return;
    }

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

            console.log(`[TournamentStart] Match ${matchId}: Player1 ${p1.name} deck=${d1.length} cards, Player2 ${p2.name} deck=${d2.length} cards`);

            if (d1.length === 0 || d2.length === 0) {
              console.error(`[TournamentStart] ❌ Match ${matchId}: One or both players have EMPTY decks! P1=${d1.length}, P2=${d2.length}`);
            }

            // 1. Gather all Scryfall IDs from all decks
            const allIdentifiers: { id: string }[] = [];
            [d1, d2].forEach(deck => {
              if (deck && Array.isArray(deck)) {
                deck.forEach((card: any) => {
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

                  // --- AUTHORITATIVE DATA MERGE ---
                  const authCard = cardMap.get(scryfallId);
                  if (authCard) {
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
                      ...card.definition,
                      // Force authoritative paths from Redis
                      local_path_full: authCard.local_path_full,
                      local_path_crop: authCard.local_path_crop
                    };
                  }

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

                  await gameManager.addCardToGame(matchId, {
                    ownerId: p.id,
                    controllerId: p.id,
                    oracleId: card.oracle_id || card.id || card.definition?.oracle_id,
                    scryfallId: scryfallId,
                    setCode: setCode,
                    name: card.name,
                    imageUrl: card.definition?.local_path_full || ((setCode && scryfallId) ? "" : (card.image_uris?.normal || card.image_uris?.large || card.imageUrl || "")),
                    imageArtCrop: card.definition?.local_path_crop || card.image_uris?.art_crop || card.image_uris?.crop || card.imageArtCrop || "",
                    zone: 'library',
                    typeLine: card.typeLine || card.type_line || card.definition?.type_line || '',
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
