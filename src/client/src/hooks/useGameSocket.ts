import { useEffect, useState, useCallback } from 'react';
import { socketService } from '../services/SocketService';
import { GameState } from '../types/game';

export interface GameSocketHook {
  isConnected: boolean;
  gameState: GameState | null;
  activeRoom: any | null; // Room object
  error: string | null;
  draftState: any | null; // Added draftState to interface

  connect: () => void;
  disconnect: () => void;

  // Room Actions
  createRoom: (payload: any) => Promise<any>;
  joinRoom: (payload: any) => Promise<any>;
  rejoinRoom: (payload: any) => Promise<any>;
  leaveRoom: (payload: any) => void;

  // Game Actions
  sendGameAction: (actionType: string, payload: any) => void;
  sendStrictAction: (actionType: string, payload: any) => void;

  // State Setters (for manual overrides if needed)
  setGameState: (state: GameState | null) => void;
  setActiveRoom: (room: any | null) => void;
}

export const useGameSocket = (): GameSocketHook => {
  const [isConnected, setIsConnected] = useState(socketService.socket.connected);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [activeRoom, setActiveRoom] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draftState, setDraftState] = useState<any | null>(null); // Track draft state too if needed

  // Listen for connection status
  useEffect(() => {
    const onConnect = () => setIsConnected(true);
    const onDisconnect = () => setIsConnected(false);

    socketService.socket.on('connect', onConnect);
    socketService.socket.on('disconnect', onDisconnect);

    return () => {
      socketService.socket.off('connect', onConnect);
      socketService.socket.off('disconnect', onDisconnect);
    };
  }, []);

  // Listen for Game/Room Updates
  useEffect(() => {
    const onGameUpdate = (_roomId: string, game: GameState) => {
      console.log('[useGameSocket] Game Update Received', game.turnCount, game.phase, game.step);
      setGameState(game);
    };

    const onRoomUpdate = (room: any) => {
      setActiveRoom(room);
    };

    const onDraftUpdate = (state: any) => {
      setDraftState(state);
    }

    const onError = (msg: string) => {
      setError(msg);
    }

    socketService.socket.on('game_update', onGameUpdate);
    socketService.socket.on('room_update', onRoomUpdate);
    socketService.socket.on('draft_update', onDraftUpdate);
    socketService.socket.on('error', onError);

    return () => {
      socketService.socket.off('game_update', onGameUpdate);
      socketService.socket.off('room_update', onRoomUpdate);
      socketService.socket.off('draft_update', onDraftUpdate);
      socketService.socket.off('error', onError);
    };
  }, []);

  const connect = useCallback(() => {
    if (!socketService.socket.connected) {
      socketService.connect();
    }
  }, []);

  const disconnect = useCallback(() => {
    if (socketService.socket.connected) {
      socketService.disconnect();
    }
  }, []);

  const createRoom = useCallback((payload: any) => {
    return socketService.emitPromise('create_room', payload);
  }, []);

  const joinRoom = useCallback(async (payload: any) => {
    const response = await socketService.emitPromise('join_room', payload);
    if (response.success) {
      if (response.gameState) setGameState(response.gameState);
      if (response.room) setActiveRoom(response.room);
      if (response.draftState) setDraftState(response.draftState);
    }
    return response;
  }, []);

  const rejoinRoom = useCallback(async (payload: any) => {
    const response = await socketService.emitPromise('rejoin_room', payload);
    if (response.success) {
      if (response.gameState) setGameState(response.gameState);
      if (response.room) setActiveRoom(response.room);
      if (response.draftState) setDraftState(response.draftState);
    }
    return response;
  }, []);

  const leaveRoom = useCallback((payload: any) => {
    socketService.socket.emit('leave_room', payload);
    setActiveRoom(null);
    setGameState(null);
  }, []);

  const sendGameAction = useCallback((actionType: string, payload: any) => {
    socketService.socket.emit('game_action', {
      action: {
        type: actionType,
        ...payload
      }
    });
  }, []);

  const sendStrictAction = useCallback((actionType: string, payload: any) => {
    socketService.socket.emit('game_strict_action', {
      action: {
        type: actionType,
        ...payload
      }
    });
  }, []);

  return {
    isConnected,
    gameState,
    activeRoom,
    error,
    connect,
    disconnect,
    createRoom,
    joinRoom,
    rejoinRoom,
    leaveRoom,
    sendGameAction,
    sendStrictAction,
    setGameState,
    setActiveRoom,
    draftState
  };
};
