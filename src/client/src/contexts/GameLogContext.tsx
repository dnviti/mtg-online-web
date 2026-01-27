import React, { createContext, useContext, useState, useCallback } from 'react';

export interface CardReference {
  name: string;
  imageUrl?: string;
  imageArtCrop?: string;
  manaCost?: string;
  typeLine?: string;
  oracleText?: string;
}

export interface GameLogEntry {
  id: string;
  timestamp: number;
  message: string;
  source: 'System' | 'Player' | 'Opponent' | string;
  type: 'info' | 'action' | 'combat' | 'error' | 'success' | 'warning' | 'zone';
  cards?: CardReference[];
}

interface GameLogContextType {
  logs: GameLogEntry[];
  addLog: (message: string, type?: GameLogEntry['type'], source?: string, cards?: CardReference[]) => void;
  addLogs: (newLogs: GameLogEntry[]) => void;
  syncLogs: (serverLogs: GameLogEntry[]) => void;
  clearLogs: () => void;
}

const GameLogContext = createContext<GameLogContextType | undefined>(undefined);

export const GameLogProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [logs, setLogs] = useState<GameLogEntry[]>([]);

  const addLog = useCallback((message: string, type: GameLogEntry['type'] = 'info', source: string = 'System', cards?: CardReference[]) => {
    const newLog: GameLogEntry = {
      id: Math.random().toString(36).substring(2, 11),
      timestamp: Date.now(),
      message,
      source,
      type,
      cards
    };
    setLogs(prev => [...prev, newLog]);
  }, []);

  // Add multiple logs (for real-time updates from server)
  const addLogs = useCallback((newLogs: GameLogEntry[]) => {
    if (newLogs.length === 0) return;
    setLogs(prev => {
      // Filter out any logs that already exist (by id)
      const existingIds = new Set(prev.map(l => l.id));
      const uniqueNewLogs = newLogs.filter(l => !existingIds.has(l.id));
      return [...prev, ...uniqueNewLogs];
    });
  }, []);

  // Sync logs from server (replaces local logs with server state)
  const syncLogs = useCallback((serverLogs: GameLogEntry[]) => {
    setLogs(serverLogs || []);
  }, []);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  return (
    <GameLogContext.Provider value={{ logs, addLog, addLogs, syncLogs, clearLogs }}>
      {children}
    </GameLogContext.Provider>
  );
};

export const useGameLog = () => {
  const context = useContext(GameLogContext);
  if (!context) {
    throw new Error('useGameLog must be used within a GameLogProvider');
  }
  return context;
};
