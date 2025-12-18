
import React from 'react';
import { GameState } from '../../types/game';

interface SmartButtonProps {
  gameState: GameState;
  playerId: string;
  onAction: (type: string, payload?: any) => void;
}

export const SmartButton: React.FC<SmartButtonProps> = ({ gameState, playerId, onAction }) => {
  const isMyPriority = gameState.priorityPlayerId === playerId;
  const isStackEmpty = !gameState.stack || gameState.stack.length === 0;

  let label = "Wait";
  let colorClass = "bg-slate-700 text-slate-400 cursor-not-allowed";
  let actionType: string | null = null;

  if (isMyPriority) {
    if (isStackEmpty) {
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

  const handleClick = () => {
    if (actionType) {
      onAction('game_strict_action', { type: actionType });
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={!isMyPriority}
      className={`
        px-6 py-3 rounded-xl font-bold text-lg uppercase tracking-wider transition-all duration-300
        ${colorClass}
        border border-white/10
        flex items-center justify-center
        min-w-[200px]
      `}
    >
      {label}
    </button>
  );
};
