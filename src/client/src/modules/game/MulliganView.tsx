import React, { useState } from 'react';
import { CardInstance } from '../../types/game';
import { CardComponent } from './CardComponent';

interface MulliganViewProps {
  hand: CardInstance[];
  mulliganCount: number;
  onDecision: (keep: boolean, cardsToBottom: string[]) => void;
}

export const MulliganView: React.FC<MulliganViewProps> = ({ hand, mulliganCount, onDecision }) => {
  const [selectedToBottom, setSelectedToBottom] = useState<Set<string>>(new Set());

  const toggleSelection = (cardId: string) => {
    const newSet = new Set(selectedToBottom);
    if (newSet.has(cardId)) {
      newSet.delete(cardId);
    } else {
      if (newSet.size < mulliganCount) {
        newSet.add(cardId);
      }
    }
    setSelectedToBottom(newSet);
  };

  const isSelectionValid = selectedToBottom.size === mulliganCount;

  return (
    <div className="absolute inset-0 z-[100] bg-black/90 flex flex-col items-center justify-center backdrop-blur-sm">
      <div className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-br from-purple-400 to-pink-600 mb-8 drop-shadow-lg">
        {mulliganCount === 0 ? "Initial Keep Decision" : `London Mulligan: ${hand.length} Cards`}
      </div>

      {mulliganCount > 0 ? (
        <div className="text-xl text-slate-300 mb-8 max-w-2xl text-center">
          You have mulliganed <strong>{mulliganCount}</strong> time{mulliganCount > 1 ? 's' : ''}.<br />
          Please select <span className="text-red-400 font-bold">{mulliganCount}</span> card{mulliganCount > 1 ? 's' : ''} to put on the bottom of your library.
        </div>
      ) : (
        <div className="text-xl text-slate-300 mb-8">
          Do you want to keep this hand?
        </div>
      )}

      {/* Hand Display */}
      <div className="flex justify-center -space-x-4 mb-12 perspective-1000">
        {hand.map((card, index) => {
          const isSelected = selectedToBottom.has(card.instanceId);
          return (
            <div
              key={card.instanceId}
              className={`relative transition-all duration-300 cursor-pointer ${isSelected ? 'translate-y-12 opacity-50 grayscale scale-90' : 'hover:-translate-y-4 hover:scale-105 hover:z-50'
                }`}
              style={{ zIndex: isSelected ? 0 : 10 + index }}
              onClick={() => mulliganCount > 0 && toggleSelection(card.instanceId)}
            >
              <CardComponent
                card={card}
                onDragStart={() => { }}
                onClick={() => mulliganCount > 0 && toggleSelection(card.instanceId)}
                // Disable normal interactions
                onContextMenu={() => { }}
                className={isSelected ? 'ring-4 ring-red-500' : ''}
              />
              {isSelected && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="bg-red-600 text-white font-bold px-2 py-1 rounded shadow-lg text-xs transform rotate-[-15deg]">
                    BOTTOM
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Controls */}
      <div className="flex gap-8">
        <button
          onClick={() => {
            console.log("Mulligan Clicked");
            onDecision(false, []);
          }}
          className="px-8 py-4 bg-red-600/20 hover:bg-red-600/40 border border-red-500 text-red-100 rounded-xl font-bold text-lg transition-all flex flex-col items-center gap-1 group"
        >
          <span>Mulligan</span>
          <span className="text-xs text-red-400 group-hover:text-red-200">Draw {hand.length > 0 ? 7 : 7} New Cards</span>
        </button>

        <button
          onClick={() => {
            if (isSelectionValid) {
              console.log("Keep Hand Clicked", Array.from(selectedToBottom));
              onDecision(true, Array.from(selectedToBottom));
            }
          }}
          disabled={!isSelectionValid}
          className={`px-8 py-4 rounded-xl font-bold text-lg transition-all flex flex-col items-center gap-1 min-w-[200px] ${isSelectionValid
            ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-[0_0_20px_rgba(16,185,129,0.4)]'
            : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
            }`}
        >
          <span>Keep Hand</span>
          <span className="text-xs opacity-70">
            {mulliganCount > 0
              ? `${selectedToBottom.size}/${mulliganCount} Selected`
              : 'Start Game'}
          </span>
        </button>
      </div>
    </div>
  );
};
