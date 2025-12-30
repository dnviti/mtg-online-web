import { Server, Socket } from 'socket.io';
import { roomManager, draftManager, gameManager } from '../../singletons';

export const registerRoomHandlers = (io: Server, socket: Socket) => {
  const getContext = () => roomManager.getPlayerBySocket(socket.id);

  socket.on('create_room', ({ hostId, hostName, packs, basicLands, format }, callback) => {
    const room = roomManager.createRoom(hostId, hostName, packs, basicLands || [], socket.id, format);
    socket.join(room.id);
    console.log(`Room created: ${room.id} by ${hostName}`);
    callback({ success: true, room });
  });

  socket.on('join_room', ({ roomId, playerId, playerName }, callback) => {
    const room = roomManager.joinRoom(roomId, playerId, playerName, socket.id);
    if (room) {
      console.log(`Player ${playerName} reconnected.`);

      socket.join(room.id);
      console.log(`Player ${playerName} joined room ${roomId}`);
      io.to(room.id).emit('room_update', room);

      if (room.hostId === playerId) {
        console.log(`Host ${playerName} reconnected. Resuming draft timers.`);
        draftManager.setPaused(roomId, false);
      }

      let currentDraft = null;
      if (room.status === 'drafting') {
        currentDraft = draftManager.getDraft(roomId);
        if (currentDraft) socket.emit('draft_update', currentDraft);
      }

      if (room.status === 'tournament' && room.tournament) {
        socket.emit('tournament_update', room.tournament);
      }

      callback({ success: true, room, draftState: currentDraft, tournament: room.tournament });
    } else {
      callback({ success: false, message: 'Room not found or full' });
    }
  });

  socket.on('rejoin_room', ({ roomId, playerId }, callback) => {
    socket.join(roomId);

    if (playerId) {
      const room = roomManager.updatePlayerSocket(roomId, playerId, socket.id);

      if (room) {
        console.log(`Player ${playerId} reconnected via rejoin.`);
        io.to(roomId).emit('room_update', room);

        if (room.hostId === playerId) {
          console.log(`Host ${playerId} reconnected. Resuming draft timers.`);
          draftManager.setPaused(roomId, false);
        }

        let currentDraft = null;
        if (room.status === 'drafting') {
          currentDraft = draftManager.getDraft(roomId);
          if (currentDraft) socket.emit('draft_update', currentDraft);
        }

        let currentGame = null;
        if (room.status === 'playing') {
          currentGame = gameManager.getGame(roomId);
          if (currentGame) socket.emit('game_update', currentGame);
        } else if (room.status === 'tournament') {
          if (room.tournament) {
            socket.emit('tournament_update', room.tournament);
            const p = room.players.find(rp => rp.id === playerId);
            if (p && p.matchId) {
              currentGame = gameManager.getGame(p.matchId);
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

  socket.on('leave_room', ({ roomId, playerId }) => {
    const room = roomManager.leaveRoom(roomId, playerId);
    socket.leave(roomId);
    if (room) {
      console.log(`Player ${playerId} left room ${roomId}`);
      io.to(roomId).emit('room_update', room);
    } else {
      console.log(`Room ${roomId} closed/empty`);
    }
  });

  socket.on('kick_player', ({ roomId, targetId }) => {
    const context = getContext();
    if (!context || !context.player.isHost) return;

    const room = roomManager.getRoom(roomId);
    if (room) {
      const target = room.players.find(p => p.id === targetId);
      if (target) {
        const updatedRoom = roomManager.kickPlayer(roomId, targetId);
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

  socket.on('add_bot', ({ roomId }) => {
    const context = getContext();
    if (!context || !context.player.isHost) return;

    const updatedRoom = roomManager.addBot(roomId);
    if (updatedRoom) {
      io.to(roomId).emit('room_update', updatedRoom);
      console.log(`Bot added to room ${roomId}`);
    } else {
      socket.emit('error', { message: 'Failed to add bot (Room full?)' });
    }
  });

  socket.on('remove_bot', ({ roomId, botId }) => {
    const context = getContext();
    if (!context || !context.player.isHost) return;

    const updatedRoom = roomManager.removeBot(roomId, botId);
    if (updatedRoom) {
      io.to(roomId).emit('room_update', updatedRoom);
      console.log(`Bot ${botId} removed from room ${roomId}`);
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected', socket.id);

    const result = roomManager.setPlayerOffline(socket.id);
    if (result) {
      const { room, playerId } = result;
      console.log(`Player ${playerId} disconnected from room ${room.id}`);

      io.to(room.id).emit('room_update', room);

      if (room.status === 'drafting') {
        const hostOffline = room.players.find(p => p.id === room.hostId)?.isOffline;

        if (hostOffline) {
          console.log("Host is offline. Pausing game (stopping all timers).");
          draftManager.setPaused(room.id, true);
        }
      }
    }
  });
};
