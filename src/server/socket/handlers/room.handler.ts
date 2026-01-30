import { Server, Socket } from 'socket.io';
import { roomManager, draftManager, gameManager } from '../../singletons';

export const registerRoomHandlers = (io: Server, socket: Socket) => {
  const getContext = async () => await roomManager.getPlayerBySocket(socket.id);

  socket.on('create_room', async ({ hostId, hostName, packs, basicLands, format, forceNew }, callback) => {
    console.log(`[Handler] create_room request from ${hostName} (${hostId})`);
    try {
      // Check for existing open rooms unless forceNew is true
      if (!forceNew) {
        const existingRooms = await roomManager.findPlayerOpenRooms(hostId);
        if (existingRooms.length > 0) {
          console.log(`[Handler] Player ${hostName} has ${existingRooms.length} existing open room(s)`);
          if (typeof callback === 'function') {
            callback({
              success: false,
              hasExistingRooms: true,
              existingRooms: existingRooms,
              message: 'You have existing open rooms. Do you want to rejoin or create a new room?'
            });
          }
          return;
        }
      }

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

  socket.on('close_room', async ({ roomId, playerId }, callback) => {
    const room = await roomManager.closeRoom(roomId, playerId);
    if (room) {
      console.log(`Room ${roomId} closed by host ${playerId}`);
      // Notify all players that the room has been closed
      io.to(roomId).emit('room_closed', { message: 'The host has closed this room.' });
      io.to(roomId).emit('room_update', room);
      if (typeof callback === 'function') callback({ success: true, room });
    } else {
      console.log(`Failed to close room ${roomId} - either not found or player is not host`);
      if (typeof callback === 'function') callback({ success: false, message: 'Failed to close room. Only the host can close a room.' });
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

  // Update room format (host only, waiting status only)
  socket.on('update_room_format', async ({ roomId, format }, callback) => {
    const context = await getContext();
    if (!context) {
      if (typeof callback === 'function') callback({ success: false, message: 'Not authenticated' });
      return;
    }

    if (!context.player.isHost) {
      if (typeof callback === 'function') callback({ success: false, message: 'Only the host can change the format' });
      return;
    }

    const room = await roomManager.updateRoomFormat(roomId, context.player.id, format);
    if (room) {
      io.to(roomId).emit('room_update', room);
      console.log(`Room ${roomId} format updated to ${format} by host ${context.player.id}`);
      if (typeof callback === 'function') callback({ success: true, room });
    } else {
      if (typeof callback === 'function') callback({ success: false, message: 'Failed to update format. Room must be in waiting status.' });
    }
  });

  // Cancel game and return to waiting status (host only)
  socket.on('cancel_game', async ({ roomId }, callback) => {
    const context = await getContext();
    if (!context) {
      if (typeof callback === 'function') callback({ success: false, message: 'Not authenticated' });
      return;
    }

    if (!context.player.isHost) {
      if (typeof callback === 'function') callback({ success: false, message: 'Only the host can cancel the game' });
      return;
    }

    const room = await roomManager.cancelGame(roomId, context.player.id);
    if (room) {
      io.to(roomId).emit('room_update', room);
      console.log(`Game cancelled in room ${roomId} by host ${context.player.id}`);
      if (typeof callback === 'function') callback({ success: true, room });
    } else {
      if (typeof callback === 'function') callback({ success: false, message: 'Failed to cancel game' });
    }
  });

  // Note: add_bot and remove_bot handlers removed - manual play mode does not support bots

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
