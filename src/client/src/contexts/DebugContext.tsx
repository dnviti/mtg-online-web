import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { DebugPauseEvent, DebugStateEvent } from '../types/game';
import { socketService } from '../services/SocketService';

interface DebugContextValue {
  // State
  debugEnabled: boolean;       // Whether DEV_MODE is true (shows debug UI)
  isDebugActive: boolean;      // Whether debugging is currently active (can be toggled off)
  pauseEvent: DebugPauseEvent | null;
  debugState: DebugStateEvent | null;
  highlightedCardIds: Set<string>;
  sourceCardId: string | null;

  // Actions
  continueAction: () => void;
  cancelAction: () => void;
  undo: () => void;
  redo: () => void;
  toggleDebug: (enabled: boolean) => void;
  clearHistory: () => void;
  clearPause: () => void;
  setPauseEvent: (event: DebugPauseEvent | null) => void;
  setDebugState: (state: DebugStateEvent | null) => void;
}

const DebugContext = createContext<DebugContextValue | null>(null);

export const useDebug = () => {
  const context = useContext(DebugContext);
  if (!context) {
    throw new Error('useDebug must be used within a DebugProvider');
  }
  return context;
};

interface DebugProviderProps {
  children: React.ReactNode;
}

export const DebugProvider: React.FC<DebugProviderProps> = ({ children }) => {
  // Check if DEV_MODE is enabled via Vite env (controls UI visibility)
  const debugEnabled = import.meta.env.VITE_DEV_MODE === 'true';

  const [pauseEvent, setPauseEvent] = useState<DebugPauseEvent | null>(null);
  const [debugState, setDebugState] = useState<DebugStateEvent | null>(null);

  // isDebugActive tracks whether debugging is currently active (can be toggled off)
  // This comes from the server's debug state
  const isDebugActive = debugState?.enabled ?? debugEnabled;

  // Compute highlighted cards from pause event
  const highlightedCardIds = new Set<string>(
    pauseEvent?.affectedCards?.map(c => c.instanceId) || []
  );
  const sourceCardId = pauseEvent?.sourceCard?.instanceId || null;

  // Socket event listeners
  useEffect(() => {
    if (!debugEnabled) return;

    const socket = socketService.socket;
    if (!socket) return;

    const handleDebugPause = (event: DebugPauseEvent) => {
      console.log('[DebugContext] Received debug_pause:', event);
      setPauseEvent(event);
    };

    const handleDebugState = (state: DebugStateEvent) => {
      console.log('[DebugContext] Received debug_state:', state);
      setDebugState(state);
    };

    socket.on('debug_pause', handleDebugPause);
    socket.on('debug_state', handleDebugState);

    return () => {
      socket.off('debug_pause', handleDebugPause);
      socket.off('debug_state', handleDebugState);
    };
  }, [debugEnabled]);

  const continueAction = useCallback(() => {
    if (!pauseEvent) return;
    console.log('[DebugContext] Continuing action:', pauseEvent.snapshotId);
    socketService.socket?.emit('debug_continue', { snapshotId: pauseEvent.snapshotId });
    setPauseEvent(null);
  }, [pauseEvent]);

  const cancelAction = useCallback(() => {
    if (!pauseEvent) return;
    console.log('[DebugContext] Cancelling action:', pauseEvent.snapshotId);
    socketService.socket?.emit('debug_cancel', { snapshotId: pauseEvent.snapshotId });
    setPauseEvent(null);
  }, [pauseEvent]);

  const undo = useCallback(() => {
    console.log('[DebugContext] Undo');
    socketService.socket?.emit('debug_undo');
  }, []);

  const redo = useCallback(() => {
    console.log('[DebugContext] Redo');
    socketService.socket?.emit('debug_redo');
  }, []);

  const toggleDebug = useCallback((enabled: boolean) => {
    console.log('[DebugContext] Toggle debug:', enabled);
    socketService.socket?.emit('debug_toggle', { enabled });
  }, []);

  const clearHistory = useCallback(() => {
    console.log('[DebugContext] Clear history');
    socketService.socket?.emit('debug_clear_history');
  }, []);

  const clearPause = useCallback(() => {
    setPauseEvent(null);
  }, []);

  const value: DebugContextValue = {
    debugEnabled,
    isDebugActive,
    pauseEvent,
    debugState,
    highlightedCardIds,
    sourceCardId,
    continueAction,
    cancelAction,
    undo,
    redo,
    toggleDebug,
    clearHistory,
    clearPause,
    setPauseEvent,
    setDebugState,
  };

  return (
    <DebugContext.Provider value={value}>
      {children}
    </DebugContext.Provider>
  );
};

export default DebugContext;
