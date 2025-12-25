import React, { useMemo } from 'react';
import { ManaIcon } from './ManaIcon';

// Union type to support both Game cards and Draft cards
// Union type to support both Game cards and Draft cards
export type VisualCard = {
  // Common properties that might be needed
  id?: string;
  instanceId?: string;
  name?: string;
  imageUrl?: string;
  image?: string;
  image_uris?: {
    normal?: string;
    large?: string;
    png?: string;
    art_crop?: string;
    border_crop?: string;
    crop?: string;
  };
  definition?: any; // Scryfall definition
  card_faces?: any[];
  tapped?: boolean;
  faceDown?: boolean;
  counters?: any[];
  finish?: string;
  // Loose typing for properties that might vary between Game and Draft models
  power?: string | number;
  toughness?: string | number;
  manaCost?: string;
  mana_cost?: string;
  typeLine?: string;
  type_line?: string;
  oracleText?: string;
  oracle_text?: string;
  [key: string]: any; // Allow other properties loosely
};

interface CardVisualProps {
  card: VisualCard;
  viewMode?: 'normal' | 'cutout' | 'large';
  isFoil?: boolean; // Explicit foil styling override
  className?: string;
  style?: React.CSSProperties;
  // Optional overlays
  showCounters?: boolean;
  forceFaceUp?: boolean;
  children?: React.ReactNode;
}

export const CardVisual: React.FC<CardVisualProps> = ({
  card,
  viewMode = 'normal',
  isFoil = false,
  className,
  style,
  showCounters = true,
  forceFaceUp = false,
  children
}) => {

  const imageSrc = useMemo(() => {
    // Robustly resolve Image Source based on viewMode
    // We prioritize Local Cache using Scryfall ID as per strict rules

    // Use top-level properties if available (common in DraftCard / Game Card objects)
    const setCode = card.setCode || card.set || card.definition?.set;
    const cardId = card.scryfallId || card.definition?.id;

    if (viewMode === 'cutout') {
      if (setCode && cardId) {
        return `/cards/images/${setCode}/crop/${cardId}.jpg`;
      }
      // Fallback only if local ID missing (should not happen in correct flow)
      return card.image_uris?.art_crop || card.image_uris?.crop || card.imageArtCrop || card.imageUrl || '';
    } else {
      // Normal / Full View
      if (setCode && cardId) {
        return `/cards/images/${setCode}/full/${cardId}.jpg`;
      }
      // Fallback
      return card.image_uris?.normal || card.imageUrl || '';
    }
  }, [card, viewMode]);

  // Counters logic (only for Game cards usually)
  const totalCounters = useMemo(() => {
    if (!card.counters) return 0;
    return card.counters.map((c: any) => c.count).reduce((a: number, b: number) => a + b, 0);
  }, [card.counters]);

  const getLandManaSymbol = (typeLine: string = ''): string | null => {
    const lowerType = typeLine.toLowerCase();
    if (lowerType.includes('plains')) return 'w';
    if (lowerType.includes('island')) return 'u';
    if (lowerType.includes('swamp')) return 'b';
    if (lowerType.includes('mountain')) return 'r';
    if (lowerType.includes('forest')) return 'g';
    if (lowerType.includes('waste')) return 'c';
    return null;
  };

  const isCreature = (card.type_line || card.typeLine || '').toLowerCase().includes('creature');
  const isLand = (card.type_line || card.typeLine || '').toLowerCase().includes('land');
  const landSymbol = isLand ? getLandManaSymbol(card.type_line || card.typeLine) : null;

  return (
    <div
      className={`relative overflow-hidden ${className || ''}`}
      style={style}
    >
      {!card.faceDown || forceFaceUp ? (
        <img
          src={imageSrc}
          alt={card.name || 'Card'}
          className="w-full h-full object-cover"
          draggable={false}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-slate-900 bg-opacity-90 bg-[url('/images/back.jpg')] bg-cover">
        </div>
      )}

      {/* Arena-style Crop Overlay */}
      {viewMode === 'cutout' && !card.faceDown && (
        <>
          {/* Top Name Bar */}
          <div className="absolute top-0 inset-x-0 h-10 bg-gradient-to-b from-black/90 via-black/60 to-transparent z-10 p-1 flex justify-between items-start pointer-events-none">
            <span className="text-white text-[10px] font-bold tracking-wide drop-shadow-md shadow-black truncate pr-1" style={{ textShadow: '0 1px 2px black' }}>
              {card.name}
            </span>
            {card.mana_cost && (
              <span className="text-[10px] text-slate-200 font-serif tracking-tighter opacity-90 drop-shadow-md" style={{ textShadow: '0 1px 2px black' }}>
                {card.mana_cost.replace(/[{}]/g, '')}
              </span>
            )}
          </div>

          {/* Bottom Overlays based on Type */}
          {isCreature && (card.power != null && card.toughness != null) && (
            <div className="absolute bottom-0 right-0 z-10 bg-slate-900/90 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-tl-lg border-t border-l border-slate-600 shadow-lg flex items-center gap-0.5">
              <span>{card.power}</span>
              <span className="text-slate-400">/</span>
              <span>{card.toughness}</span>
            </div>
          )}

          {!isCreature && isLand && landSymbol && (
            <div className="absolute bottom-1 inset-x-0 flex justify-center z-10 pointer-events-none">
              <div className="bg-black/60 rounded-full p-0.5 backdrop-blur-sm shadow-lg border border-white/10">
                <ManaIcon symbol={landSymbol} size="md" shadow />
              </div>
            </div>
          )}

          {/* Inner Border/Frame for definition */}
          <div className="absolute inset-0 border border-black/20 pointer-events-none rounded-lg shadow-[inset_0_0_10px_rgba(0,0,0,0.5)]"></div>
        </>
      )}

      {/* Foil Overlay */}
      {(isFoil || card.finish === 'foil') && !card.faceDown && (
        <div className="absolute inset-0 pointer-events-none mix-blend-overlay bg-gradient-to-tr from-purple-500/30 via-transparent to-emerald-500/30 opacity-50" />
      )}

      {/* Counters */}
      {showCounters && totalCounters > 0 && (
        <div className="absolute top-1 right-1 bg-black/70 text-white text-xs px-1 rounded z-10 pointer-events-none">
          {totalCounters}
        </div>
      )}

      {children}
    </div>
  );
};
