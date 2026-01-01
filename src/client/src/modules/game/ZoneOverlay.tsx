import React from 'react';
import { CardInstance } from '../../types/game';
import { CardVisual } from '../../components/CardVisual';

interface ZoneOverlayProps {
  zoneName: string;
  cards: CardInstance[];
  onClose: () => void;
  onCardContextMenu?: (e: React.MouseEvent, cardId: string) => void;
}

export const ZoneOverlay: React.FC<ZoneOverlayProps> = ({ zoneName, cards, onClose, onCardContextMenu }) => {
  // Sort cards by Z index (Highest Z = Top of Pile = First in list)
  const sortedCards = [...cards].sort((a, b) => (b.position?.z || 0) - (a.position?.z || 0));

  return (
    <div className="fixed inset-0 z-[9990] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700 rounded-lg shadow-2xl w-3/4 h-3/4 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950">
          <h2 className="text-2xl font-bold text-slate-200 capitalize flex items-center gap-3">
            <span>{zoneName}</span>
            <span className="text-sm font-normal text-slate-500 bg-slate-900 px-2 py-1 rounded-full border border-slate-800">
              {cards.length} Cards
            </span>
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors p-2 hover:bg-white/10 rounded-full"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-[url('/bg-pattern.png')]">
          {cards.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-500">
              <p className="text-lg">This zone is empty.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {sortedCards.map((card) => (
                <div key={card.instanceId} className="relative group perspective-1000">
                  <div
                    className="relative aspect-[2.5/3.5] bg-slate-800 rounded-lg overflow-hidden shadow-lg border border-slate-700 transition-transform duration-200 hover:scale-105 hover:z-10 hover:shadow-xl hover:shadow-cyan-900/20 cursor-context-menu"
                    onContextMenu={(e) => {
                      if (onCardContextMenu) {
                        e.preventDefault();
                        e.stopPropagation();
                        onCardContextMenu(e, card.instanceId);
                      }
                    }}
                  >
                    <CardVisual
                      card={card}
                      viewMode="normal"
                      className="w-full h-full"
                      forceFaceUp={true}
                    />
                  </div>
                  <div className="mt-2 text-center">
                    <p className="text-xs text-slate-400 truncate w-full">{card.name}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-950 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-sm font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
