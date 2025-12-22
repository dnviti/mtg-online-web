import React, { useMemo } from 'react';
import { GameState, Phase, Step } from '../../types/game';
import { ManaIcon } from '../../components/ManaIcon';
import { Shield, Swords, Hourglass, Zap, Hand, ChevronRight, XCircle, Play, Clock, Files, Crosshair, Skull, Flag, Moon, Trash2 } from 'lucide-react';

interface PhaseStripProps {
  gameState: GameState;
  currentPlayerId: string;
  onAction: (type: string, payload?: any) => void;
  contextData?: any;
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

  // --- 1. Action Logic resolution ---
  let actionLabel = "Wait";
  let actionColor = "bg-slate-700";
  let actionType: string | null = null;
  let ActionIcon = Hourglass;
  let isActionEnabled = false;

  if (isYielding) {
    actionLabel = "Cancel Yield";
    actionColor = "bg-sky-600 hover:bg-sky-500";
    actionType = 'CANCEL_YIELD';
    ActionIcon = XCircle;
    isActionEnabled = true;
  } else if (hasPriority) {
    isActionEnabled = true;
    ActionIcon = ChevronRight;
    // Default Pass styling
    actionColor = "bg-emerald-600 hover:bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.4)]";

    if (currentStep === 'declare_attackers') {
      if (gameState.attackersDeclared) {
        actionLabel = "Confirm (Blockers)";
        actionType = 'PASS_PRIORITY';
      } else {
        const count = contextData?.attackers?.length || 0;
        if (count > 0) {
          actionLabel = `Attack (${count})`;
          actionType = 'DECLARE_ATTACKERS';
          ActionIcon = Swords;
          actionColor = "bg-red-600 hover:bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.4)]";
        } else {
          actionLabel = "Skip Combat";
          actionType = 'DECLARE_ATTACKERS';
          actionColor = "bg-slate-600 hover:bg-slate-500";
        }
      }
    } else if (currentStep === 'declare_blockers') {
      actionLabel = "Confirm Blocks";
      actionType = 'DECLARE_BLOCKERS';
      ActionIcon = Shield;
      actionColor = "bg-blue-600 hover:bg-blue-500 shadow-[0_0_10px_rgba(37,99,235,0.4)]";
    } else if (isStackEmpty) {
      // Standard Pass
      actionType = 'PASS_PRIORITY';
      if (gameState.phase === 'main1') actionLabel = "To Combat";
      else if (gameState.phase === 'main2') actionLabel = "End Turn";
      else actionLabel = "Pass";
    } else {
      // Resolve
      const topItem = gameState.stack![gameState.stack!.length - 1];
      actionLabel = "Resolve";
      actionType = 'PASS_PRIORITY';
      ActionIcon = Zap;
      actionColor = "bg-amber-600 hover:bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.4)]";
    }
  } else {
    // Waiting
    actionLabel = "Waiting...";
    ActionIcon = Hand;
    actionColor = "bg-white/5 text-slate-500 cursor-not-allowed";
    isActionEnabled = false;
  }

  const handleAction = (e: React.MouseEvent) => {
    e.stopPropagation();
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

  // --- 2. Phase/Step Definitions ---
  interface VisualStep {
    id: string;
    label: string;
    icon: React.ElementType;
    phase: Phase;
    step: Step;
  }

  const stepsList: VisualStep[] = useMemo(() => [
    { id: 'untap', label: 'Untap', icon: (props: any) => <ManaIcon symbol="untap" className="text-current" {...props} />, phase: 'beginning', step: 'untap' },
    { id: 'upkeep', label: 'Upkeep', icon: Clock, phase: 'beginning', step: 'upkeep' },
    { id: 'draw', label: 'Draw', icon: Files, phase: 'beginning', step: 'draw' },
    { id: 'main1', label: 'Main 1', icon: Zap, phase: 'main1', step: 'main' },
    { id: 'begin_combat', label: 'Combat Start', icon: Swords, phase: 'combat', step: 'beginning_combat' },
    { id: 'attackers', label: 'Attack', icon: Crosshair, phase: 'combat', step: 'declare_attackers' },
    { id: 'blockers', label: 'Block', icon: Shield, phase: 'combat', step: 'declare_blockers' },
    { id: 'damage', label: 'Damage', icon: Skull, phase: 'combat', step: 'combat_damage' },
    { id: 'end_combat', label: 'End Combat', icon: Flag, phase: 'combat', step: 'end_combat' },
    { id: 'main2', label: 'Main 2', icon: Zap, phase: 'main2', step: 'main' },
    { id: 'end', label: 'End Step', icon: Moon, phase: 'ending', step: 'end' },
    { id: 'cleanup', label: 'Cleanup', icon: Trash2, phase: 'ending', step: 'cleanup' },
  ], []);

  // Calculate Active Step Index
  // We need to match both Phase and Step because 'main' step exists in two phases
  const activeStepIndex = stepsList.findIndex(s => {
    if (s.phase === 'main1' || s.phase === 'main2') {
      return s.phase === currentPhase && s.step === 'main'; // Special handle for split main phases
    }
    return s.step === currentStep;
  });

  // Fallback if step mismatch
  const safeActiveIndex = activeStepIndex === -1 ? 0 : activeStepIndex;


  const themeBorder = isMyTurn ? 'border-emerald-500/30' : 'border-red-500/30';
  const themeShadow = isMyTurn ? 'shadow-[0_0_20px_-5px_rgba(16,185,129,0.3)]' : 'shadow-[0_0_20px_-5px_rgba(239,68,68,0.3)]';
  const themeText = isMyTurn ? 'text-emerald-400' : 'text-red-400';
  const themeBgActive = isMyTurn ? 'bg-emerald-500' : 'bg-red-500';
  const themePing = isMyTurn ? 'bg-emerald-400' : 'bg-red-400';
  const themePingSolid = isMyTurn ? 'bg-emerald-500' : 'bg-red-500';

  return (
    <div className="w-full h-full flex flex-col items-center gap-2 pointer-events-auto">

      {/* HUD Container */}
      <div className={`
        relative w-full h-10 bg-transparent rounded-none
        flex items-center justify-between px-4 shadow-none transition-all duration-300
        border-b-2
        ${themeBorder}
        ${themeShadow}
      `}>

        {/* SECTION 1: Phase Timeline (Left) */}
        <div className={`flex items-center gap-0.5 px-2 border-r border-white/5 h-full overflow-x-auto no-scrollbar`}>
          {stepsList.map((s, idx) => {
            const isActive = idx === safeActiveIndex;
            const isPast = idx < safeActiveIndex;
            const Icon = s.icon;

            return (
              <div key={s.id} className="relative group flex items-center justify-center min-w-[20px]">
                {/* Connector Line - simplified to just spacing/coloring */}
                {/* 
                {idx > 0 && (
                  <div className={`w-1 h-0.5 mx-px rounded-full ${isPast || isActive ? (isMyTurn ? 'bg-emerald-800' : 'bg-red-900') : 'bg-slate-800'}`} />
                )}
                 */}

                {/* Icon Node */}
                <div
                  className={`
                            rounded flex items-center justify-center transition-all duration-300
                            ${isActive
                      ? `w-6 h-6 ${themeBgActive} text-white shadow-lg z-10 scale-110 rounded-md`
                      : `w-5 h-5 ${isPast ? (isMyTurn ? 'text-emerald-800' : 'text-red-900') : 'text-slate-800'} text-opacity-80`}
                        `}
                  title={s.label}
                >
                  <Icon size={isActive ? 14 : 12} strokeWidth={isActive ? 2.5 : 2} />
                </div>
              </div>
            );
          })}
        </div>

        {/* SECTION 2: Info Panel (Center/Fill) */}
        <div className="flex-1 flex items-center justify-center gap-4 px-4 min-w-0">
          <div className="flex items-center gap-2">
            {hasPriority && (
              <span className="flex h-1.5 w-1.5 relative">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${themePing} opacity-75`}></span>
                <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${themePingSolid}`}></span>
              </span>
            )}
            <span className={`text-[10px] font-bold uppercase tracking-wider ${themeText}`}>
              {isMyTurn ? 'Your Turn' : "Opponent"}
            </span>
          </div>
          <div className="h-4 w-px bg-white/10" />
          <div className="text-sm font-medium text-slate-200 truncate capitalize tracking-tight">
            {currentStep.replace(/_/g, ' ')}
          </div>
        </div>

        {/* SECTION 3: Action Button (Right) */}
        <button
          onClick={handleAction}
          disabled={!isActionEnabled}
          className={`
                h-8 px-4 rounded flex items-center gap-2 transition-all duration-200
                font-bold text-xs uppercase tracking-wide text-white
                ${actionColor}
                ${isActionEnabled ? 'hover:brightness-110' : 'opacity-50 grayscale'}
             `}
        >
          <span>{actionLabel}</span>
          <ActionIcon size={14} />
        </button>

      </div>
    </div>
  );
};
