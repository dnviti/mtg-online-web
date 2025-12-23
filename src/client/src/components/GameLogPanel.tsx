import React, { useEffect, useRef } from 'react';
import { useGameLog, GameLogEntry } from '../contexts/GameLogContext';
import { ScrollText, User, Bot, Info, AlertTriangle, ShieldAlert } from 'lucide-react';

interface GameLogPanelProps {
  className?: string;
  maxHeight?: string;
}

export const GameLogPanel: React.FC<GameLogPanelProps> = ({ className, maxHeight = '200px' }) => {
  const { logs } = useGameLog();
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new logs
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const getIcon = (type: GameLogEntry['type'], source: string) => {
    if (source === 'System') return <Info className="w-3 h-3 text-slate-500" />;
    if (type === 'error') return <AlertTriangle className="w-3 h-3 text-red-500" />;
    if (type === 'combat') return <ShieldAlert className="w-3 h-3 text-red-400" />;
    if (source.includes('Bot')) return <Bot className="w-3 h-3 text-indigo-400" />;
    return <User className="w-3 h-3 text-blue-400" />;
  };

  const getTypeStyle = (type: GameLogEntry['type']) => {
    switch (type) {
      case 'error': return 'text-red-400 bg-red-900/10 border-red-900/30';
      case 'warning': return 'text-amber-400 bg-amber-900/10 border-amber-900/30';
      case 'success': return 'text-emerald-400 bg-emerald-900/10 border-emerald-900/30';
      case 'combat': return 'text-red-300 bg-red-900/20 border-red-900/40 font-bold';
      case 'action': return 'text-blue-300 bg-blue-900/10 border-blue-900/30';
      default: return 'text-slate-300 border-transparent';
    }
  };

  return (
    <div className={`flex flex-col bg-slate-900 border-t border-slate-800 ${className} overflow-hidden`} style={{ maxHeight }}>
      <div className="flex items-center gap-2 px-3 py-1 bg-slate-950 border-b border-slate-800 shrink-0">
        <ScrollText className="w-3 h-3 text-slate-500" />
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Game Log</span>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar text-xs font-mono">
        {logs.length === 0 && (
          <div className="text-slate-600 italic px-2 py-4 text-center">
            Game started. Actions will appear here.
          </div>
        )}

        {logs.map((log) => (
          <div
            key={log.id}
            className={`
              relative pl-2 pr-2 py-1.5 rounded border-l-2
              ${getTypeStyle(log.type)} 
              animate-in fade-in slide-in-from-left-2 duration-300
            `}
          >
            <div className="flex items-start gap-2">
              <div className="mt-0.5 shrink-0 opacity-70">
                {getIcon(log.type, log.source)}
              </div>
              <div className="flex flex-col min-w-0">
                {/* Source Header */}
                {log.source !== 'System' && (
                  <span className="text-[10px] font-bold opacity-70 mb-0.5 leading-none">
                    {log.source}
                  </span>
                )}
                {/* Message Body */}
                <span className="leading-tight break-words">
                  {log.message}
                </span>
              </div>
              <span className="ml-auto text-[9px] text-slate-600 whitespace-nowrap mt-0.5">
                {new Date(log.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
};
