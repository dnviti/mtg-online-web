import React from 'react';
import { DraftCard } from '../services/PackGeneratorService';

interface StackViewProps {
  cards: DraftCard[];
}

export const StackView: React.FC<StackViewProps> = ({ cards }) => {
  const getRarityColorClass = (rarity: string) => {
    switch (rarity) {
      case 'common': return 'bg-black text-white border-slate-600';
      case 'uncommon': return 'bg-slate-300 text-slate-900 border-white';
      case 'rare': return 'bg-yellow-500 text-yellow-950 border-yellow-200';
      case 'mythic': return 'bg-orange-600 text-white border-orange-300';
      default: return 'bg-slate-500';
    }
  };

  return (
    <div className="relative w-full max-w-sm mx-auto group perspective-1000 py-20">
      <div className="relative flex flex-col items-center transition-all duration-500 ease-in-out group-hover:space-y-4 space-y-[-16rem] py-10">
        {cards.map((card, index) => {
          const colorClass = getRarityColorClass(card.rarity);
          // Random slight rotation for "organic" look
          const rotation = (index % 2 === 0 ? 1 : -1) * (Math.random() * 2);

          return (
            <div
              key={card.id}
              className="relative w-64 aspect-[2.5/3.5] rounded-xl shadow-2xl transition-transform duration-300 hover:scale-110 hover:z-50 hover:rotate-0 origin-center bg-slate-800 border-2 border-slate-900"
              style={{
                zIndex: index,
                transform: `rotate(${rotation}deg)`
              }}
            >
              {card.image ? (
                <img src={card.image} alt={card.name} className="w-full h-full object-cover rounded-lg" />
              ) : (
                <div className="w-full h-full p-4 text-center flex items-center justify-center font-bold text-slate-500">
                  {card.name}
                </div>
              )}
              <div className={`absolute top-2 right-2 w-3 h-3 rounded-full shadow-md z-10 border ${colorClass}`} />
            </div>
          );
        })}
      </div>
      <div className="text-center text-slate-500 text-xs mt-4 opacity-50 group-hover:opacity-0 transition-opacity">
        Hover to expand stack
      </div>
    </div>
  );
};
