import React, { createContext, useContext, useState, useCallback } from 'react';

export interface GameLogEntry {
  id: string;
  timestamp: number;
  message: string;
  source: 'System' | 'Player' | 'Opponent' | string;
  type: 'info' | 'action' | 'combat' | 'error' | 'success' | 'warning';
}

interface GameLogContextType {
  logs: GameLogEntry[];
  addLog: (message: string, type?: GameLogEntry['type'], source?: string) => void;
  clearLogs: () => void;
}

const GameLogContext = createContext<GameLogContextType | undefined>(undefined);

export const GameLogProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [logs, setLogs] = useState<GameLogEntry[]>([]);

  const addLog = useCallback((message: string, type: GameLogEntry['type'] = 'info', source: string = 'System') => {
    const newLog: GameLogEntry = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: Date.now(),
      message,
      source,
      type
    };
    setLogs(prev => [...prev, newLog]);
  }, []);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  return (
    <GameLogContext.Provider value={{ logs, addLog, clearLogs }}>
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
