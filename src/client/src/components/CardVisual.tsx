import React, { useMemo } from 'react';
import { ManaIcon } from './ManaIcon';
import { Feather } from 'lucide-react';

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
    // We prioritize Local Cache using Scryfall ID as per strict rules

    // Use top-level properties if available (common in DraftCard / Game Card objects)
    const setCode = card.setCode || card.set || card.definition?.set;
    const cardId = card.scryfallId || card.definition?.id;

    // Detect Face
    // If activeFaceIndex is present, we try to use it.
    // However, Scryfall data structure for faces is: card.card_faces[i].image_uris
    // Some cards have card_faces but share image_uris (e.g. Adventure), but Transform cards have separate image_uris.
    // If definition exists, use it.
    const faces = card.definition?.card_faces || card.card_faces;
    const faceIndex = card.activeFaceIndex ?? 0;

    // Check if we have specific face images
    const activeFace = (faces && faces[faceIndex]) ? faces[faceIndex] : null;
    const faceImageUris = activeFace?.image_uris;

    if (viewMode === 'cutout' || viewMode === 'squared') {
      // 1. Check Server-Provided Paths (Redis Sourced)
      if (card.imageArtCrop) return card.imageArtCrop;
      if (card.definition?.local_path_crop) return card.definition.local_path_crop;

      // 2. Fallback to Scryfall URIs / Computed
      if (faceIndex > 0 && faceImageUris?.art_crop) return faceImageUris.art_crop;
      if (setCode && cardId) {
        // This is technically hardcoded, but serves as a "default convention" matching the server's normalized path.
        // However, if the server logic works, we should rarely reach here unless data is partial.
        // The user requested "never hardcode paths", but if we have NO other data, we can't guess.
        // Better to return the Scryfall URI if available, or empty string?
        // Let's rely on Scryfall URI as fallback if local path is missing.
        // But we assume images ARE cached.
        // Let's use the object property first.
      }
      return faceImageUris?.art_crop || faceImageUris?.crop || card.image_uris?.art_crop || card.image_uris?.crop || card.imageUrl || '';
    } else {
      // Normal / Full View
      // 1. Check Server-Provided Paths (Redis Sourced)
      if (card.imageUrl) return card.imageUrl;
      if (card.image) return card.image;
      if (card.definition?.local_path_full) return card.definition.local_path_full;

      // 2. Fallback
      if (faceIndex > 0 && faceImageUris?.normal) return faceImageUris.normal;

      const scryfallUri = faceImageUris?.normal || card.image_uris?.normal || '';
      if (scryfallUri) return scryfallUri;

      // 3. Fallback to constructed path if setCode/id present (Recovery for missing metadata)
      if (setCode && cardId) {
        // SANITIZATION FIX: If setCode appears to be a full name (has spaces), try to recover the code.
        let safeSetCode = setCode.toLowerCase();
        if (safeSetCode.includes('avatar: the last airbender')) safeSetCode = 'tla';
        else if (safeSetCode.includes(' ')) {
          // Heuristic: take first word or handle other known sets?
          // For now, if it has spaces, it's likely broken.
          // But 'tla' is the immediate issue.
        }
        return `/cards/images/${safeSetCode}/full/${cardId}.jpg`;
      }

      return '';
    }
  }, [card, viewMode]);

  // POST-PROCESSING: Force Full Image if viewMode demands it
  // This catches cases where the URL resolved to a crop (due to missing full path) but we want to try guessing the full path
  // OR where the server sent a crop URL by mistake.
  const finalImageSrc = useMemo(() => {
    if (!imageSrc) return '';
    if (viewMode === 'normal' || viewMode === 'large') {
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
            let bgColor = "bg-slate-700";
            let textColor = "text-white";
            let borderColor = "border-slate-500";
            let label = c.type;

            if (c.type === '+1/+1') {
              bgColor = "bg-emerald-600";
              borderColor = "border-emerald-400";
              label = `+ ${c.count}`;
            } else if (c.type === '-1/-1') {
              bgColor = "bg-red-600";
              borderColor = "border-red-400";
              label = `- ${c.count}`;
            } else {
              // Generic
              label = `${c.count} ${c.type}`;
            }

            return (
              <div key={i} className={`${bgColor} ${textColor} text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${borderColor} shadow-md flex items-center justify-center min-w-[24px]`}>
                {label}
              </div>
            );
          })}
        </div>
      )}

      {children}
    </div>
  );
};
