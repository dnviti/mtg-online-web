import express, { Request, Response } from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { RoomManager } from './managers/RoomManager';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*", // Adjust for production
    methods: ["GET", "POST"]
  }
});

const roomManager = new RoomManager();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// API Routes
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

// Socket.IO logic
io.on('connection', (socket) => {
  console.log('A user connected', socket.id);

  socket.on('create_room', ({ hostId, hostName, packs }, callback) => {
    const room = roomManager.createRoom(hostId, hostName, packs);
    socket.join(room.id);
    console.log(`Room created: ${room.id} by ${hostName}`);
    callback({ success: true, room });
  });

  socket.on('join_room', ({ roomId, playerId, playerName }, callback) => {
    const room = roomManager.joinRoom(roomId, playerId, playerName);
    if (room) {
      socket.join(room.id);
      console.log(`Player ${playerName} joined room ${roomId}`);
      io.to(room.id).emit('room_update', room); // Broadcast update
      callback({ success: true, room });
    } else {
      callback({ success: false, message: 'Room not found or full' });
    }
  });

  socket.on('rejoin_room', ({ roomId }) => {
    // Just rejoin the socket channel if validation passes (not fully secure yet)
    socket.join(roomId);
    const room = roomManager.getRoom(roomId);
    if (room) socket.emit('room_update', room);
  });

  socket.on('send_message', ({ roomId, sender, text }) => {
    const message = roomManager.addMessage(roomId, sender, text);
    if (message) {
      io.to(roomId).emit('new_message', message);
    }
  });

  socket.on('start_game', ({ roomId }) => {
    const room = roomManager.startGame(roomId);
    if (room) {
      io.to(roomId).emit('room_update', room);
      // Here we would also emit 'draft_state' with initial packs
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected', socket.id);
    // TODO: Handle player disconnect (mark as offline but don't kick immediately)
  });
});

import os from 'os';

httpServer.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);

  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]!) {
      if (iface.family === 'IPv4' && !iface.internal) {
        console.log(`  - Network IP: http://${iface.address}:${PORT}`);
      }
    }
  }
});
