import { Server, Socket } from 'socket.io';
import { roomManager, gameManager, tournamentManager } from '../../singletons';
import { RulesEngine } from '../../game/RulesEngine';

export const registerTournamentHandlers = (io: Server, socket: Socket) => {
  const getContext = () => roomManager.getPlayerBySocket(socket.id);

  socket.on('join_match', ({ matchId }, callback) => {
    const context = getContext();
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

    let game = gameManager.getGame(matchId);

    socket.join(matchId);
    player.matchId = matchId;

    if (game) {
      socket.emit('game_update', game);
    }

    if (typeof callback === 'function') callback({ success: true, match, gameCreated: !!game });
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

        const deck1 = readyState.decks[p1.id];
        const deck2 = readyState.decks[p2.id];

        const game = gameManager.createGame(matchId, [
          { id: p1.id, name: p1.name, isBot: p1.isBot },
          { id: p2.id, name: p2.name, isBot: p2.isBot }
        ]);

        const d1 = deck1 && deck1.length > 0 ? deck1 : (p1.deck || []);
        const d2 = deck2 && deck2.length > 0 ? deck2 : (p2.deck || []);

        [{ p: p1, d: d1 }, { p: p2, d: d2 }].forEach(({ p, d }) => {
          if (d && d.length > 0) {
            console.log(`[GameStart] Match ${matchId}: Loading deck for ${p.name}: ${d.length} cards.`);
            d.forEach((card: any) => {
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

              gameManager.addCardToGame(matchId, {
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
                controlledSinceTurn: 0
              });
            });
          } else {
            console.warn(`[GameStart] ⚠️ Match ${matchId}: No deck found for ${p.name} (IsBot: ${p.isBot})`);
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
};
