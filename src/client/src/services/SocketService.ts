/// <reference types="vite/client" />

import { io, Socket } from 'socket.io-client';

const URL = import.meta.env.PROD ? undefined : `http://${window.location.hostname}:3000`;

class SocketService {
  public socket: Socket;

  private roomId: string | null = null;
  private playerId: string | null = null;

  constructor() {
    this.socket = io(URL, {
      autoConnect: false,
      transports: ['websocket']
    });

    // Debug Wrapper
    const originalEmit = this.socket.emit;
    this.socket.emit = (event: string, ...args: any[]) => {
      console.log(`[Socket] 📤 Emitting: ${event}`, args);
      return originalEmit.apply(this.socket, [event, ...args]);
    };

    this.socket.on('connect', () => {
      console.log('[Socket] Connected');
      if (this.roomId && this.playerId) {
        console.log(`[Socket] Auto-rejoining room ${this.roomId} as ${this.playerId}`);
        this.socket.emit('rejoin_room', { roomId: this.roomId, playerId: this.playerId });
      }
    });
  }

  setCredentials(roomId: string, playerId: string) {
    this.roomId = roomId;
    this.playerId = playerId;
  }

  getCredentials() {
    return { roomId: this.roomId, playerId: this.playerId };
  }

  connect() {
    this.socket.connect();
  }

  disconnect() {
    this.socket.disconnect();
  }

  // Helper method to make requests with acknowledgements
  emitPromise(event: string, data: any): Promise<any> {
    return new Promise((resolve, reject) => {
      this.socket.emit(event, data, (response: any) => {
        if (response?.error) {
          reject(response.error);
        } else {
          resolve(response);
        }
      });
    });
  }
}

export const socketService = new SocketService();
