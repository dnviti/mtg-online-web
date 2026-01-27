import React, { useEffect, useRef } from 'react';
import { useGameLog, GameLogEntry, CardReference } from '../contexts/GameLogContext';
import { ScrollText, User, Bot, Info, AlertTriangle, ShieldAlert, ArrowRightLeft } from 'lucide-react';

interface GameLogPanelProps {
  className?: string;
  maxHeight?: string;
  onCardHover?: (card: CardReference | null) => void;
}

// Component for rendering a card name with hover preview
const CardNameWithPreview: React.FC<{ card: CardReference; onHover?: (card: CardReference | null) => void }> = ({ card, onHover }) => {
  return (
    <span
      className="text-amber-300 font-semibold cursor-pointer hover:text-amber-200 hover:underline transition-colors"
      onMouseEnter={() => onHover?.(card)}
      onMouseLeave={() => onHover?.(null)}
    >
      {card.name}
    </span>
  );
};

// Parse message and replace card references with hoverable components
const renderMessageWithCards = (message: string, cards?: CardReference[], onCardHover?: (card: CardReference | null) => void) => {
  if (!cards || cards.length === 0) {
    return <span>{message}</span>;
  }

  // Create a map of card names for quick lookup
  const cardMap = new Map(cards.map(c => [c.name.toLowerCase(), c]));

  // Split message by card name patterns (wrapped in curly braces like {Card Name})
  const parts = message.split(/\{([^}]+)\}/g);

  return (
    <>
      {parts.map((part, index) => {
        // Odd indices are the captured card names
        if (index % 2 === 1) {
          const card = cardMap.get(part.toLowerCase());
          if (card) {
            return <CardNameWithPreview key={index} card={card} onHover={onCardHover} />;
          }
          // Fallback: just render the name in amber if card data missing
          return <span key={index} className="text-amber-300 font-semibold">{part}</span>;
        }
        return <span key={index}>{part}</span>;
      })}
    </>
  );
};

export const GameLogPanel: React.FC<GameLogPanelProps> = ({ className, maxHeight = '200px', onCardHover }) => {
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
    if (type === 'zone') return <ArrowRightLeft className="w-3 h-3 text-purple-400" />;
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
      case 'zone': return 'text-purple-300 bg-purple-900/10 border-purple-900/30';
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
                  {renderMessageWithCards(log.message, log.cards, onCardHover)}
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
