import { useEffect, useState, useCallback, useRef } from 'react';
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

  // Ref to track current room ID for validation in event listeners
  const activeRoomIdRef = useRef<string | null>(null);

  // Keep ref in sync with state
  useEffect(() => {
    activeRoomIdRef.current = activeRoom?.id || null;
  }, [activeRoom]);

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
    const onGameUpdate = (arg1: any, arg2?: any) => {
      // Handle both (roomId, game) and (game) signatures to be safe,
      // but prioritize (game) as per recent server handler observations.
      const game = (arg2 && typeof arg2 === 'object') ? arg2 : arg1;
      // If arg1 is the game, utilize it.

      if (game && game.id) {
        // CRITICAL: Validate that this game update is for the current room
        // This prevents game state from old rooms bleeding into new rooms
        const currentRoomId = activeRoomIdRef.current;
        console.log('[useGameSocket] game_update received. Game ID:', game.id, 'Game roomId:', game.roomId, 'Current roomId:', currentRoomId);
        if (currentRoomId && game.roomId && game.roomId !== currentRoomId) {
          console.warn(`[useGameSocket] Ignoring game_update for different room. Current: ${currentRoomId}, Received: ${game.roomId}`);
          return;
        }

        console.log('[useGameSocket] Game Update Accepted', game.turnCount, game.phase, game.step);
        setGameState(game);
      } else {
        console.warn('[useGameSocket] Received invalid game update', arg1, arg2);
      }
    };

    const onRoomUpdate = (room: any) => {
      // CRITICAL: Validate that this room update is for the current room
      const currentRoomId = activeRoomIdRef.current;
      if (currentRoomId && room && room.id && room.id !== currentRoomId) {
        console.warn(`[useGameSocket] Ignoring room_update for different room. Current: ${currentRoomId}, Received: ${room.id}`);
        return;
      }
      setActiveRoom(room);
    };

    const onDraftUpdate = (state: any) => {
      // CRITICAL: Validate that this draft update is for the current room
      const currentRoomId = activeRoomIdRef.current;
      if (currentRoomId && state && state.roomId && state.roomId !== currentRoomId) {
        console.warn(`[useGameSocket] Ignoring draft_update for different room. Current: ${currentRoomId}, Received: ${state.roomId}`);
        return;
      }
      setDraftState(state);
    }

    const onError = (msg: string) => {
      setError(msg);
    }

    const onRoomClosed = (data: { message: string }) => {
      console.log('[useGameSocket] Room closed by host:', data.message);
      setError(data.message);
      // Clear room state after a delay to allow user to see the message
      setTimeout(() => {
        setActiveRoom(null);
        setGameState(null);
        setDraftState(null);
        localStorage.removeItem('active_room_id');
      }, 2000);
    };

    const onNewMessage = (message: { id: string; sender: string; text: string; timestamp: string }) => {
      setActiveRoom((prevRoom: any) => {
        if (!prevRoom) return prevRoom;
        const existingMessages = prevRoom.messages || [];
        // Prevent duplicate messages
        if (existingMessages.some((m: any) => m.id === message.id)) {
          return prevRoom;
        }
        return {
          ...prevRoom,
          messages: [...existingMessages, message]
        };
      });
    };

    socketService.socket.on('game_update', onGameUpdate);
    socketService.socket.on('room_update', onRoomUpdate);
    socketService.socket.on('draft_update', onDraftUpdate);
    socketService.socket.on('error', onError);
    socketService.socket.on('room_closed', onRoomClosed);
    socketService.socket.on('new_message', onNewMessage);

    return () => {
      socketService.socket.off('game_update', onGameUpdate);
      socketService.socket.off('room_update', onRoomUpdate);
      socketService.socket.off('draft_update', onDraftUpdate);
      socketService.socket.off('error', onError);
      socketService.socket.off('room_closed', onRoomClosed);
      socketService.socket.off('new_message', onNewMessage);
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

  const createRoom = useCallback(async (payload: any) => {
    // CRITICAL: Clear any existing game/draft state BEFORE creating a new room
    // This prevents old game state from bleeding into the new room
    setGameState(null);
    setDraftState(null);

    const response = await socketService.emitPromise('create_room', payload);
    if (response.success) {
      // payload has hostId. room has id.
      // socketService.setCredentials(response.room.id, payload.hostId);
      // Wait, let's verify payload structure. usually { hostId, hostName ... }
      if (response.room && payload.hostId) {
        socketService.setCredentials(response.room.id, payload.hostId);
      }
    }
    return response;
  }, []);

  const joinRoom = useCallback(async (payload: any) => {
    // CRITICAL: Clear any existing state BEFORE joining a new room
    // This prevents old state from bleeding into the new room
    setGameState(null);
    setDraftState(null);

    const response = await socketService.emitPromise('join_room', payload);
    if (response.success) {
      if (response.gameState) setGameState(response.gameState);
      if (response.room) setActiveRoom(response.room);
      if (response.draftState) setDraftState(response.draftState);

      if (payload.roomId && payload.playerId) {
        socketService.setCredentials(payload.roomId, payload.playerId);
      }
    }
    return response;
  }, []);

  const rejoinRoom = useCallback(async (payload: any) => {
    // Clear existing state before rejoining to prevent stale data
    // Note: We clear BEFORE the request, so if rejoin fails, state is clean
    setGameState(null);
    setDraftState(null);

    const response = await socketService.emitPromise('rejoin_room', payload);
    if (response.success) {
      if (response.gameState) setGameState(response.gameState);
      if (response.room) setActiveRoom(response.room);
      if (response.draftState) setDraftState(response.draftState);

      if (payload.roomId && payload.playerId) {
        socketService.setCredentials(payload.roomId, payload.playerId);
      }
    }
    return response;
  }, []);

  const leaveRoom = useCallback((payload: any) => {
    socketService.socket.emit('leave_room', payload);
    setActiveRoom(null);
    setGameState(null);
    socketService.setCredentials('', ''); // Clear credentials
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
