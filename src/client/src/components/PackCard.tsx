import React from 'react';
import { DraftCard, Pack } from '../services/PackGeneratorService';
import { Copy } from 'lucide-react';
import { StackView } from './StackView';

interface PackCardProps {
  pack: Pack;
  viewMode: 'list' | 'grid' | 'stack';
}

import { CardHoverWrapper, FoilOverlay } from './CardPreview';


const ListItem: React.FC<{ card: DraftCard }> = ({ card }) => {
  const isFoil = (card: DraftCard) => card.finish === 'foil';

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
    <CardHoverWrapper card={card} className="relative group">
      <div className="flex items-center justify-between py-1 px-2 rounded hover:bg-slate-700/50 cursor-pointer transition-colors">
        <span className={`font-medium flex items-center gap-2 ${card.rarity === 'mythic' ? 'text-orange-400' : card.rarity === 'rare' ? 'text-yellow-400' : card.rarity === 'uncommon' ? 'text-slate-200' : 'text-slate-400'}`}>
          {card.name}
          {isFoil(card) && (
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-pink-300 via-purple-300 to-indigo-400 animate-pulse text-xs font-bold border border-purple-500/50 rounded px-1">
              FOIL
            </span>
          )}
        </span>
        <span className={`w-2 h-2 rounded-full border ${getRarityColorClass(card.rarity)} !p-0 !text-[0px]`}></span>
      </div>
    </CardHoverWrapper>
  );
};

export const PackCard: React.FC<PackCardProps> = ({ pack, viewMode }) => {
  const mythics = pack.cards.filter(c => c.rarity === 'mythic');
  const rares = pack.cards.filter(c => c.rarity === 'rare');
  const uncommons = pack.cards.filter(c => c.rarity === 'uncommon');
  const commons = pack.cards.filter(c => c.rarity === 'common');

  const isFoil = (card: DraftCard) => card.finish === 'foil';

  const copyPackToClipboard = () => {
    const text = pack.cards.map(c => c.name).join('\n');
    navigator.clipboard.writeText(text);
    alert(`Pack list ${pack.id} copied!`);
  };

  return (
    <div className={`bg-slate-800 rounded-xl border border-slate-700 shadow-lg flex flex-col ${viewMode === 'stack' ? 'bg-transparent border-none shadow-none' : ''}`}>
      {/* Header */}
      <div className={`p-3 bg-slate-900 border-b border-slate-700 flex justify-between items-center rounded-t-xl ${viewMode === 'stack' ? 'bg-slate-800 border border-slate-700 mb-4 rounded-xl' : ''}`}>
        <div className="flex flex-col">
          <h3 className="font-bold text-purple-400 text-sm md:text-base">Pack #{pack.id}</h3>
          <span className="text-xs text-slate-500 font-mono">{pack.setName}</span>
        </div>
        <button onClick={copyPackToClipboard} className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-700 transition-colors flex items-center gap-2 text-xs">
          <Copy className="w-4 h-4" />
        </button>
      </div>

      {/* Content */}
      <div className={`${viewMode !== 'stack' ? 'p-4' : ''}`}>
        {viewMode === 'list' && (
          <div className="text-sm space-y-4">
            {(mythics.length > 0 || rares.length > 0) && (
              <div>
                <div className="text-xs font-bold text-yellow-500 uppercase mb-2 border-b border-slate-700 pb-1">Rare / Mythic ({mythics.length + rares.length})</div>
                <ul className="space-y-1">
                  {mythics.map(card => <ListItem key={card.id} card={card} />)}
                  {rares.map(card => <ListItem key={card.id} card={card} />)}
                </ul>
              </div>
            )}
            <div>
              <div className="text-xs font-bold text-slate-300 uppercase mb-2 border-b border-slate-700 pb-1">Uncommons ({uncommons.length})</div>
              <ul className="space-y-1">
                {uncommons.map(card => <ListItem key={card.id} card={card} />)}
              </ul>
            </div>
            <div>
              <div className="text-xs font-bold text-slate-500 uppercase mb-2 border-b border-slate-700 pb-1">Commons ({commons.length})</div>
              <ul className="space-y-1">
                {commons.map(card => <ListItem key={card.id} card={card} />)}
              </ul>
            </div>
          </div>
        )}

        {viewMode === 'grid' && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {pack.cards.map((card) => (
              <CardHoverWrapper key={card.id} card={card}>
                <div className="relative group bg-slate-900 rounded-lg">
                  {/* Visual Card */}
                  <div className={`relative aspect-[2.5/3.5] overflow-hidden rounded-lg shadow-xl border transition-all duration-200 group-hover:ring-2 group-hover:ring-purple-400 group-hover:shadow-purple-500/30 cursor-pointer ${isFoil(card) ? 'border-purple-400 shadow-purple-500/20' : 'border-slate-800'}`}>
                    {isFoil(card) && <FoilOverlay />}
                    {isFoil(card) && <div className="absolute top-1 right-1 z-30 text-[10px] font-bold text-white bg-purple-600/80 px-1 rounded backdrop-blur-sm">FOIL</div>}

                    {card.image ? (
                      <img src={card.image} alt={card.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xs text-center p-1 text-slate-500 font-bold border-2 border-slate-700 m-1 rounded">
                        {card.name}
                      </div>
                    )}
                    {/* Rarity Stripe */}
                    <div className={`absolute bottom-0 left-0 right-0 h-1.5 ${card.rarity === 'mythic' ? 'bg-gradient-to-r from-orange-500 to-red-600' :
                      card.rarity === 'rare' ? 'bg-gradient-to-r from-yellow-400 to-yellow-600' :
                        card.rarity === 'uncommon' ? 'bg-gradient-to-r from-gray-300 to-gray-500' :
                          'bg-black'
                      }`} />
                  </div>
                </div>
              </CardHoverWrapper>
            ))}
          </div>
        )}

        {viewMode === 'stack' && <StackView cards={pack.cards} />}
      </div>
    </div>
  );
};
