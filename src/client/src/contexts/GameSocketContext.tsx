import React, { createContext, useContext, ReactNode } from 'react';
import { useGameSocket, GameSocketHook } from '../hooks/useGameSocket';

const GameSocketContext = createContext<GameSocketHook | null>(null);

export const GameSocketProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const socketHook = useGameSocket();

  return (
    <GameSocketContext.Provider value={socketHook}>
      {children}
    </GameSocketContext.Provider>
  );
};

export const useGameContext = (): GameSocketHook => {
  const context = useContext(GameSocketContext);
  if (!context) {
    throw new Error('useGameContext must be used within a GameSocketProvider');
  }
  return context;
};
