
import React, { useRef } from 'react';
import { GameState } from '../../types/game';

interface SmartButtonProps {
  gameState: GameState;
  playerId: string;
  onAction: (type: string, payload?: any) => void;
  contextData?: any;
  isYielding?: boolean;
  onYieldToggle?: () => void;
}

export const SmartButton: React.FC<SmartButtonProps> = ({ gameState, playerId, onAction, contextData, isYielding, onYieldToggle }) => {
  const isMyPriority = gameState.priorityPlayerId === playerId;
  const isStackEmpty = !gameState.stack || gameState.stack.length === 0;

  let label = "Wait";
  let colorClass = "bg-slate-700 text-slate-400 cursor-not-allowed";
  let actionType: string | null = null;

  if (isYielding) {
    label = "Yielding... (Tap to Cancel)";
    colorClass = "bg-sky-600 hover:bg-sky-500 text-white shadow-[0_0_15px_rgba(2,132,199,0.5)] animate-pulse";
    // Tap to cancel yield
    actionType = 'CANCEL_YIELD';
  } else if (isMyPriority) {
    if (gameState.step === 'declare_attackers') {
      if (gameState.attackersDeclared) {
        label = "Pass (to Blockers)";
        colorClass = "bg-emerald-600 hover:bg-emerald-500 text-white shadow-[0_0_15px_rgba(16,185,129,0.5)] animate-pulse";
        actionType = 'PASS_PRIORITY';
      } else {
        const count = contextData?.attackers?.length || 0;
        label = count > 0 ? `Attack with ${count}` : "Skip Combat";
        colorClass = "bg-red-600 hover:bg-red-500 text-white shadow-[0_0_15px_rgba(239,68,68,0.5)] animate-pulse";
        actionType = 'DECLARE_ATTACKERS';
      }
    } else if (gameState.step === 'declare_blockers') {
      // Todo: blockers context
      label = "Declare Blockers";
      colorClass = "bg-blue-600 hover:bg-blue-500 text-white shadow-[0_0_15px_rgba(37,99,235,0.5)] animate-pulse";
      actionType = 'DECLARE_BLOCKERS';
    } else if (isStackEmpty) {
      // Pass Priority / Advance Step
      // If Main Phase, could technically play land/cast, but button defaults to Pass
      label = "Pass Turn/Phase";
      // If we want more granular: "Move to Combat" vs "End Turn" based on phase
      if (gameState.phase === 'main1') label = "Pass to Combat";
      else if (gameState.phase === 'main2') label = "End Turn";
      else label = "Pass";

      colorClass = "bg-emerald-600 hover:bg-emerald-500 text-white shadow-[0_0_15px_rgba(16,185,129,0.5)] animate-pulse";
      actionType = 'PASS_PRIORITY';
    } else {
      // Resolve Top Item
      const topItem = gameState.stack![gameState.stack!.length - 1];
      label = `Resolve ${topItem?.name || 'Item'}`;
      colorClass = "bg-amber-600 hover:bg-amber-500 text-white shadow-[0_0_15px_rgba(245,158,11,0.5)]";
      actionType = 'PASS_PRIORITY'; // Resolving is just passing priority when stack not empty
    }
  }

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const isLongPress = useRef(false);

  const handlePointerDown = () => {
    isLongPress.current = false;
    timerRef.current = setTimeout(() => {
      isLongPress.current = true;
      if (onYieldToggle) {
        // Visual feedback could be added here
        onYieldToggle();
      }
    }, 600); // 600ms long press for Yield
  };

  const handlePointerUp = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    if (!isLongPress.current) {
      handleClick();
    }
  };

  const handleClick = () => {
    if (isYielding) {
      // Cancel logic
      if (onYieldToggle) onYieldToggle();
      return;
    }

    if (actionType) {
      let payload: any = { type: actionType };

      if (actionType === 'DECLARE_ATTACKERS') {
        payload.attackers = contextData?.attackers || [];
      }
      // TODO: Blockers payload

      onAction('game_strict_action', payload);
    }
  };

  // Prevent context menu on long press
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
  };

  return (
    <button
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={() => { if (timerRef.current) clearTimeout(timerRef.current); }}
      onContextMenu={handleContextMenu}
      disabled={!isMyPriority && !isYielding}
      className={`
        px-6 py-3 rounded-xl font-bold text-lg uppercase tracking-wider transition-all duration-300
        ${colorClass}
        border border-white/10
        flex items-center justify-center
        min-w-[200px] select-none
      `}
    >
      {label}
    </button>
  );
};
