import { Server, Socket } from 'socket.io';
import { roomManager } from '../../singletons';

export const registerChatHandlers = (io: Server, socket: Socket) => {
  socket.on('send_message', ({ roomId, sender, text }) => {
    const message = roomManager.addMessage(roomId, sender, text);
    if (message) {
      io.to(roomId).emit('new_message', message);
    }
  });
};
