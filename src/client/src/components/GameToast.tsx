import React, { createContext, useContext, useState, useCallback } from 'react';
import { AlertCircle, CheckCircle, Info, XCircle } from 'lucide-react';

type GameToastType = 'success' | 'error' | 'info' | 'warning' | 'game-event';

interface GameToast {
  id: string;
  message: string;
  type: GameToastType;
  duration?: number;
}

interface GameToastContextType {
  showGameToast: (message: string, type?: GameToastType, duration?: number) => void;
}

const GameToastContext = createContext<GameToastContextType | undefined>(undefined);

export const useGameToast = () => {
  const context = useContext(GameToastContext);
  if (!context) {
    throw new Error('useGameToast must be used within a GameToastProvider');
  }
  return context;
};

export const GameToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<GameToast[]>([]);

  // Use a ref to keep track of timeouts so we can clear them (optional, but good practice)
  // For simplicity here, we just use the timeout inside the callback.

  const showGameToast = useCallback((message: string, type: GameToastType = 'info', duration = 3000) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type, duration }]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, duration);
  }, []);


  return (
    <GameToastContext.Provider value={{ showGameToast }}>
      {children}
      {/* 
        Positioning: 
        We want this to be distinct from the system toast (top-center). 
        Let's put it top-center but slightly lower, OR bottom-center?
        User request: "dedicated toast". 
        Let's try "Center Top" but with a very distinct style, possibly overlaying the game board directly.
        Actually, let's put it at the TOP CENTER, but occupying a dedicated space or just below the system header.
        
        Using z-[1000] to ensure it's above everything in the game.
      */}
      <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[1000] flex flex-col gap-2 pointer-events-none w-full max-w-md px-4 items-center">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`
              pointer-events-auto
              flex items-center gap-3 px-6 py-3 rounded-full shadow-[0_0_15px_rgba(0,0,0,0.5)]
              animate-in slide-in-from-top-4 fade-in zoom-in-95 duration-200
              border backdrop-blur-md
              ${toastStyles[toast.type]}
            `}
          >
            {getIcon(toast.type)}
            <span className="font-bold text-sm tracking-wide text-shadow-sm">{toast.message}</span>
          </div>
        ))}
      </div>
    </GameToastContext.Provider>
  );
};

const toastStyles: Record<GameToastType, string> = {
  success: 'bg-emerald-900/90 border-emerald-500/50 text-emerald-100',
  error: 'bg-red-900/90 border-red-500/50 text-red-100',
  warning: 'bg-amber-900/90 border-amber-500/50 text-amber-100',
  info: 'bg-slate-900/90 border-slate-500/50 text-slate-100',
  'game-event': 'bg-indigo-900/90 border-indigo-500/50 text-indigo-100',
};

const getIcon = (type: GameToastType) => {
  switch (type) {
    case 'success': return <CheckCircle className="w-5 h-5 text-emerald-400" />;
    case 'error': return <XCircle className="w-5 h-5 text-red-400" />;
    case 'warning': return <AlertCircle className="w-5 h-5 text-amber-400" />;
    case 'info': return <Info className="w-5 h-5 text-blue-400" />;
    case 'game-event': return <Info className="w-5 h-5 text-indigo-400" />;
  }
};
