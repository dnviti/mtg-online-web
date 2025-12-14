
import { io, Socket } from 'socket.io-client';

const URL = `http://${window.location.hostname}:3000`;

class SocketService {
  public socket: Socket;

  constructor() {
    this.socket = io(URL, {
      autoConnect: false
    });
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
