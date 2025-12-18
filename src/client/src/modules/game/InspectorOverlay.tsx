import React, { useMemo } from 'react';
import { CardInstance } from '../../types/game';
import { X, Sword, Shield, Zap, Layers, Link } from 'lucide-react';

interface InspectorOverlayProps {
  card: CardInstance;
  onClose: () => void;
}

export const InspectorOverlay: React.FC<InspectorOverlayProps> = ({ card, onClose }) => {
  // Compute display values
  const currentPower = card.power ?? card.basePower ?? 0;
  const currentToughness = card.toughness ?? card.baseToughness ?? 0;

  const isPowerModified = currentPower !== (card.basePower ?? 0);
  const isToughnessModified = currentToughness !== (card.baseToughness ?? 0);

  const modifiers = useMemo(() => {
    // Mocking extraction of text descriptions from modifiers if they existed in client type
    // Since client type just has summary, we show what we have
    const list = [];

    // Counters
    if (card.counters && card.counters.length > 0) {
      card.counters.forEach(c => list.push({ type: 'counter', text: `${c.count}x ${c.type} Counter` }));
    }

    // P/T Mod
    if (card.ptModification && (card.ptModification.power !== 0 || card.ptModification.toughness !== 0)) {
      const signP = card.ptModification.power >= 0 ? '+' : '';
      const signT = card.ptModification.toughness >= 0 ? '+' : '';
      list.push({ type: 'effect', text: `Effect Modifier: ${signP}${card.ptModification.power}/${signT}${card.ptModification.toughness}` });
    }

    // Attachments (Auras/Equipment)
    // Note: We don't have the list of attached cards ON this card easily in CardInstance alone without scanning all cards.
    // For this MVP, we inspect the card itself.

    return list;
  }, [card]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="relative bg-slate-900 border border-slate-700 rounded-xl shadow-2xl max-w-sm w-full overflow-hidden flex flex-col">

        {/* Header (Image Bkg) */}
        <div className="relative h-32 bg-slate-800">
          <img src={card.imageUrl} alt={card.name} className="w-full h-full object-cover opacity-50 mask-image-b-transparent" />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-900 to-transparent" />
          <button
            onClick={onClose}
            className="absolute top-2 right-2 p-2 bg-black/40 hover:bg-black/60 rounded-full text-white transition-colors"
          >
            <X size={16} />
          </button>
          <div className="absolute bottom-2 left-4 right-4">
            <h2 className="text-xl font-bold text-white truncate drop-shadow-md">{card.name}</h2>
            <div className="text-xs text-slate-300 flex items-center gap-2">
              <span className="bg-slate-800/80 px-2 py-0.5 rounded border border-slate-600">{card.typeLine || "Card"}</span>
            </div>
          </div>
        </div>

        {/* content */}
        <div className="p-4 space-y-4">

          {/* Live Stats */}
          <div className="flex gap-4">
            {/* Power */}
            <div className={`flex-1 bg-slate-800 rounded-lg p-3 flex flex-col items-center border ${isPowerModified ? 'border-amber-500/50 bg-amber-500/10' : 'border-slate-700'}`}>
              <div className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-1 flex items-center gap-1">
                <Sword size={12} /> Power
              </div>
              <div className="text-2xl font-black text-white flex items-baseline gap-1">
                {currentPower}
                {isPowerModified && <span className="text-xs text-amber-500 font-normal line-through opacity-70">{card.basePower}</span>}
              </div>
            </div>

            {/* Toughness */}
            <div className={`flex-1 bg-slate-800 rounded-lg p-3 flex flex-col items-center border ${isToughnessModified ? 'border-blue-500/50 bg-blue-500/10' : 'border-slate-700'}`}>
              <div className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-1 flex items-center gap-1">
                <Shield size={12} /> Toughness
              </div>
              <div className="text-2xl font-black text-white flex items-baseline gap-1">
                {currentToughness}
                {isToughnessModified && <span className="text-xs text-blue-400 font-normal line-through opacity-70">{card.baseToughness}</span>}
              </div>
            </div>
          </div>

          {/* Modifiers List */}
          <div>
            <div className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-2 flex items-center gap-1">
              <Layers size={12} /> Active Modifiers
            </div>
            {modifiers.length === 0 ? (
              <div className="text-sm text-slate-600 italic text-center py-2 h-20 flex items-center justify-center bg-slate-800/50 rounded">
                No active modifiers
              </div>
            ) : (
              <div className="space-y-2">
                {modifiers.map((mod, i) => (
                  <div key={i} className="flex items-center gap-3 bg-slate-800 p-2 rounded border border-slate-700">
                    <div className={`p-1.5 rounded-full ${mod.type === 'counter' ? 'bg-purple-500/20 text-purple-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                      {mod.type === 'counter' ? <Zap size={12} /> : <Link size={12} />}
                    </div>
                    <span className="text-sm text-slate-200">{mod.text}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Oracle Text (Scrollable) */}
          <div>
            <div className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-1">Oracle Text</div>
            <div className="text-sm text-slate-300 leading-relaxed max-h-32 overflow-y-auto pr-2 custom-scrollbar">
              {card.oracleText?.split('\n').map((line, i) => (
                <p key={i} className="mb-1 last:mb-0">{line}</p>
              )) || <span className="italic text-slate-600">No text.</span>}
            </div>
          </div>

        </div>

      </div>
    </div>
  );
};
