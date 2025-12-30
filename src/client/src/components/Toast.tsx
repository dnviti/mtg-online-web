
import React, { createContext, useContext, useState, useCallback } from 'react';
import { X, Check, AlertCircle, Info, Joystick } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info' | 'warning' | 'game-event';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType, duration?: number) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: ToastType = 'info', duration = 3000) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type, duration }]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, duration);
  }, []);

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-3 pointer-events-none w-full max-w-sm px-4">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`
              pointer-events-auto
              flex items-center gap-4 px-4 py-3 rounded-xl border shadow-2xl
              animate-in slide-in-from-top-full fade-in zoom-in-95 duration-300
              text-white
              ${toast.type === 'success' ? 'bg-slate-800 border-emerald-500/50 shadow-emerald-900/20' :
                toast.type === 'error' ? 'bg-slate-800 border-red-500/50 shadow-red-900/20' :
                  toast.type === 'warning' ? 'bg-slate-800 border-amber-500/50 shadow-amber-900/20' :
                    toast.type === 'game-event' ? 'bg-indigo-900/90 border-indigo-500/50 shadow-indigo-900/20 backdrop-blur-md' :
                      'bg-slate-800 border-blue-500/50 shadow-blue-900/20'}
            `}
          >
            <div className={`p-2 rounded-full shrink-0 ${toast.type === 'success' ? 'bg-emerald-500/10 text-emerald-400' :
              toast.type === 'error' ? 'bg-red-500/10 text-red-400' :
                toast.type === 'warning' ? 'bg-amber-500/10 text-amber-400' :
                  toast.type === 'game-event' ? 'bg-indigo-500/10 text-indigo-400' :
                    'bg-blue-500/10 text-blue-400'
              }`}>
              {toast.type === 'success' && <Check className="w-5 h-5" />}
              {toast.type === 'error' && <AlertCircle className="w-5 h-5" />}
              {toast.type === 'warning' && <AlertCircle className="w-5 h-5" />}
              {toast.type === 'info' && <Info className="w-5 h-5" />}
              {toast.type === 'game-event' && <Joystick className="w-5 h-5" />}
            </div>

            <div className="flex-1 text-sm font-medium">
              {toast.message}
            </div>

            <button
              onClick={() => removeToast(toast.id)}
              className="p-1 hover:bg-white/10 rounded transition-colors text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};
