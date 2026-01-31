import React, { useRef, useEffect, useState } from 'react';
import { useDebug } from '../contexts/DebugContext';
import {
  Bug,
  Play,
  X,
  Undo2,
  Redo2,
  User,
  Clock,
  CheckCircle,
  XCircle,
  Pause,
  Power,
  BookOpen,
  Trash2,
} from 'lucide-react';
import { DebugHistoryItem } from '../types/game';
import { DebugDetailPopup } from './DebugDetailPopup';

interface DebugPanelProps {
  className?: string;
  maxHeight?: string;
}

export const DebugPanel: React.FC<DebugPanelProps> = ({ className, maxHeight = '100%' }) => {
  const {
    debugEnabled,
    isDebugActive,
    pauseEvent,
    debugState,
    continueAction,
    cancelAction,
    undo,
    redo,
    toggleDebug,
    clearHistory,
  } = useDebug();

  const bottomRef = useRef<HTMLDivElement>(null);
  const [hoveredItem, setHoveredItem] = useState<DebugHistoryItem | null>(null);
  const [hoverPosition, setHoverPosition] = useState<{ x: number; y: number } | null>(null);
  const [showPendingDetails, setShowPendingDetails] = useState(false);
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);

  // Auto-scroll to bottom on new events
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [debugState?.history?.length, pauseEvent]);

  if (!debugEnabled) {
    return null;
  }

  const canUndo = debugState?.canUndo || false;
  const canRedo = debugState?.canRedo || false;
  const history = debugState?.history || [];

  const handleItemHover = (item: DebugHistoryItem | null, event?: React.MouseEvent) => {
    if (item?.detailedExplanation && event) {
      const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
      setHoverPosition({ x: rect.right + 10, y: rect.top });
      setHoveredItem(item);
    } else {
      setHoveredItem(null);
      setHoverPosition(null);
    }
  };

  const getStatusIcon = (status: 'executed' | 'cancelled' | 'pending') => {
    switch (status) {
      case 'executed':
        return <CheckCircle className="w-3 h-3 text-emerald-500" />;
      case 'cancelled':
        return <XCircle className="w-3 h-3 text-red-500" />;
      case 'pending':
        return <Pause className="w-3 h-3 text-amber-500 animate-pulse" />;
    }
  };

  const getStatusStyle = (status: 'executed' | 'cancelled' | 'pending') => {
    switch (status) {
      case 'executed':
        return 'border-emerald-900/50 bg-emerald-900/10';
      case 'cancelled':
        return 'border-red-900/50 bg-red-900/10 opacity-50';
      case 'pending':
        return 'border-amber-500/50 bg-amber-900/20 ring-1 ring-amber-500/30';
    }
  };

  return (
    <div className={`flex flex-col bg-slate-900 border-t border-slate-800 ${className} overflow-hidden`} style={{ maxHeight }}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-slate-950 border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-2">
          <Bug className="w-3 h-3 text-cyan-500" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-500">Debug</span>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2">
          {/* Debug Toggle Switch */}
          <button
            onClick={() => toggleDebug(!isDebugActive)}
            className={`
              relative flex items-center gap-1.5 px-2 py-1 rounded-full text-[9px] font-bold uppercase tracking-wide
              transition-all duration-200
              ${isDebugActive
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 hover:bg-cyan-500/30'
                : 'bg-slate-700/50 text-slate-500 border border-slate-600/50 hover:bg-slate-700'
              }
            `}
            title={isDebugActive ? 'Disable debug pausing' : 'Enable debug pausing'}
          >
            <Power className="w-3 h-3" />
            <span>{isDebugActive ? 'On' : 'Off'}</span>
          </button>

          {/* Undo/Redo Controls */}
          <div className="flex items-center gap-1 border-l border-slate-700 pl-2">
            <button
              onClick={undo}
              disabled={!canUndo}
              className={`p-1 rounded transition-all ${
                canUndo
                  ? 'text-slate-400 hover:text-white hover:bg-slate-700'
                  : 'text-slate-700 cursor-not-allowed'
              }`}
              title="Undo"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={redo}
              disabled={!canRedo}
              className={`p-1 rounded transition-all ${
                canRedo
                  ? 'text-slate-400 hover:text-white hover:bg-slate-700'
                  : 'text-slate-700 cursor-not-allowed'
              }`}
              title="Redo"
            >
              <Redo2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Clear History */}
          <div className="flex items-center gap-1 border-l border-slate-700 pl-2">
            <button
              onClick={clearHistory}
              disabled={history.length === 0}
              className={`p-1 rounded transition-all ${
                history.length > 0
                  ? 'text-slate-400 hover:text-red-400 hover:bg-slate-700'
                  : 'text-slate-700 cursor-not-allowed'
              }`}
              title="Clear debug history"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Action History */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5 custom-scrollbar text-xs font-mono">
        {history.length === 0 && !pauseEvent && (
          <div className="text-slate-600 italic px-2 py-4 text-center">
            Debug mode enabled. Actions will appear here.
          </div>
        )}

        {/* Rendered History Items */}
        {history.map((item) => {
          const isExpanded = expandedItemId === item.id;
          const hasDetails = !!item.detailedExplanation;

          return (
            <div
              key={item.id}
              className={`
                relative pl-2 pr-2 py-2 rounded border-l-2
                ${getStatusStyle(item.status)}
                transition-all duration-200
                ${hasDetails ? 'cursor-pointer hover:bg-slate-800/50' : ''}
                ${isExpanded ? 'bg-slate-800/30 ring-1 ring-cyan-500/30' : ''}
              `}
              onClick={() => hasDetails && setExpandedItemId(isExpanded ? null : item.id)}
              onMouseEnter={(e) => !isExpanded && handleItemHover(item, e)}
              onMouseLeave={() => handleItemHover(null)}
            >
              <div className="flex items-start gap-2">
                {/* Status Icon */}
                <div className="mt-0.5 shrink-0">
                  {getStatusIcon(item.status)}
                </div>

                <div className="flex flex-col min-w-0 flex-1">
                  {/* Actor and Action Type */}
                  <div className="flex items-center gap-2 mb-0.5">
                    <User className="w-3 h-3 text-blue-400" />
                    <span className="text-[10px] font-bold text-slate-400">
                      {item.actorName}
                    </span>
                    <span className="px-1 py-0.5 text-[9px] bg-slate-700 text-slate-300 rounded">
                      {item.actionType}
                    </span>
                    {hasDetails && (
                      <span title={isExpanded ? 'Click to collapse' : 'Click for details'}>
                        <BookOpen className={`w-3 h-3 ${isExpanded ? 'text-cyan-400' : 'text-cyan-500 opacity-50'}`} />
                      </span>
                    )}
                  </div>

                  {/* Description */}
                  <span className="text-slate-300 leading-tight break-words">
                    {item.description}
                  </span>

                  {/* Source Card Preview (if any) */}
                  {item.sourceCard && (
                    <div className="mt-1 flex items-center gap-2 text-[10px] text-cyan-400">
                      <span className="opacity-60">Source:</span>
                      <span className="font-semibold">{item.sourceCard.name}</span>
                    </div>
                  )}

                  {/* Expanded Details */}
                  {isExpanded && item.detailedExplanation && (
                    <div className="mt-2">
                      <DebugDetailPopup explanation={item.detailedExplanation} />
                    </div>
                  )}
                </div>

                {/* Timestamp */}
                <span className="text-[9px] text-slate-600 whitespace-nowrap mt-0.5">
                  <Clock className="w-2.5 h-2.5 inline mr-0.5" />
                  {new Date(item.timestamp).toLocaleTimeString([], {
                    hour12: false,
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit'
                  })}
                </span>
              </div>
            </div>
          );
        })}

        {/* Pending Action (Current Pause) */}
        {pauseEvent && (
          <div
            className={`
              relative pl-2 pr-2 py-2 rounded border-l-2
              ${getStatusStyle('pending')}
              animate-in fade-in slide-in-from-left-2 duration-300
            `}
          >
            <div className="flex items-start gap-2">
              {/* Status Icon */}
              <div className="mt-0.5 shrink-0">
                {getStatusIcon('pending')}
              </div>

              <div className="flex flex-col min-w-0 flex-1">
                {/* Actor and Action Type */}
                <div className="flex items-center gap-2 mb-0.5">
                  <User className="w-3 h-3 text-blue-400" />
                  <span className="text-[10px] font-bold text-slate-400">
                    {pauseEvent.actorName}
                  </span>
                  <span className="px-1 py-0.5 text-[9px] bg-amber-500/30 text-amber-200 rounded animate-pulse">
                    {pauseEvent.actionType}
                  </span>
                </div>

                {/* Description */}
                <span className="text-white leading-tight break-words font-medium">
                  {pauseEvent.description}
                </span>

                {/* Explanation */}
                {pauseEvent.explanation && (
                  <p className="mt-1 text-[10px] text-slate-400 leading-snug">
                    {pauseEvent.explanation}
                  </p>
                )}

                {/* Source Card */}
                {pauseEvent.sourceCard && (
                  <div className="mt-1.5 flex items-center gap-2">
                    {pauseEvent.sourceCard.imageUrl && (
                      <img
                        src={pauseEvent.sourceCard.imageUrl}
                        alt={pauseEvent.sourceCard.name}
                        className="w-8 h-8 object-cover rounded ring-1 ring-cyan-500/50"
                      />
                    )}
                    <div className="flex flex-col">
                      <span className="text-[10px] text-cyan-300 font-semibold">
                        {pauseEvent.sourceCard.name}
                      </span>
                      {pauseEvent.sourceCard.typeLine && (
                        <span className="text-[9px] text-slate-500">
                          {pauseEvent.sourceCard.typeLine}
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Affected Cards */}
                {pauseEvent.affectedCards && pauseEvent.affectedCards.length > 0 && (
                  <div className="mt-1.5">
                    <span className="text-[9px] text-purple-400 font-bold uppercase">
                      Affected ({pauseEvent.affectedCards.length}):
                    </span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {pauseEvent.affectedCards.slice(0, 5).map((card) => (
                        <span
                          key={card.instanceId}
                          className="px-1.5 py-0.5 text-[9px] bg-purple-900/30 text-purple-300 rounded border border-purple-500/30"
                          title={card.effect}
                        >
                          {card.name}
                        </span>
                      ))}
                      {pauseEvent.affectedCards.length > 5 && (
                        <span className="px-1.5 py-0.5 text-[9px] text-slate-500">
                          +{pauseEvent.affectedCards.length - 5} more
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex items-center gap-2 mt-2">
                  <button
                    onClick={cancelAction}
                    className="flex items-center gap-1 px-2 py-1 text-[10px] font-bold rounded bg-red-600/80 hover:bg-red-500 text-white transition-colors"
                  >
                    <X className="w-3 h-3" />
                    Cancel
                  </button>
                  <button
                    onClick={continueAction}
                    className="flex items-center gap-1 px-2 py-1 text-[10px] font-bold rounded bg-emerald-600/80 hover:bg-emerald-500 text-white transition-colors"
                  >
                    <Play className="w-3 h-3" />
                    Accept
                  </button>
                  {pauseEvent.detailedExplanation && (
                    <button
                      onClick={() => setShowPendingDetails(!showPendingDetails)}
                      className="flex items-center gap-1 px-2 py-1 text-[10px] font-bold rounded bg-cyan-600/80 hover:bg-cyan-500 text-white transition-colors"
                    >
                      <BookOpen className="w-3 h-3" />
                      {showPendingDetails ? 'Hide' : 'Details'}
                    </button>
                  )}
                </div>

                {/* Detailed Explanation for Pending */}
                {showPendingDetails && pauseEvent.detailedExplanation && (
                  <div className="mt-2">
                    <DebugDetailPopup explanation={pauseEvent.detailedExplanation} />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Hover Popup Portal - only show if item is not expanded */}
      {hoveredItem?.detailedExplanation && hoverPosition && expandedItemId !== hoveredItem.id && (
        <div
          className="fixed z-[300] pointer-events-none"
          style={{
            left: Math.min(hoverPosition.x, window.innerWidth - 520),
            top: Math.max(10, Math.min(hoverPosition.y, window.innerHeight - 450)),
          }}
        >
          <DebugDetailPopup explanation={hoveredItem.detailedExplanation} />
        </div>
      )}
    </div>
  );
};

export default DebugPanel;
