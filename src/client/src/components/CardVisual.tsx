import React, { useMemo } from 'react';
import { ManaIcon } from './ManaIcon';
import { Feather, Shield, Gem, Skull, Zap, Droplet, Flame, Eye } from 'lucide-react';

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
  viewMode?: 'normal' | 'cutout' | 'large' | 'squared';
  isFoil?: boolean; // Explicit foil styling override
  className?: string;
  style?: React.CSSProperties;
  // Optional overlays
  showCounters?: boolean;
  forceFaceUp?: boolean;
  currentTurn?: number; // Added for Summoning Sickness check
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
  currentTurn,
  children
}) => {

  const imageSrc = useMemo(() => {
    // Robustly resolve Image Source based on viewMode
    // PRIORITY: Local Cache using Scryfall ID, then fallback to remote URIs

    // In the future if we support multi-faced cards in Redis properly, we might need face-specific local paths.
    // For now, the doc says "local_path_full" and "local_path_crop" are on the root object.

    if (viewMode === 'cutout' || viewMode === 'squared') {
      // 1. Check Server-Provided Paths (Redis Sourced)
      // PRIORITY: definition.local_path_crop
      if (card.definition?.local_path_crop) return card.definition.local_path_crop;
      if (card.imageArtCrop) return card.imageArtCrop;

      // 2. FALLBACK: Remote Scryfall URIs
      // If local paths are not available, fallback to remote art_crop
      if (card.definition?.image_uris?.art_crop) return card.definition.image_uris.art_crop;
      if (card.image_uris?.art_crop) return card.image_uris.art_crop;
      if (card.card_faces?.[0]?.image_uris?.art_crop) return card.card_faces[0].image_uris.art_crop;

      return '';
    } else {
      // Normal / Full View
      // 1. Check Server-Provided Paths (Redis Sourced)
      // PRIORITY: definition.local_path_full
      if (card.definition?.local_path_full) return card.definition.local_path_full;
      if (card.imageUrl) return card.imageUrl;
      // Some legacy or draft objects might still have 'image' prop, check it if it matches pattern
      if (card.image && card.image.startsWith('/cards/images/')) return card.image;

      // 2. FALLBACK: Remote Scryfall URIs
      // If local paths are not available, fallback to remote normal/large/png
      if (card.definition?.image_uris?.normal) return card.definition.image_uris.normal;
      if (card.definition?.image_uris?.large) return card.definition.image_uris.large;
      if (card.definition?.image_uris?.png) return card.definition.image_uris.png;
      if (card.image_uris?.normal) return card.image_uris.normal;
      if (card.image_uris?.large) return card.image_uris.large;
      if (card.image_uris?.png) return card.image_uris.png;
      if (card.card_faces?.[0]?.image_uris?.normal) return card.card_faces[0].image_uris.normal;
      if (card.card_faces?.[0]?.image_uris?.large) return card.card_faces[0].image_uris.large;

      return '';
    }
  }, [card, viewMode]);

  // POST-PROCESSING: Force Full Image if viewMode demands it
  const finalImageSrc = useMemo(() => {
    if (!imageSrc) return '';
    if (viewMode === 'normal' || viewMode === 'large') {
      // If we accidentally got a crop path but wanted full
      if (imageSrc.includes('/crop/')) {
        return imageSrc.replace('/crop/', '/full/');
      }
    }
    return imageSrc;
  }, [imageSrc, viewMode]);



  const getLandManaSymbols = (card: VisualCard): string[] => {
    // 1. Try to use explicit produced_mana from Scryfall definition if available
    if (card.definition?.produced_mana && Array.isArray(card.definition.produced_mana)) {
      return card.definition.produced_mana;
    }

    const symbols: Set<string> = new Set();
    const lowerType = (card.type_line || card.typeLine || '').toLowerCase();

    // 2. Parse Type Line for Basic Types (Triomes, Shocks, Basics)
    if (lowerType.includes('plains')) symbols.add('W');
    if (lowerType.includes('island')) symbols.add('U');
    if (lowerType.includes('swamp')) symbols.add('B');
    if (lowerType.includes('mountain')) symbols.add('R');
    if (lowerType.includes('forest')) symbols.add('G');
    if (lowerType.includes('waste')) symbols.add('C');

    // 3. Fallback: Parse Oracle Text for "Add {X}" (Pain lands, check lands, utility lands)
    // Only if we haven't found symbols yet (or to append to them? Usually types handle the basics)
    // Actually, some cards have types AND abilities (e.g. Dryad Arbor).
    // Let's merge both sources.
    const text = (card.oracle_text || card.oracleText || '').toLowerCase();

    // Regex to find "add {x}" or "{x} or {y}" patterns relative to adding mana
    // Simple heuristic: If active ability contains "add" and symbols.
    // For safety, checking for "{COLOR}" presence in land usually means production unless it's a cost like "2, {T}: ..."
    // But Activation Costs usually come BEFORE the colon. Produced mana comes AFTER.
    // Let's just look for explicitly "{W}", "{U}" etc.
    // This heuristic might be loose but acceptable for frontend visual.
    if (text.includes('{w}')) symbols.add('W');
    if (text.includes('{u}')) symbols.add('U');
    if (text.includes('{b}')) symbols.add('B');
    if (text.includes('{r}')) symbols.add('R');
    if (text.includes('{g}')) symbols.add('G');
    if (text.includes('{c}')) symbols.add('C');

    // Special Check for "Any color" -> Rainbow? 
    // For now, Scryfall data is best. If missing, this heuristic covers 90%.

    return Array.from(symbols);
  };

  const isCreature = (card.type_line || card.typeLine || '').toLowerCase().includes('creature');
  const isLand = (card.type_line || card.typeLine || '').toLowerCase().includes('land');
  const landSymbols = isLand ? getLandManaSymbols(card) : [];

  return (
    <div
      className={`relative overflow-hidden ${className || ''}`}
      style={style}
    >
      {!card.faceDown || forceFaceUp ? (
        imageSrc ? (
          <img
            src={finalImageSrc}
            alt={card.name || 'Card'}
            className="w-full h-full object-cover"
            draggable={false}
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-slate-800 border-2 border-slate-700 p-2 text-center text-slate-500">
            <span className="text-[10px] font-bold">{card.name || 'Unknown'}</span>
            <span className="text-[8px] italic mt-1">(No Image)</span>
          </div>
        )
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
              {(card.activeFaceIndex !== undefined && card.definition?.card_faces?.[card.activeFaceIndex])
                ? card.definition.card_faces[card.activeFaceIndex].name
                : card.name}
            </span>
            {(() => {
              // Resolve Mana Cost
              const faceIndex = card.activeFaceIndex || 0;
              const faces = card.definition?.card_faces || card.card_faces;
              const activeCost = (faces && faces[faceIndex]) ? faces[faceIndex].mana_cost : (card.mana_cost || card.manaCost);

              if (!activeCost) return null;

              return (
                <span className="text-[10px] text-slate-200 font-serif tracking-tighter opacity-90 drop-shadow-md" style={{ textShadow: '0 1px 2px black' }}>
                  {activeCost.replace(/[{}]/g, '')}
                </span>
              );
            })()}
          </div>

          {/* Bottom Overlays based on Type */}
          {isCreature && (card.power != null && card.toughness != null) && (
            <div className="absolute bottom-0 right-0 z-10 bg-slate-900/90 text-[10px] font-bold px-1.5 py-0.5 rounded-tl-lg border-t border-l border-slate-600 shadow-lg flex items-center gap-0.5">
              <span className={
                (Number(card.power) > (card.basePower ?? Number(card.power))) ? "text-blue-400" :
                  (Number(card.power) < (card.basePower ?? Number(card.power))) ? "text-red-400" : "text-white"
              }>
                {card.power}
              </span>
              <span className="text-slate-400">/</span>
              <span className={
                (Number(card.toughness) > (card.baseToughness ?? Number(card.toughness))) ? "text-blue-400" :
                  (Number(card.toughness) < (card.baseToughness ?? Number(card.toughness))) ? "text-red-400" : "text-white"
              }>
                {card.toughness}
              </span>
            </div>
          )}

          {!isCreature && isLand && landSymbols.length > 0 && (
            <div className="absolute bottom-1 inset-x-0 flex justify-center items-end z-10 pointer-events-none gap-0.5">
              {landSymbols.map((symbol, idx) => (
                <div key={`${symbol}-${idx}`} className="bg-black/60 rounded-full w-6 h-6 flex items-center justify-center backdrop-blur-sm border border-white/20">
                  <ManaIcon symbol={symbol} size="md" className="translate-y-[1px]" />
                </div>
              ))}
            </div>
          )}

          {/* Summoning Sickness Overlay */}
          {(() => {
            const hasHaste = card.keywords?.some((k: string) => k.toLowerCase() === 'haste') ||
              card.definition?.keywords?.some((k: string) => k.toLowerCase() === 'haste') ||
              card.oracleText?.toLowerCase().includes('haste');

            const isSick = isCreature &&
              currentTurn !== undefined &&
              card.controlledSinceTurn === currentTurn &&
              !hasHaste;

            if (isSick) {
              return (
                <div className="absolute top-10 right-1 z-20 animate-pulse pointer-events-none">
                  <div className="bg-slate-900/80 rounded-full w-6 h-6 flex items-center justify-center border border-slate-600 shadow-md">
                    <span className="text-blue-300 font-bold text-xs italic">Zzz</span>
                  </div>
                </div>
              );
            }

            // Flying Icon
            const hasFlying = card.keywords?.some((k: string) => k.toLowerCase() === 'flying') ||
              card.definition?.keywords?.some((k: string) => k.toLowerCase() === 'flying') ||
              card.oracleText?.toLowerCase().includes('flying');

            if (hasFlying && isCreature) {
              return (
                <div className="absolute top-10 left-1 z-20 pointer-events-none">
                  <div className="bg-slate-900/80 rounded-full w-6 h-6 flex items-center justify-center border border-slate-600 shadow-md text-sky-300">
                    <Feather size={14} strokeWidth={2.5} />
                  </div>
                </div>
              );
            }

            return null;
          })()}

          {/* Inner Border/Frame for definition */}
          <div className="absolute inset-0 border border-black/20 pointer-events-none rounded-lg shadow-[inset_0_0_10px_rgba(0,0,0,0.5)]"></div>
        </>
      )}

      {/* Foil Overlay */}
      {(isFoil || card.finish === 'foil') && !card.faceDown && (
        <div className="absolute inset-0 pointer-events-none rounded-lg overflow-hidden z-20">
          {/* CSS-based Holographic Pattern */}
          <div className="absolute inset-0 foil-holo" />
          {/* Gaussian Circular Glare - Spinning Radial Gradient */}
          <div className="absolute inset-[-50%] bg-[radial-gradient(circle_at_50%_50%,_rgba(255,255,255,0.25)_0%,_transparent_60%)] mix-blend-overlay opacity-25 animate-spin-slow" />
        </div>
      )}

      {/* Counters */}
      {showCounters && card.counters && card.counters.length > 0 && (
        <div className="absolute top-16 left-1 flex flex-col gap-1 z-20 pointer-events-none">
          {card.counters.map((c: any, i: number) => {
            if (c.count <= 0) return null;

            // Counter styling configuration
            const counterConfig: Record<string, { bg: string; border: string; icon?: React.ReactNode; format: (count: number) => string }> = {
              '+1/+1': {
                bg: 'bg-emerald-600',
                border: 'border-emerald-400',
                format: (count) => `+${count}/+${count}`
              },
              '-1/-1': {
                bg: 'bg-red-600',
                border: 'border-red-400',
                format: (count) => `-${count}/-${count}`
              },
              'loyalty': {
                bg: 'bg-violet-600',
                border: 'border-violet-400',
                icon: <Gem size={10} className="mr-0.5" />,
                format: (count) => `${count}`
              },
              'defense': {
                bg: 'bg-amber-600',
                border: 'border-amber-400',
                icon: <Shield size={10} className="mr-0.5" />,
                format: (count) => `${count}`
              },
              'charge': {
                bg: 'bg-sky-600',
                border: 'border-sky-400',
                icon: <Zap size={10} className="mr-0.5" />,
                format: (count) => `${count}`
              },
              'poison': {
                bg: 'bg-lime-600',
                border: 'border-lime-400',
                icon: <Skull size={10} className="mr-0.5" />,
                format: (count) => `${count}`
              },
              'blood': {
                bg: 'bg-rose-700',
                border: 'border-rose-500',
                icon: <Droplet size={10} className="mr-0.5" />,
                format: (count) => `${count}`
              },
              'flame': {
                bg: 'bg-orange-600',
                border: 'border-orange-400',
                icon: <Flame size={10} className="mr-0.5" />,
                format: (count) => `${count}`
              },
              'lore': {
                bg: 'bg-amber-700',
                border: 'border-amber-500',
                icon: <Eye size={10} className="mr-0.5" />,
                format: (count) => `${count}`
              }
            };

            const config = counterConfig[c.type.toLowerCase()] || {
              bg: 'bg-slate-700',
              border: 'border-slate-500',
              format: (count: number) => `${count} ${c.type}`
            };

            return (
              <div
                key={i}
                className={`${config.bg} text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${config.border} shadow-md flex items-center justify-center min-w-[24px]`}
                title={`${c.count} ${c.type} counter${c.count !== 1 ? 's' : ''}`}
              >
                {config.icon}
                {config.format(c.count)}
              </div>
            );
          })}
        </div>
      )}

      {children}
    </div>
  );
};
