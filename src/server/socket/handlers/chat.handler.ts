import { Server, Socket } from 'socket.io';
import { roomManager } from '../../singletons';

export const registerChatHandlers = (io: Server, socket: Socket) => {
  socket.on('send_message', async ({ roomId, sender, text }) => {
    // We expect roomManager to return { message, room } now
    const result = await roomManager.addMessage(roomId, sender, text);
    if (result) {
      io.to(roomId).emit('new_message', result.message);
    }
  });
};
