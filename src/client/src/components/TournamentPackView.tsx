import React from 'react';
import { Target, Package, Layers } from 'lucide-react';
import { Pack } from '../services/PackGeneratorService';

interface TournamentPackViewProps {
  packs: Pack[];
}

export const TournamentPackView: React.FC<TournamentPackViewProps> = ({ packs }) => {
  const packsBySet = packs.reduce((acc, pack) => {
    const key = pack.setName || 'Unknown Set';
    if (!acc[key]) acc[key] = [];
    acc[key].push(pack);
    return acc;
  }, {} as { [key: string]: Pack[] });

  const BOX_SIZE = 30;

  return (
    <div className="space-y-12 animate-in fade-in duration-700">
      {Object.entries(packsBySet).map(([setName, setPacks]) => {
        const boxes = [];
        for (let i = 0; i < setPacks.length; i += BOX_SIZE) boxes.push(setPacks.slice(i, i + BOX_SIZE));

        return (
          <div key={setName} className="space-y-6">
            <div className="flex items-center gap-4">
              <div className="h-px bg-slate-700 flex-1"></div>
              <h3 className="text-2xl font-black text-slate-200 uppercase tracking-widest flex items-center gap-2">
                <Target className="w-6 h-6 text-purple-500" /> {setName}
              </h3>
              <div className="h-px bg-slate-700 flex-1"></div>
            </div>

            <div className="space-y-8">
              {boxes.map((boxPacks, boxIndex) => (
                <div key={boxIndex} className="bg-slate-800/50 border border-slate-700 rounded-2xl p-6 relative">
                  <div className="absolute -top-4 left-6 bg-amber-600 text-white px-4 py-1 rounded-full font-bold shadow-lg flex items-center gap-2 border-2 border-slate-900 z-10">
                    <Package className="w-4 h-4" /> BOX {boxIndex + 1}
                    <span className="text-amber-200 text-xs font-normal ml-1">({boxPacks.length} packs)</span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 mt-4">
                    {boxPacks.map((pack) => (
                      <div key={pack.id} className="aspect-[2.5/3.5] bg-gradient-to-br from-slate-700 to-slate-800 rounded-xl border-2 border-slate-600 shadow-xl relative group overflow-hidden cursor-pointer hover:border-amber-500/50 transition-colors">
                        <div className="absolute inset-2 border-2 border-dashed border-slate-600/30 rounded-lg flex flex-col items-center justify-center">
                          <Layers className="w-8 h-8 text-slate-600 mb-2 opacity-50" />
                          <span className="text-2xl font-black text-slate-500 opacity-20">MTG</span>
                        </div>
                        <div className="absolute bottom-4 left-0 right-0 text-center">
                          <div className="bg-slate-900/90 text-white text-xs font-bold py-1 px-2 mx-2 rounded border border-slate-700 truncate">#{pack.id}</div>
                          <div className="text-[10px] text-slate-400 mt-1 uppercase tracking-widest font-semibold truncate px-2">{pack.setName}</div>
                        </div>

                        <div className="absolute inset-0 bg-black/80 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                          <div className="text-center p-2">
                            <p className="text-amber-400 font-bold text-xs">Contains {pack.cards.length} cards:</p>
                            {pack.cards.some(c => c.rarity === 'mythic' || c.rarity === 'rare') && (
                              <p className="text-yellow-400 text-xs font-bold">★ Rare / Mythic</p>
                            )}
                            <p className="text-slate-300 text-[10px] italic mt-1">Click for full list</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};
