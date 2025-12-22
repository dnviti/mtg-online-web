import React, { useMemo } from 'react';


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
  viewMode?: 'normal' | 'cutout';
  isFoil?: boolean; // Explicit foil styling override
  className?: string;
  style?: React.CSSProperties;
  // Optional overlays
  showCounters?: boolean;
  children?: React.ReactNode;
}

export const CardVisual: React.FC<CardVisualProps> = ({
  card,
  viewMode = 'normal',
  isFoil = false,
  className,
  style,
  showCounters = true,
  children
}) => {

  const imageSrc = useMemo(() => {
    // Robustly resolve Image Source based on viewMode
    let src = card.imageUrl || card.image;

    if (viewMode === 'cutout') {
      // Priority 1: Local Cache (standard naming convention) - PREFERRED BY USER
      if (card.definition?.set && card.definition?.id) {
        src = `/cards/images/${card.definition.set}/crop/${card.definition.id}.jpg`;
      }
      // Priority 2: Direct Image URIs (if available) - Fallback
      else if (card.image_uris?.art_crop || card.image_uris?.crop) {
        src = card.image_uris.art_crop || card.image_uris.crop!;
      }
      // Priority 3: Deep Definition Data
      else if (card.definition?.image_uris?.art_crop) {
        src = card.definition.image_uris.art_crop;
      }
      else if (card.definition?.card_faces?.[0]?.image_uris?.art_crop) {
        src = card.definition.card_faces[0].image_uris.art_crop;
      }
      // Priority 4: If card has a manually set image property that looks like a crop (less reliable)

      // Fallback: If no crop found, src remains whatever it was (likely full)
    } else {
      // Normal / Full View
      // Priority 1: Local Cache (standard naming convention) - PREFERRED
      if (card.definition?.set && card.definition?.id) {
        // Check if we want standard full image path
        src = `/cards/images/${card.definition.set}/full/${card.definition.id}.jpg`;
      }
      // Priority 2: Direct Image URIs
      else if (card.image_uris?.normal) {
        src = card.image_uris.normal;
      }
      else if (card.definition?.image_uris?.normal) {
        src = card.definition.image_uris.normal;
      }
      else if (card.card_faces?.[0]?.image_uris?.normal) {
        src = card.card_faces[0].image_uris.normal;
      }
    }
    return src;
  }, [card, viewMode]);

  // Counters logic (only for Game cards usually)
  const totalCounters = useMemo(() => {
    if (!card.counters) return 0;
    return card.counters.map((c: any) => c.count).reduce((a: number, b: number) => a + b, 0);
  }, [card.counters]);

  return (
    <div
      className={`relative overflow-hidden ${className || ''}`}
      style={style}
    >
      {!card.faceDown ? (
        <img
          src={imageSrc}
          alt={card.name || 'Card'}
          className="w-full h-full object-cover"
          draggable={false}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-slate-900 bg-opacity-90 bg-[url('https://c1.scryfall.com/file/scryfall-card-backs/large/59/597b79b3-7d77-4261-871a-60dd17403388.jpg')] bg-cover">
        </div>
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
