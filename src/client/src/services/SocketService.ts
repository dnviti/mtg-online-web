/// <reference types="vite/client" />

import { io, Socket } from 'socket.io-client';

const URL = import.meta.env.PROD ? undefined : `http://${window.location.hostname}:3000`;

class SocketService {
  public socket: Socket;

  constructor() {
    this.socket = io(URL, {
      autoConnect: false
    });

    // Debug Wrapper
    const originalEmit = this.socket.emit;
    this.socket.emit = (event: string, ...args: any[]) => {
      console.log(`[Socket] 📤 Emitting: ${event}`, args);
      return originalEmit.apply(this.socket, [event, ...args]);
    };
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
