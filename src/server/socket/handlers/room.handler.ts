import { Server, Socket } from 'socket.io';
import { roomManager, draftManager, gameManager } from '../../singletons';

export const registerRoomHandlers = (io: Server, socket: Socket) => {
  const getContext = async () => await roomManager.getPlayerBySocket(socket.id);

  socket.on('create_room', async ({ hostId, hostName, packs, basicLands, format }, callback) => {
    console.log(`[Handler] create_room request from ${hostName} (${hostId})`);
    try {
      const room = await roomManager.createRoom(hostId, hostName, packs, basicLands || [], socket.id, format);
      console.log(`[Handler] Room object created: ${room.id}`);

      socket.join(room.id);
      console.log(`[Handler] Socket joined room: ${room.id}`);

      console.log(`Room created: ${room.id} by ${hostName}`);
      if (typeof callback === 'function') callback({ success: true, room });
    } catch (err) {
      console.error('[Handler] Error handling create_room:', err);
      if (typeof callback === 'function') callback({ success: false, message: 'Failed to create room' });
    }
  });

  socket.on('join_room', async ({ roomId, playerId, playerName }, callback) => {
    const room = await roomManager.joinRoom(roomId, playerId, playerName, socket.id);
    if (room) {
      console.log(`Player ${playerName} reconnected.`);

      socket.join(room.id);
      console.log(`Player ${playerName} joined room ${roomId}`);
      io.to(room.id).emit('room_update', room);

      if (room.hostId === playerId) {
        console.log(`Host ${playerName} reconnected. Resuming draft timers.`);
        await draftManager.setPaused(roomId, false);
      }

      let currentDraft = null;
      if (room.status === 'drafting' || room.status === 'deck_building') {
        currentDraft = await draftManager.getDraft(roomId);
        if (currentDraft) socket.emit('draft_update', currentDraft);
      }

      if (room.status === 'tournament' && room.tournament) {
        socket.emit('tournament_update', room.tournament);
      }

      if (typeof callback === 'function') callback({ success: true, room, draftState: currentDraft, tournament: room.tournament });
    } else {
      if (typeof callback === 'function') callback({ success: false, message: 'Room not found or full' });
    }
  });

  socket.on('rejoin_room', async ({ roomId, playerId }, callback) => {
    socket.join(roomId);

    if (playerId) {
      const room = await roomManager.updatePlayerSocket(roomId, playerId, socket.id);

      if (room) {
        console.log(`Player ${playerId} reconnected via rejoin.`);
        io.to(roomId).emit('room_update', room);

        if (room.hostId === playerId) {
          console.log(`Host ${playerId} reconnected. Resuming draft timers.`);
          await draftManager.setPaused(roomId, false);
        }

        let currentDraft = null;
        if (room.status === 'drafting' || room.status === 'deck_building') {
          currentDraft = await draftManager.getDraft(roomId);
          if (currentDraft) socket.emit('draft_update', currentDraft);
        }

        let currentGame = null;
        if (room.status === 'playing') {
          currentGame = await gameManager.getGame(roomId);
          if (currentGame) socket.emit('game_update', currentGame);
        } else if (room.status === 'tournament') {
          if (room.tournament) {
            socket.emit('tournament_update', room.tournament);
            const p = room.players.find(rp => rp.id === playerId);
            if (p && p.matchId) {
              currentGame = await gameManager.getGame(p.matchId);
              if (currentGame) {
                socket.join(p.matchId);
                socket.emit('game_update', currentGame);
              }
            }
          }
        }

        if (typeof callback === 'function') {
          callback({ success: true, room, draftState: currentDraft, gameState: currentGame, tournament: room.tournament });
        }
      } else {
        if (typeof callback === 'function') {
          callback({ success: false, message: 'Player not found in room or room closed' });
        }
      }
    } else {
      if (typeof callback === 'function') {
        callback({ success: false, message: 'Missing Player ID' });
      }
    }
  });

  socket.on('leave_room', async ({ roomId, playerId }) => {
    const room = await roomManager.leaveRoom(roomId, playerId);
    socket.leave(roomId);
    if (room) {
      console.log(`Player ${playerId} left room ${roomId}`);
      io.to(roomId).emit('room_update', room);
    } else {
      console.log(`Room ${roomId} closed/empty`);
    }
  });

  socket.on('kick_player', async ({ roomId, targetId }) => {
    const context = await getContext();
    if (!context || !context.player.isHost) return;

    const room = await roomManager.getRoom(roomId);
    if (room) {
      const target = room.players.find(p => p.id === targetId);
      if (target) {
        const updatedRoom = await roomManager.kickPlayer(roomId, targetId);
        if (updatedRoom) {
          io.to(roomId).emit('room_update', updatedRoom);
          if (target.socketId) {
            io.to(target.socketId).emit('kicked', { message: 'You have been kicked by the host.' });
          }
          console.log(`Player ${targetId} kicked from room ${roomId} by host.`);
        }
      }
    }
  });

  socket.on('add_bot', async ({ roomId }) => {
    const context = await getContext();
    if (!context || !context.player.isHost) return;

    const updatedRoom = await roomManager.addBot(roomId);
    if (updatedRoom) {
      io.to(roomId).emit('room_update', updatedRoom);
      console.log(`Bot added to room ${roomId}`);
    } else {
      socket.emit('error', { message: 'Failed to add bot (Room full?)' });
    }
  });

  socket.on('remove_bot', async ({ roomId, botId }) => {
    const context = await getContext();
    if (!context || !context.player.isHost) return;

    const updatedRoom = await roomManager.removeBot(roomId, botId);
    if (updatedRoom) {
      io.to(roomId).emit('room_update', updatedRoom);
      console.log(`Bot ${botId} removed from room ${roomId}`);
    }
  });

  socket.on('save_deck', async ({ roomId, deck }) => {
    // Autosave deck state (without setting ready)
    if (!roomId || !deck) return;
    const context = await getContext();
    if (!context || context.room.id !== roomId) return;

    const updatedRoom = await roomManager.saveDeckState(roomId, context.player.id, deck);
    if (updatedRoom) {
      socket.emit('deck_saved', { success: true });
    }
  });

  socket.on('disconnect', async () => {
    // console.log('User disconnected', socket.id); // Verbose

    const result = await roomManager.setPlayerOffline(socket.id);
    if (result) {
      const { room, playerId } = result;
      console.log(`Player ${playerId} disconnected from room ${room.id}`);

      io.to(room.id).emit('room_update', room);

      if (room.status === 'drafting') {
        const hostOffline = room.players.find(p => p.id === room.hostId)?.isOffline;

        if (hostOffline) {
          console.log("Host is offline. Pausing game (stopping all timers).");
          await draftManager.setPaused(room.id, true);
        }
      }
    }
  });
};
