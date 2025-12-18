
import React from 'react';
import { GameState } from '../../types/game';
import { ArrowLeft, Sparkles } from 'lucide-react';

interface StackVisualizerProps {
  gameState: GameState;
}

export const StackVisualizer: React.FC<StackVisualizerProps> = ({ gameState }) => {
  const stack = gameState.stack || [];

  if (stack.length === 0) return null;

  return (
    <div className="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col-reverse gap-2 z-50 pointer-events-none">

      {/* Stack Container */}
      <div className="flex flex-col-reverse gap-2 items-end">
        {stack.map((item, index) => (
          <div
            key={item.id}
            className={`
                relative group pointer-events-auto
                w-64 bg-slate-900/90 backdrop-blur-md 
                border-l-4 border-amber-500 
                rounded-r-lg shadow-xl 
                p-3 transform transition-all duration-300
                hover:scale-105 hover:-translate-x-2
                flex flex-col gap-1
                animate-in slide-in-from-right fade-in duration-300
            `}
            style={{
              // Stagger visual for depth
              marginRight: `${index * 4}px`
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between text-xs text-amber-500 font-bold uppercase tracking-wider">
              <span>{item.type}</span>
              <Sparkles size={12} />
            </div>

            {/* Name */}
            <div className="text-white font-bold leading-tight">
              {item.name}
            </div>

            {/* Targets (if any) */}
            {item.targets && item.targets.length > 0 && (
              <div className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                <ArrowLeft size={10} />
                <span>Targets {item.targets.length} item(s)</span>
              </div>
            )}

            {/* Index Indicator */}
            <div className="absolute -left-3 top-1/2 -translate-y-1/2 w-6 h-6 bg-amber-600 rounded-full flex items-center justify-center text-xs font-bold text-white border-2 border-slate-900 shadow-lg">
              {index + 1}
            </div>

          </div>
        ))}
      </div>

      {/* Label */}
      <div className="text-right pr-2">
        <span className="text-amber-500/50 text-[10px] font-bold uppercase tracking-[0.2em] [writing-mode:vertical-rl] rotate-180">
          The Stack
        </span>
      </div>

    </div>
  );
};
