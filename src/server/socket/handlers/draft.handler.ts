import { Server, Socket } from 'socket.io';
import { roomManager, draftManager, tournamentManager, scryfallService } from '../../singletons';

export const registerDraftHandlers = (io: Server, socket: Socket) => {
  const getContext = () => roomManager.getPlayerBySocket(socket.id);

  socket.on('start_draft', () => {
    const context = getContext();
    if (!context) return;
    const { room } = context;

    if (room.status === 'waiting') {
      const activePlayers = room.players.filter(p => p.role === 'player');
      if (activePlayers.length < 2) {
        // Check minimum players if needed
      }

      if (room.format === 'draft') {
        const draft = draftManager.createDraft(room.id, room.players.map(p => ({ id: p.id, isBot: !!p.isBot })), room.packs, room.basicLands);
        room.status = 'drafting';

        io.to(room.id).emit('room_update', room);
        io.to(room.id).emit('draft_update', draft);
      } else {
        room.status = 'deck_building';
        io.to(room.id).emit('room_update', room);
      }
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

        // Sync Bot Readiness
        const currentRoom = roomManager.getRoom(room.id);
        if (currentRoom) {
          Object.values(draft.players).forEach(draftPlayer => {
            if (draftPlayer.isBot && draftPlayer.deck) {
              const roomPlayer = currentRoom.players.find(rp => rp.id === draftPlayer.id);
              if (roomPlayer && (!roomPlayer.ready || !roomPlayer.deck || roomPlayer.deck.length === 0)) {
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

  socket.on('start_solo_test', ({ playerId, playerName, packs, basicLands }, callback) => {
    console.log(`Starting Solo Draft for ${playerName}`);

    const room = roomManager.createRoom(playerId, playerName, packs, basicLands || [], socket.id);
    socket.join(room.id);

    for (let i = 0; i < 7; i++) {
      roomManager.addBot(room.id);
    }

    const draft = draftManager.createDraft(room.id, room.players.map(p => ({ id: p.id, isBot: !!p.isBot })), room.packs, room.basicLands);
    room.status = 'drafting';

    if (typeof callback === 'function') {
      callback({ success: true, room, draftState: draft });
    }
    io.to(room.id).emit('room_update', room);
    io.to(room.id).emit('draft_update', draft);
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
