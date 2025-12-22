import React, { useMemo } from 'react';
import { GameState, Phase, Step } from '../../types/game';
import { Sun, Shield, Swords, Hourglass, Zap, Hand, ChevronRight, XCircle, Skull } from 'lucide-react';

interface PhaseStripProps {
  gameState: GameState;
  currentPlayerId: string;
  onAction: (type: string, payload?: any) => void;
  contextData?: any; // For attackers/blockers context
  isYielding?: boolean;
  onYieldToggle?: () => void;
}

export const PhaseStrip: React.FC<PhaseStripProps> = ({
  gameState,
  currentPlayerId,
  onAction,
  contextData,
  isYielding,
  onYieldToggle
}) => {
  const currentPhase = gameState.phase as Phase;
  const currentStep = gameState.step as Step;
  const isMyTurn = gameState.activePlayerId === currentPlayerId;
  const hasPriority = gameState.priorityPlayerId === currentPlayerId;
  const isStackEmpty = !gameState.stack || gameState.stack.length === 0;

  // --- Action Logic ---
  let actionLabel = "Wait";
  // Base style: Glassmorphism dark
  let baseStyle = "bg-slate-900/60 border-slate-700/50 text-slate-400";
  let hoverStyle = "";
  let glowStyle = "";
  let actionType: string | null = null;
  let actionIcon = Hourglass;

  if (isYielding) {
    actionLabel = "Yielding (Cancel)";
    baseStyle = "bg-sky-900/40 border-sky-500/30 text-sky-200";
    hoverStyle = "hover:bg-sky-900/60 hover:border-sky-400/50";
    glowStyle = "shadow-[0_0_20px_rgba(14,165,233,0.15)]";
    actionType = 'CANCEL_YIELD';
    actionIcon = XCircle;
  } else if (hasPriority) {
    // Interactive State: Subtle gradients, refined look
    baseStyle = "cursor-pointer bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 border-emerald-500/40 text-emerald-100";
    hoverStyle = "hover:border-emerald-400/80 hover:shadow-[0_0_15px_rgba(16,185,129,0.2)]";
    actionIcon = Zap;

    if (currentStep === 'declare_attackers') {
      if (gameState.attackersDeclared) {
        actionLabel = "Confirm Attacks";
        actionType = 'PASS_PRIORITY';
        actionIcon = Swords;
        baseStyle = "cursor-pointer bg-gradient-to-r from-orange-950/40 via-orange-900/40 to-orange-950/40 border-orange-500/50 text-orange-100";
        hoverStyle = "hover:border-orange-400 hover:shadow-[0_0_15px_rgba(249,115,22,0.2)]";
      } else {
        const count = contextData?.attackers?.length || 0;
        if (count > 0) {
          actionLabel = `Attack with ${count}`;
          actionType = 'DECLARE_ATTACKERS';
          actionIcon = Swords;
          baseStyle = "cursor-pointer bg-gradient-to-r from-red-950/60 via-red-900/60 to-red-950/60 border-red-500/50 text-red-100";
          hoverStyle = "hover:border-red-400 hover:shadow-[0_0_15px_rgba(239,68,68,0.25)]";
        } else {
          actionLabel = "Skip Combat";
          actionType = 'DECLARE_ATTACKERS';
          actionIcon = ChevronRight;
          // Neutral/Skip style
          baseStyle = "cursor-pointer bg-slate-900/80 border-slate-600/50 text-slate-300";
          hoverStyle = "hover:border-slate-500 hover:bg-slate-800";
        }
      }
    } else if (currentStep === 'declare_blockers') {
      actionLabel = "Declare Blockers";
      actionType = 'DECLARE_BLOCKERS';
      actionIcon = Shield;
      baseStyle = "cursor-pointer bg-gradient-to-r from-blue-950/60 via-blue-900/60 to-blue-950/60 border-blue-500/50 text-blue-100";
      hoverStyle = "hover:border-blue-400 hover:shadow-[0_0_15px_rgba(59,130,246,0.2)]";
    } else if (isStackEmpty) {
      // Standard Pass
      actionType = 'PASS_PRIORITY';
      actionIcon = ChevronRight;
      if (gameState.phase === 'main1') actionLabel = "To Combat";
      else if (gameState.phase === 'main2') actionLabel = "End Turn";
      else actionLabel = "Pass Turn";

      // Use a very sleek neutral/emerald gradient for standard progression
      baseStyle = "cursor-pointer bg-gradient-to-b from-slate-800 to-slate-900 border-white/10 text-slate-200";
      hoverStyle = "hover:border-white/30 hover:bg-slate-800";
    } else {
      // Resolve Check
      const topItem = gameState.stack![gameState.stack!.length - 1];
      actionLabel = `Resolve ${topItem?.name || ''}`;
      actionType = 'PASS_PRIORITY';
      actionIcon = Zap;
      baseStyle = "cursor-pointer bg-amber-950/40 border-amber-500/40 text-amber-100";
      hoverStyle = "hover:border-amber-400/80 hover:shadow-[0_0_15px_rgba(245,158,11,0.2)]";
    }
  } else {
    // Waiting State
    actionLabel = isMyTurn ? "Opponent Acting" : "Opponent's Turn";
    actionIcon = Hand;
    baseStyle = "bg-black/40 border-white/5 text-slate-500";
  }

  const handleAction = () => {
    if (isYielding) {
      onYieldToggle?.();
      return;
    }
    if (!hasPriority) return;

    if (actionType) {
      let payload: any = { type: actionType };
      if (actionType === 'DECLARE_ATTACKERS') {
        payload.attackers = contextData?.attackers || [];
      }
      onAction('game_strict_action', payload);
    }
  };

  // Phase Definitions
  const phases: { id: Phase; icon: React.ElementType; label: string }[] = useMemo(() => [
    { id: 'beginning', icon: Sun, label: 'Beginning' },
    { id: 'main1', icon: Shield, label: 'Main 1' },
    { id: 'combat', icon: Swords, label: 'Combat' },
    { id: 'main2', icon: Shield, label: 'Main 2' },
    { id: 'ending', icon: Hourglass, label: 'End' },
  ], []);

  const activePhaseIndex = phases.findIndex(p => p.id === currentPhase);

  return (
    <div className="flex flex-col items-center gap-2 w-full max-w-[420px] mx-auto pointer-events-auto transition-all duration-300">

      {/* Main Action Bar */}
      <div
        onClick={handleAction}
        className={`
            relative w-full h-11 rounded px-1 overflow-hidden transition-all duration-300
            flex items-center justify-between
            border backdrop-blur-md
            ${baseStyle}
            ${hoverStyle}
            ${glowStyle}
            ${!hasPriority && !isYielding ? 'grayscale-[0.5] opacity-90' : 'scale-[1.02] active:scale-[0.98]'}
        `}
      >
        {/* Progress Line (Top) */}
        {!hasPriority && (
          <div className="absolute top-0 left-0 w-full h-[1px] bg-white/5" />
        )}
        <div
          className={`absolute top-0 left-0 h-[2px] transition-all duration-700 ease-out z-0 ${hasPriority ? 'bg-emerald-500/50 shadow-[0_0_10px_rgba(16,185,129,0.8)]' : 'bg-white/10'}`}
          style={{ width: `${((activePhaseIndex + 1) / phases.length) * 100}%` }}
        />

        {/* Left: Phase Indicator */}
        <div className="flex items-center gap-3 z-10 pl-3 h-full border-r border-white/5 pr-3 bg-black/10">
          <div className={`p-1 rounded-sm ${isMyTurn ? 'text-slate-200' : 'text-slate-600'}`}>
            {(() => {
              const PhaseIcon = phases.find(p => p.id === currentPhase)?.icon || Sun;
              return <PhaseIcon size={14} strokeWidth={2.5} />;
            })()}
          </div>
        </div>

        {/* Center: Action Text */}
        <div className="flex flex-col items-center justify-center z-10 flex-1 px-2">
          <span className="text-xs font-black uppercase tracking-[0.2em] drop-shadow-sm whitespace-nowrap">
            {actionLabel}
          </span>
          {/* Detailed Step Subtext */}
          {hasPriority && (
            <span className="text-[9px] uppercase tracking-wider opacity-60 font-medium">
              {currentStep.replace(/_/g, ' ')}
            </span>
          )}
        </div>

        {/* Right: Interaction Icon */}
        <div className="flex items-center gap-2 z-10 pr-4 pl-3 border-l border-white/5 h-full bg-black/10">
          {(() => {
            const ActionIcon = actionIcon;
            return <ActionIcon size={16} className={hasPriority ? "text-emerald-100 drop-shadow-[0_0_5px_rgba(255,255,255,0.5)]" : "opacity-40"} />;
          })()}
        </div>
      </div>

      {/* Minimal Phase Dots */}
      <div className="flex gap-1.5 opacity-30 hover:opacity-80 transition-opacity pb-1">
        {phases.map((p, idx) => {
          const isActive = idx === activePhaseIndex;
          const isPast = idx < activePhaseIndex;
          return (
            <div
              key={p.id}
              className={`
                    h-1 rounded-full transition-all duration-300
                    ${isActive ? 'w-6 bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]' : 'w-1 bg-slate-400'}
                    ${isPast ? 'bg-slate-600' : ''}
                `}
            />
          );
        })}
      </div>

    </div>
  );
};
