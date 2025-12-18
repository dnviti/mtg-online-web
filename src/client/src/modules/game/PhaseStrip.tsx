
import React from 'react';
import { GameState, Phase, Step } from '../../types/game';
import { Sun, Shield, Swords, Hourglass } from 'lucide-react';

interface PhaseStripProps {
  gameState: GameState;
}

export const PhaseStrip: React.FC<PhaseStripProps> = ({ gameState }) => {
  const currentPhase = gameState.phase as Phase;
  const currentStep = gameState.step as Step;

  // Phase Definitions
  const phases: { id: Phase; icon: React.ElementType; label: string }[] = [
    { id: 'beginning', icon: Sun, label: 'Beginning' },
    { id: 'main1', icon: Shield, label: 'Main 1' },
    { id: 'combat', icon: Swords, label: 'Combat' },
    { id: 'main2', icon: Shield, label: 'Main 2' },
    { id: 'ending', icon: Hourglass, label: 'End' },
  ];

  return (
    <div className="flex bg-black/40 backdrop-blur-md rounded-full p-1 border border-white/10 gap-1">
      {phases.map((p) => {
        const isActive = p.id === currentPhase;

        return (
          <div
            key={p.id}
            className={`
              relative flex items-center justify-center w-8 h-8 rounded-full transition-all duration-300
              ${isActive ? 'bg-emerald-500 text-white shadow-[0_0_10px_rgba(16,185,129,0.5)] scale-110 z-10' : 'text-slate-500 bg-transparent hover:bg-white/5'}
            `}
            title={p.label}
          >
            <p.icon size={16} />

            {/* Active Step Indicator (Text below or Tooltip) */}
            {isActive && (
              <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[10px] font-bold text-white uppercase tracking-wider whitespace-nowrap bg-black/80 px-2 py-0.5 rounded border border-white/10">
                {currentStep}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
};
