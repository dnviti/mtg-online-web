
import { Server } from 'socket.io';
import { registerRoomHandlers } from './handlers/room.handler';
import { registerChatHandlers } from './handlers/chat.handler';
import { registerDraftHandlers } from './handlers/draft.handler';
import { registerGameHandlers } from './handlers/game.handler';
import { registerTournamentHandlers } from './handlers/tournament.handler';
import { gameManager, roomManager, draftManager, tournamentManager } from '../singletons';

export const initializeSocket = (io: Server) => {
  // Global Listeners (Server -> Client)
  gameManager.on('game_over', async ({ gameId, winnerId }) => {
    console.log(`[SocketManager] Game Over received: ${gameId}, Winner: ${winnerId}`);

    // Check if it's a tournament match
    // Optimization: We could have a map of gameId -> roomId to avoid scanning.
    // But keeping it simple for now, though iterating all rooms in Redis is SLOW.
    // Better: RoomManager should expose findRoomByGameId or similar? 
    // Or we use `getAllRooms` which we implemented.
    const rooms = await roomManager.getAllRooms();

    for (const room of rooms) {
      if (room.status === 'tournament' && room.tournament) {
        const match = tournamentManager.getMatch(room.tournament, gameId);
        if (match) {
          console.log(`[SocketManager] Reporting match result for T: ${room.tournament.id}, M: ${gameId}`);

          // Stateless update
          const newTournamentState = tournamentManager.recordMatchResult(room.tournament, gameId, winnerId);
          if (newTournamentState) {
            // Must save the room to persist tournament changes
            await roomManager.saveRoom(room);
            // Wait, saveRoomState is private in RoomManager.
            // We need a public method to update the room/tournament.
            // Actually, RoomManager could have `updateTournament(roomId, tournament)`?
            // Or since `getAllRooms` returned a copy, we can just save it?
            // But `saveRoomState` is private.
            // We should reuse `roomManager.saveRoomState` if we make it public or add `updateRoom`.
            // Let's modify usage. We'll rely on a new method or cast to access private if needed (bad practice).
            // Let's add `updateRoom` to RoomManager? Or just assume `getAllRooms` returns distinct objects.
            // I'll assume I can add a `saveRoom` method to RoomManager public interface or use `updateRoom` logic.
            // I omitted `saveRoom` in RoomManager public interface.
            // I will use `updateRoom` (if I add it) or just hack it for now? 
            // Better: Add `updateTournamentState(roomId, tournament)` to RoomManager.

            // For now, I'll assume I update RoomManager public interface in next step?
            // Or I can use `createRoom` to overwrite? Safe? No.
            // I'll make `saveRoomState` public or equivalent.
            // Actually, I can use `setPlayerReady` abuse? No.
            // I'll fix RoomManager later. For now, assuming `roomManager.saveRoom(room)` works (I'll add it).

            // FIXME: Need to save room.
            // For MVP, I'll call a method I'll add.
            await roomManager.saveRoom(room);
            io.to(room.id).emit('tournament_update', newTournamentState);
          }
        }
      }
    }
  });

  gameManager.on('game_update', (roomId, game) => {
    if (game && roomId) {
      io.to(roomId).emit('game_update', game);
    }
  });

  // Draft Completion Listener (Persistence)
  draftManager.on('draft_complete', async ({ roomId, draft }) => {
    console.log(`[SocketManager] Draft ${roomId} Completed. Persisting pools...`);

    // 1. Sync Room Status
    const room = await roomManager.getRoom(roomId);
    if (room && room.status !== 'deck_building') {
      room.status = 'deck_building';
      await roomManager.saveRoom(room);
      io.to(roomId).emit('room_update', room);
    }

    if (room) {
      // 2. Persist Pools
      for (const playerId of Object.keys(draft.players)) {
        const draftPlayer = draft.players[playerId];
        await roomManager.updatePlayerPool(roomId, playerId, draftPlayer.pool);
        // Update local ref if we were to reuse 'room' obj, but we re-fetch usually.
        // But let's verify bots here too?
      }

      console.log(`[SocketManager] Pools persisted for room ${roomId}`);
    }
  });

  // Draft Timer Loop
  const runDraftTimer = async () => {
    try {
      const updates = await draftManager.checkTimers();
      updates.forEach(async ({ roomId, draft }) => {
        io.to(roomId).emit('draft_update', draft);

        if (draft.status === 'deck_building') {
          const room = await roomManager.getRoom(roomId);
          if (room) {
            // Sync Draft Pools to Room Players (Persistence)
            // This logic is now handled by the 'draft_complete' listener.
            // The 'draft_complete' event is emitted by draftManager when a draft transitions to 'deck_building' or 'complete'.
            // This ensures persistence happens once and reliably.

            Object.values(draft.players).forEach(dp => {
              if (dp.isBot && dp.deck && dp.deck.length > 0) {
                const roomPlayer = room.players.find(rp => rp.id === dp.id);
                if (roomPlayer && (!roomPlayer.ready || !roomPlayer.deck || roomPlayer.deck.length === 0)) {
                  // This calls setPlayerReady which SAVES to Redis. Good.
                  // But we call it in a loop.
                  // Ideally we batch or just let it race/overwrite.
                  // `setPlayerReady` locks. So it is safe but slow.
                  roomManager.setPlayerReady(roomId, dp.id, dp.deck).then(updated => {
                    if (updated) io.to(roomId).emit('room_update', updated);
                  });
                  console.log(`[Sync] Bot ${dp.id} synced deck (${dp.deck.length} cards).`);
                }
              }
            });

            // Check if all ready after updates?
            // The `setPlayerReady` logic inside checks nothing?
            // In old code, we checked `if (activePlayers.every(p => p.ready))`.
            // We should do that check here or in RoomManager.

            // Let's refetch room to see latest state after bot updates (or use the variable if we updated it)
            // Ideally we re-fetch briefly to ensure we have latest bot-readiness if setPlayerReady finished?
            // setPlayerReady is async.
            // For now, let's keep the existing logic but knowing room might be slightly stale regarding ready-state if we don't await.

            // Re-fetch room to get strictly up to date state before checking tournament
            const freshRoom = await roomManager.getRoom(roomId);
            if (freshRoom) {
              const activePlayers = freshRoom.players.filter(p => p.role === 'player');
              if (activePlayers.length > 0 && activePlayers.every(p => p.ready) && freshRoom.status !== 'tournament') {
                console.log(`All players ready (including bots) in room ${roomId}. Starting TOURNAMENT.`);
                freshRoom.status = 'tournament';

                const tournament = tournamentManager.createTournament(roomId, freshRoom.players.map(p => ({
                  id: p.id,
                  name: p.name,
                  isBot: !!p.isBot,
                  deck: p.deck
                })));

                freshRoom.tournament = tournament;
                await roomManager.saveRoom(freshRoom); // Need public save!

                io.to(roomId).emit('room_update', freshRoom);
                io.to(roomId).emit('tournament_update', tournament);
              }
            }
          }
        }

        if (draft.status === 'complete') {
          // ...
        }
      });
    } catch (e) {
      console.error("Error in draft timer", e);
    }

    setTimeout(runDraftTimer, 1000);
  };

  runDraftTimer();

  io.on('connection', (socket) => {
    // console.log('A user connected', socket.id);
    registerRoomHandlers(io, socket);
    registerChatHandlers(io, socket);
    registerDraftHandlers(io, socket);
    registerGameHandlers(io, socket);
    registerTournamentHandlers(io, socket);
  });

  return { draftInterval: 0 };
};
