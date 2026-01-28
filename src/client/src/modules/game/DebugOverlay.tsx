import React, { useState } from 'react';
import {
  Play,
  X,
  Undo2,
  Redo2,
  Bug,
  User,
  Bot,
  Zap,
  Target,
  Info,
  ChevronDown,
  ChevronUp,
  BookOpen,
} from 'lucide-react';
import { useDebug } from '../../contexts/DebugContext';
import { DebugDetailPopup } from '../../components/DebugDetailPopup';

export const DebugOverlay: React.FC = () => {
  const {
    debugEnabled,
    pauseEvent,
    debugState,
    continueAction,
    cancelAction,
    undo,
    redo,
  } = useDebug();

  const [showDetails, setShowDetails] = useState(false);

  // Don't render if debug is not enabled or no pause event
  if (!debugEnabled || !pauseEvent) {
    return null;
  }

  const canUndo = pauseEvent.canUndo || debugState?.canUndo || false;
  const canRedo = pauseEvent.canRedo || debugState?.canRedo || false;
  const hasDetailedExplanation = !!pauseEvent.detailedExplanation;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 backdrop-blur-sm">
      <div className="bg-slate-900 border border-cyan-500/50 rounded-xl shadow-2xl shadow-cyan-500/20 max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden mx-4">
        {/* Header */}
        <div className="p-4 border-b border-slate-700 bg-gradient-to-r from-cyan-900/30 to-blue-900/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-cyan-500/20 border border-cyan-500/50 flex items-center justify-center">
                <Bug className="w-5 h-5 text-cyan-400" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-400">
                  Debug Mode
                </h2>
                <p className="text-xs text-slate-400">
                  Action paused for inspection
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-1 text-xs rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                {pauseEvent.actionType}
              </span>
              {pauseEvent.historyLength > 0 && (
                <span className="px-2 py-1 text-xs rounded bg-slate-700 text-slate-300">
                  {pauseEvent.historyPosition}/{pauseEvent.historyLength}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Actor Info */}
          <div className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-lg border border-slate-700">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
              pauseEvent.isBot ? 'bg-purple-500/20 border border-purple-500/50' : 'bg-emerald-500/20 border border-emerald-500/50'
            }`}>
              {pauseEvent.isBot ? (
                <Bot className="w-5 h-5 text-purple-400" />
              ) : (
                <User className="w-5 h-5 text-emerald-400" />
              )}
            </div>
            <div>
              <p className="text-white font-medium">{pauseEvent.actorName}</p>
              <p className="text-sm text-slate-400">
                {pauseEvent.isBot ? 'Bot Player' : 'Human Player'}
              </p>
            </div>
          </div>

          {/* Action Description */}
          <div className="p-4 bg-slate-800/50 rounded-lg border border-slate-700">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="w-4 h-4 text-amber-400" />
              <h3 className="text-sm font-semibold text-slate-300">Action</h3>
            </div>
            <p className="text-lg text-white">{pauseEvent.description}</p>
          </div>

          {/* Source Card Preview */}
          {pauseEvent.sourceCard && (
            <div className="p-4 bg-slate-800/50 rounded-lg border border-cyan-500/30">
              <div className="flex items-center gap-2 mb-3">
                <Target className="w-4 h-4 text-cyan-400" />
                <h3 className="text-sm font-semibold text-slate-300">Source Card</h3>
              </div>
              <div className="flex gap-4">
                {pauseEvent.sourceCard.imageUrl && (
                  <img
                    src={pauseEvent.sourceCard.imageUrl}
                    alt={pauseEvent.sourceCard.name}
                    className="w-32 h-auto rounded-lg shadow-lg ring-2 ring-cyan-500/50"
                  />
                )}
                <div className="flex-1">
                  <p className="text-white font-medium text-lg">{pauseEvent.sourceCard.name}</p>
                  {pauseEvent.sourceCard.typeLine && (
                    <p className="text-sm text-slate-400 mt-1">{pauseEvent.sourceCard.typeLine}</p>
                  )}
                  {pauseEvent.sourceCard.manaCost && (
                    <p className="text-sm text-slate-400 mt-1">
                      Cost: <span className="text-white">{pauseEvent.sourceCard.manaCost}</span>
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Explanation */}
          <div className="p-4 bg-slate-800/50 rounded-lg border border-slate-700">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Info className="w-4 h-4 text-blue-400" />
                <h3 className="text-sm font-semibold text-slate-300">What will happen</h3>
              </div>
              {hasDetailedExplanation && (
                <button
                  onClick={() => setShowDetails(!showDetails)}
                  className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-lg bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30 transition-colors"
                >
                  <BookOpen className="w-3 h-3" />
                  {showDetails ? 'Hide Details' : 'Show Engine Details'}
                  {showDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
              )}
            </div>
            <p className="text-slate-200 leading-relaxed">{pauseEvent.explanation}</p>
          </div>

          {/* Detailed Explanation (Expandable) */}
          {showDetails && pauseEvent.detailedExplanation && (
            <DebugDetailPopup explanation={pauseEvent.detailedExplanation} />
          )}

          {/* Affected Cards */}
          {pauseEvent.affectedCards && pauseEvent.affectedCards.length > 0 && (
            <div className="p-4 bg-slate-800/50 rounded-lg border border-slate-700">
              <div className="flex items-center gap-2 mb-3">
                <Target className="w-4 h-4 text-purple-400" />
                <h3 className="text-sm font-semibold text-slate-300">
                  Affected Cards ({pauseEvent.affectedCards.length})
                </h3>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {pauseEvent.affectedCards.map((card) => (
                  <div
                    key={card.instanceId}
                    className="p-2 bg-slate-900/50 rounded-lg border border-purple-500/30"
                  >
                    <div className="flex items-center gap-2">
                      {card.imageUrl && (
                        <img
                          src={card.imageUrl}
                          alt={card.name}
                          className="w-12 h-12 object-cover rounded"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white font-medium truncate">{card.name}</p>
                        <p className="text-xs text-purple-300">{card.effect}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Targets */}
          {pauseEvent.targets && pauseEvent.targets.length > 0 && (
            <div className="p-4 bg-slate-800/50 rounded-lg border border-slate-700">
              <div className="flex items-center gap-2 mb-2">
                <Target className="w-4 h-4 text-red-400" />
                <h3 className="text-sm font-semibold text-slate-300">Targets</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {pauseEvent.targets.map((target) => (
                  <span
                    key={target.id}
                    className={`px-3 py-1 rounded-full text-sm ${
                      target.type === 'player'
                        ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                        : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    }`}
                  >
                    {target.name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer Controls */}
        <div className="p-4 border-t border-slate-700 bg-slate-950/50">
          <div className="flex items-center justify-between gap-4">
            {/* Undo/Redo */}
            <div className="flex gap-2">
              <button
                onClick={undo}
                disabled={!canUndo}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
                  canUndo
                    ? 'bg-slate-700 hover:bg-slate-600 text-white'
                    : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                }`}
              >
                <Undo2 className="w-4 h-4" />
                Undo
              </button>
              <button
                onClick={redo}
                disabled={!canRedo}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
                  canRedo
                    ? 'bg-slate-700 hover:bg-slate-600 text-white'
                    : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                }`}
              >
                <Redo2 className="w-4 h-4" />
                Redo
              </button>
            </div>

            {/* Main Actions */}
            <div className="flex gap-3">
              <button
                onClick={cancelAction}
                className="flex items-center gap-2 px-6 py-2 rounded-lg font-bold transition-all bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white shadow-lg hover:shadow-red-500/30"
              >
                <X className="w-4 h-4" />
                Cancel
              </button>
              <button
                onClick={continueAction}
                className="flex items-center gap-2 px-6 py-2 rounded-lg font-bold transition-all bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white shadow-lg hover:shadow-emerald-500/30"
              >
                <Play className="w-4 h-4" />
                Continue
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DebugOverlay;
