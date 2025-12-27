import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { socketService } from '../../services/SocketService';
import { Save, Layers, Clock, Columns, LayoutTemplate, List, LayoutGrid, ChevronDown, Check, Search, Upload, X, Loader2 } from 'lucide-react';
import { StackView } from '../../components/StackView';
import { FoilOverlay } from '../../components/CardPreview';
import { SidePanelPreview } from '../../components/SidePanelPreview';
import { DraftCard } from '../../services/PackGeneratorService';
import { useCardTouch } from '../../utils/interaction';
import { DndContext, DragOverlay, useSensor, useSensors, MouseSensor, TouchSensor, DragStartEvent, DragEndEvent, useDraggable, useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { AutoDeckBuilder } from '../../utils/AutoDeckBuilder';
import { Wand2 } from 'lucide-react'; // Import Wand icon
import { useConfirm } from '../../components/ConfirmDialog';


interface DeckBuilderViewProps {
  roomId: string;
  currentPlayerId: string;
  initialPool: any[];
  initialDeck?: any[];
  availableBasicLands?: any[]; // For constructed/fallback
  isConstructed?: boolean;
  format?: string;
  onSubmit?: (deck: any[]) => void;
  submitLabel?: string;
}

const MIN_CARD_WIDTH = 60;
const MAX_CARD_WIDTH = 200;
const FULL_ART_THRESHOLD = (MIN_CARD_WIDTH + MAX_CARD_WIDTH) / 2; // 130

const ManaCurve = React.memo(({ deck }: { deck: any[] }) => {
  const counts = new Array(8).fill(0);
  let max = 0;

  deck.forEach(c => {
    // @ts-ignore
    const tLine = c.typeLine || c.type_line || '';
    if (tLine.includes('Land')) return;

    // @ts-ignore
    let cmc = Math.floor(c.cmc || 0);
    if (cmc >= 7) cmc = 7;
    counts[cmc]++;
    if (counts[cmc] > max) max = counts[cmc];
  });

  const displayMax = Math.max(max, 4); // Scale based on max, min height 4 for relative scale

  return (
    <div className="flex items-end gap-1 px-2 h-16 w-full select-none" title="Mana Curve">
      {counts.map((count, i) => {
        const hPct = (count / displayMax) * 100;
        return (
          <div key={i} className="flex flex-1 flex-col justify-end items-center group relative h-full">
            {/* Tooltip */}
            {count > 0 && <div className="absolute bottom-full mb-1 bg-slate-900/90 backdrop-blur text-white text-[9px] font-bold px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 pointer-events-none border border-slate-600 whitespace-nowrap z-50">
              {count} cards
            </div>}

            {/* Bar Track & Bar */}
            <div className="w-full flex-1 flex items-end bg-slate-800/50 rounded-sm mb-1 px-[1px]">
              <div
                className={`w-full rounded-sm transition-all duration-300 ${count > 0 ? 'bg-indigo-500 group-hover:bg-indigo-400' : 'h-px bg-slate-700'}`}
                style={{ height: count > 0 ? `${hPct}%` : '1px' }}
              />
            </div>

            {/* Axis Label */}
            <span className="text-[10px] font-bold text-slate-500 leading-none group-hover:text-slate-300">
              {i === 7 ? '7+' : i}
            </span>
          </div>
        );
      })}
    </div>
  );
});

// Internal Helper to normalize card data for visuals
const normalizeCard = (c: any): DraftCard => {
  const targetId = c.scryfallId || c.id;
  const setCode = c.setCode || c.set || c.definition?.set;
  const localImage = (targetId && setCode)
    ? `/cards/images/${setCode}/full/${targetId}.jpg`
    : null;
  const localCrop = (targetId && setCode)
    ? `/cards/images/${setCode}/crop/${targetId}.jpg`
    : null;

  return {
    ...c,
    finish: c.finish || 'nonfoil',
    typeLine: c.typeLine || c.type_line,
    // Ensure image is top-level for components that expect it
    // Prioritize local cache
    image: localImage || c.image || c.image_uris?.normal || c.card_faces?.[0]?.image_uris?.normal,
    imageArtCrop: localCrop || c.imageArtCrop || c.image_uris?.art_crop || c.card_faces?.[0]?.image_uris?.art_crop
  };
};

const LAND_DEFAULTS: Record<string, { name: string, set: string, id: string, image: string }> = {
  Plains: { name: 'Plains', set: 'unh', id: '1d7dba1c-a702-43c0-8fca-e47bbad4a009', image: 'https://cards.scryfall.io/normal/front/1/d/1d7dba1c-a702-43c0-8fca-e47bbad4a009.jpg' },
  Island: { name: 'Island', set: 'unh', id: '0c4a301b-16f5-41c8-a920-d38513206d11', image: 'https://cards.scryfall.io/normal/front/0/c/0c4a301b-16f5-41c8-a920-d38513206d11.jpg' },
  Swamp: { name: 'Swamp', set: 'unh', id: '8bc6ec60-0d72-488b-9dd2-b895697a3a5e', image: 'https://cards.scryfall.io/normal/front/8/b/8bc6ec60-0d72-488b-9dd2-b895697a3a5e.jpg' },
  Mountain: { name: 'Mountain', set: 'unh', id: '409796e8-d003-4674-8395-927d6928e34c', image: 'https://cards.scryfall.io/normal/front/4/0/409796e8-d003-4674-8395-927d6928e34c.jpg' },
  Forest: { name: 'Forest', set: 'unh', id: '5f8221b7-a359-42b7-876b-95204680e9be', image: 'https://cards.scryfall.io/normal/front/5/f/5f8221b7-a359-42b7-876b-95204680e9be.jpg' },
};

// Universal Wrapper handling both Pool Cards (Move) and Land Sources (Copy/Ghost)
const UniversalCardWrapper = React.memo(({ children, card, source, disabled, mode: _mode }: any) => {
  const isLand = card.isLandSource;
  const dndId = isLand ? `land-source-${card.name}` : card.id;
  const dndData = useMemo(() => isLand ? { card, type: 'land' } : { card, source }, [card, source, isLand]);

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: dndId,
    data: dndData,
    disabled
  });

  const style = transform ? {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? (isLand ? 0.5 : 0) : 1,
    zIndex: isDragging ? 999 : undefined
  } : undefined;

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes} className="relative z-0">
      {children}
    </div>
  );
}, (prev, next) => {
  return prev.card?.id === next.card?.id && prev.disabled === next.disabled && prev.source === next.source && prev.mode === next.mode;
});

// Droppable Zone
const DroppableZone = ({ id, children, className }: any) => {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={`${className} ${isOver ? 'ring-2 ring-emerald-500 bg-emerald-900/10' : ''}`}>
      {children}
    </div>
  );
};

// Reusable List Item Component
const ListItem = React.memo(({ card, onClick, onHover }: { card: DraftCard; onClick?: () => void; onHover?: (c: any) => void }) => {
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

  const { onTouchStart, onTouchEnd, onTouchMove, onClick: handleTouchClick } = useCardTouch(onHover || (() => { }), () => {
    if (window.matchMedia('(pointer: coarse)').matches) {
      if (onHover) onHover(card);
    } else {
      if (onClick) onClick();
    }
  }, card);

  return (
    <div
      onClick={handleTouchClick}
      onMouseEnter={() => onHover && onHover(card)}
      onMouseLeave={() => onHover && onHover(null)}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onTouchMove={onTouchMove}
      className="flex items-center justify-between py-1 px-2 rounded hover:bg-slate-700/50 cursor-pointer transition-colors w-full group"
    >
      <span className={`font-medium flex items-center gap-2 truncate ${card.rarity === 'mythic' ? 'text-orange-400' : card.rarity === 'rare' ? 'text-yellow-400' : card.rarity === 'uncommon' ? 'text-slate-200' : 'text-slate-400'}`}>
        {card.name}
        {isFoil(card) && (
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-pink-300 via-purple-300 to-indigo-400 animate-pulse text-xs font-bold border border-purple-500/50 rounded px-1">
            FOIL
          </span>
        )}
      </span>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-[10px] text-slate-600 font-mono uppercase opacity-0 group-hover:opacity-100 transition-opacity">{card.typeLine?.split('—')[0]?.trim()}</span>
        <span className={`w-2 h-2 rounded-full border ${getRarityColorClass(card.rarity)} !p-0 !text-[0px]`}></span>
      </div>
    </div>
  );
});

const DeckCardItem = React.memo(({ card, useArtCrop, isFoil, onCardClick, onHover }: any) => {
  const displayImage = useArtCrop ? card.imageArtCrop : card.image;
  const { onTouchStart, onTouchEnd, onTouchMove, onClick } = useCardTouch(onHover, () => {
    if (window.matchMedia('(pointer: coarse)').matches) {
      onHover(card);
    } else {
      onCardClick(card);
    }
  }, card);

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => onHover(card)}
      onMouseLeave={() => onHover(null)}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onTouchMove={onTouchMove}
      className="relative group bg-slate-900 rounded-lg shrink-0 cursor-pointer hover:scale-105 transition-transform"
    >
      <div className={`relative ${useArtCrop ? 'aspect-square' : 'aspect-[2.5/3.5]'} overflow-hidden rounded-lg shadow-xl border transition-all duration-200 group-hover:ring-2 group-hover:ring-purple-400 group-hover:shadow-purple-500/30 ${isFoil ? 'border-purple-400 shadow-purple-500/20' : 'border-slate-800'}`}>
        {isFoil && <FoilOverlay />}
        {isFoil && <div className="absolute top-1 right-1 z-30 text-[10px] font-bold text-white bg-purple-600/80 px-1.5 rounded backdrop-blur-sm">FOIL</div>}
        {displayImage ? (
          <img src={displayImage} alt={card.name} className="w-full h-full object-cover" draggable={false} />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-xs text-center p-1 text-slate-500 font-bold border-2 border-slate-700 m-1 rounded">{card.name}</div>
        )}
        <div className={`absolute bottom-0 left-0 right-0 h-1.5 ${card.rarity === 'mythic' ? 'bg-gradient-to-r from-orange-500 to-red-600' : card.rarity === 'rare' ? 'bg-gradient-to-r from-yellow-400 to-yellow-600' : card.rarity === 'uncommon' ? 'bg-gradient-to-r from-gray-300 to-gray-500' : 'bg-black'}`} />
      </div>
    </div>
  );
}, (prev, next) => {
  return prev.card.id === next.card.id && prev.card.image === next.card.image && prev.isFoil === next.isFoil && prev.useArtCrop === next.useArtCrop;
});

// Extracted Component to avoid re-mounting issues
const CardsDisplay: React.FC<{
  cards: any[];
  viewMode: 'list' | 'grid' | 'stack';
  cardWidth: number;
  onCardClick: (c: any) => void;
  onHover: (c: any) => void;
  emptyMessage: string;
  source: 'pool' | 'deck';
  groupBy?: 'type' | 'color' | 'cmc' | 'rarity';
}> = React.memo(({ cards, viewMode, cardWidth, onCardClick, onHover, emptyMessage, source, groupBy = 'color' }) => {
  const normalizedCards = useMemo(() => cards.map(normalizeCard), [cards]);

  if (cards.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-500 opacity-50 p-8 border-2 border-dashed border-slate-700/50 rounded-lg">
        <Layers className="w-12 h-12 mb-2" />
        <p>{emptyMessage}</p>
      </div>
    )
  }

  // Use CSS var for grid
  if (viewMode === 'list') {
    const sorted = [...normalizedCards].sort((a, b) => {
      // Lands always first
      if (a.isLandSource && !b.isLandSource) return -1;
      if (!a.isLandSource && b.isLandSource) return 1;
      // Then CMC
      return (a.cmc || 0) - (b.cmc || 0);
    });

    return (
      <div className="flex flex-col gap-1 w-full">
        {sorted.map(c => (
          <UniversalCardWrapper key={c.id || c.name} card={c} source={source} mode="list">
            <ListItem card={c} onClick={() => onCardClick(c)} onHover={onHover} />
          </UniversalCardWrapper>
        ))}
      </div>
    );
  }

  if (viewMode === 'stack') {
    return (
      <div className="min-h-full min-w-full w-max">
        <StackView
          cards={normalizedCards}
          cardWidth={cardWidth}
          onCardClick={(c) => {
            if (window.matchMedia('(pointer: coarse)').matches) {
              onHover(c);
            } else {
              onCardClick(c);
            }
          }}
          onHover={(c) => onHover(c)}
          disableHoverPreview={true}
          groupBy={groupBy}
          useArtCrop={cardWidth < FULL_ART_THRESHOLD}
          renderWrapper={(card, children) => (
            <UniversalCardWrapper key={card.id || card.name} card={card} source={source} mode="stack">
              {children}
            </UniversalCardWrapper>
          )}
        />
      </div>
    )
  }

  // Grid View
  return (
    <div className="flex flex-wrap gap-4 pb-20 content-start">
      {normalizedCards.map(card => {
        const useArtCrop = cardWidth < FULL_ART_THRESHOLD && !!card.imageArtCrop;
        const isFoil = card.finish === 'foil';

        return (
          <UniversalCardWrapper key={card.id || card.name} card={card} source={source} mode="grid">
            <div style={{ width: 'var(--card-width)' }} className="shrink-0">
              <DeckCardItem
                card={card}
                useArtCrop={useArtCrop}
                isFoil={isFoil}
                onCardClick={onCardClick}
                onHover={onHover}
              />
            </div>
          </UniversalCardWrapper>
        );
      })}
    </div>
  )
});

const LandAdvice = React.memo(({ landSuggestion, applySuggestion }: { landSuggestion: any, applySuggestion: () => void }) => {
  if (!landSuggestion) return null;
  return (
    <div className="flex items-center justify-between bg-amber-900/40 p-2 rounded-lg border border-amber-700/50 mb-2 mx-1 animate-in fade-in slide-in-from-top-2">
      <div className="flex items-center gap-3">
        <div className="bg-amber-500/20 p-1.5 rounded-md">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-400"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></svg>
        </div>
        <div className="flex flex-col">
          <span className="text-[10px] font-bold text-amber-200 uppercase tracking-wider">Recommended Lands</span>
          <div className="flex gap-2 text-xs font-medium text-slate-300">
            {Object.entries(landSuggestion).map(([type, count]) => {
              if ((count as number) <= 0) return null;
              const colorClass = type === 'Plains' ? 'text-yellow-200' : type === 'Island' ? 'text-blue-200' : type === 'Swamp' ? 'text-purple-200' : type === 'Mountain' ? 'text-red-200' : 'text-emerald-200';
              return <span key={type} className={colorClass}>{count as number} {type}</span>
            })}
          </div>
        </div>
      </div>
      <button
        onClick={applySuggestion}
        className="bg-amber-600 hover:bg-amber-500 text-white text-xs px-3 py-1.5 rounded-md shadow-lg font-bold uppercase tracking-wider transition-all hover:scale-105 active:scale-95 flex items-center gap-1"
      >
        <Check className="w-3 h-3" /> Auto-Fill
      </button>
    </div>
  );
});

const LandRow = React.memo(({ landSourceCards, addLandToDeck, setHoveredCard, landSuggestion, applySuggestion }: {
  landSourceCards: any[];
  addLandToDeck: (land: any) => void;
  setHoveredCard: (card: any) => void;
  landSuggestion: any;
  applySuggestion: () => void;
}) => (
  <div className="flex flex-col gap-2 mb-4 shrink-0">
    <LandAdvice landSuggestion={landSuggestion} applySuggestion={applySuggestion} />
    <div className="flex flex-wrap gap-2 px-1 justify-center sm:justify-start">
      {landSourceCards.map(land => (
        <div
          key={land.id}
          onClick={() => addLandToDeck(land)}
          onMouseEnter={() => setHoveredCard(land)}
          onMouseLeave={() => setHoveredCard(null)}
          className="relative group cursor-pointer hover:scale-105 transition-transform"
          style={{ width: '85px' }}
        >
          <div className="aspect-[2.5/3.5] rounded-md overflow-hidden shadow-sm border border-slate-700 group-hover:border-purple-400 relative">
            <img src={land.image || land.image_uris?.normal} className="w-full h-full object-cover" draggable={false} />
            {/* Click Only Indicator */}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
          </div>
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            <span className="text-white text-xs font-bold bg-emerald-600/90 px-2 py-1 rounded shadow-lg backdrop-blur-sm border border-emerald-400/50 flex items-center gap-1">
              <span className="text-[10px]">+</span> ADD
            </span>
          </div>
        </div>
      ))}
    </div>
    <div className="h-px bg-gradient-to-r from-transparent via-slate-700 to-transparent w-full mt-2" />
  </div>
));

interface SearchToolbarProps {
  searchQuery: string;
  setSearchQuery: (val: string) => void;
  handleSearch: (e: React.FormEvent) => void;
  setSearchResults: (val: any[]) => void;
  searchViewMode: 'list' | 'grid' | 'stack';
  setSearchViewMode: (mode: 'list' | 'grid' | 'stack') => void;
  searchCardWidth: number;
  setSearchCardWidth: (val: number) => void;
  searchFilterCmc: number | null;
  setSearchFilterCmc: (val: number | null) => void;
  searchFilterSet: string;
  setSearchFilterSet: (val: string) => void;
  availableSets: string[];
}

const SearchToolbar = React.memo(({
  searchQuery, setSearchQuery, handleSearch, setSearchResults,
  searchViewMode, setSearchViewMode,
  searchCardWidth, setSearchCardWidth,
  searchFilterCmc, setSearchFilterCmc,
  searchFilterSet, setSearchFilterSet,
  availableSets
}: SearchToolbarProps) => (
  <div className="flex flex-col gap-2 p-2 bg-slate-900 border-b border-slate-700 sticky top-0 z-10 shrink-0">
    {/* Search Input Row */}
    <form onSubmit={handleSearch} className="flex gap-2">
      <div className="relative flex-1">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search Scryfall..."
          className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-1.5 pl-8 text-xs text-white focus:ring-2 focus:ring-emerald-500 outline-none"
        />
        <Search className="w-3 h-3 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2" />
      </div>
      {searchQuery && (
        <button type="button" onClick={() => { setSearchQuery(''); setSearchResults([]); }} className="text-xs text-slate-400 hover:text-white px-2">Clear</button>
      )}
    </form>

    {/* Tools Row */}
    <div className="flex items-center justify-between gap-2">
      {/* View Modes */}
      <div className="flex bg-slate-800 rounded p-0.5 border border-slate-700 shrink-0">
        <button onClick={() => setSearchViewMode('list')} className={`p-1.5 rounded ${searchViewMode === 'list' ? 'bg-slate-600 text-white shadow' : 'text-slate-500 hover:text-white'}`} title="List View"><List className="w-3 h-3" /></button>
        <button onClick={() => setSearchViewMode('grid')} className={`p-1.5 rounded ${searchViewMode === 'grid' ? 'bg-slate-600 text-white shadow' : 'text-slate-500 hover:text-white'}`} title="Grid View"><LayoutGrid className="w-3 h-3" /></button>
        <button onClick={() => setSearchViewMode('stack')} className={`p-1.5 rounded ${searchViewMode === 'stack' ? 'bg-slate-600 text-white shadow' : 'text-slate-500 hover:text-white'}`} title="Stack View"><Layers className="w-3 h-3" /></button>
      </div>

      {/* Slider */}
      <div className="flex items-center gap-1.5 bg-slate-800 rounded px-2 border border-slate-700 h-7 flex-1 max-w-[140px]">
        <div className="w-2 h-3 rounded border border-slate-500 bg-slate-700" title="Small" />
        <input
          type="range"
          min={MIN_CARD_WIDTH}
          max={MAX_CARD_WIDTH}
          value={searchCardWidth}
          onChange={(e) => setSearchCardWidth(parseInt(e.target.value))}
          className="w-full accent-purple-500 cursor-pointer h-1 bg-slate-600 rounded appearance-none"
        />
        <div className="w-3 h-4 rounded border border-slate-500 bg-slate-700" title="Large" />
      </div>
    </div>

    {/* Filters Row */}
    <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar pt-1 border-t border-slate-800">
      <div className="flex items-center gap-1 shrink-0">
        <span className="text-[9px] font-bold text-slate-500 uppercase mr-1">CMC</span>
        {[0, 1, 2, 3, 4, 5, 6, 7].map(n => (
          <button
            key={n}
            onClick={() => setSearchFilterCmc(searchFilterCmc === n ? null : n)}
            className={`w-5 h-5 flex items-center justify-center text-[10px] font-bold rounded border transition-colors ${searchFilterCmc === n ? 'bg-indigo-600 border-indigo-400 text-white' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'}`}
            title={`Cost: ${n}${n === 7 ? '+' : ''}`}
          >
            {n}{n === 7 ? '+' : ''}
          </button>
        ))}
      </div>
      <div className="w-px h-4 bg-slate-700 shrink-0 mx-1" />
      <div className="flex items-center gap-1 shrink-0">
        <span className="text-[9px] font-bold text-slate-500 uppercase">Set</span>
        <select
          className="bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 text-[10px] text-white focus:ring-1 focus:ring-indigo-500 outline-none max-w-[100px]"
          value={searchFilterSet}
          onChange={e => setSearchFilterSet(e.target.value)}
        >
          <option value="">All Sets</option>
          {availableSets.map(set => (
            <option key={set} value={set}>{set.toUpperCase()}</option>
          ))}
        </select>
      </div>
    </div>
  </div>
));

export const DeckBuilderView: React.FC<DeckBuilderViewProps> = ({
  // roomId,
  // currentPlayerId,
  initialPool,
  initialDeck = [],
  availableBasicLands = [],
  onSubmit,
  submitLabel,
  isConstructed = false,
  format = 'Standard'
}) => {
  // Unlimited Timer (Static for now)
  const [timer] = useState<string>("Unlimited");
  /* --- Hooks --- */
  // const { showToast } = useToast();
  const { confirm } = useConfirm();
  // const [deckName, setDeckName] = useState('New Deck');
  const [layout, setLayout] = useState<'vertical' | 'horizontal'>(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('deck_layout') : null;
    return (saved as 'vertical' | 'horizontal') || 'vertical';
  });
  const [viewMode, setViewMode] = useState<'list' | 'grid' | 'stack'>(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('deck_viewMode') : null;
    return (saved as 'list' | 'grid' | 'stack') || 'stack';
  });
  const [groupBy, setGroupBy] = useState<'type' | 'color' | 'cmc' | 'rarity'>(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('deck_groupBy') : null;
    return (saved as 'type' | 'color' | 'cmc' | 'rarity') || 'color';
  });
  const [cardWidth, setCardWidth] = useState(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('deck_cardWidth') : null;
    return saved ? parseInt(saved, 10) : MIN_CARD_WIDTH;
  });
  // Local state for smooth slider
  const [localCardWidth, setLocalCardWidth] = useState(cardWidth);
  const containerRef = React.useRef<HTMLDivElement>(null);

  // Sync
  React.useEffect(() => {
    setLocalCardWidth(cardWidth);
    if (containerRef.current) {
      containerRef.current.style.setProperty('--card-width', `${cardWidth}px`);
    }
  }, [cardWidth]);

  const [sortDropdownOpen, setSortDropdownOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    return localStorage.getItem('draft_sidebarCollapsed') === 'true';
  });

  useEffect(() => {
    localStorage.setItem('draft_sidebarCollapsed', isSidebarCollapsed.toString());
  }, [isSidebarCollapsed]);

  // --- Resize State ---
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('deck_sidebarWidth') : null;
    return saved ? parseInt(saved, 10) : 320;
  });
  // We now control the Library (Bottom) height in pixels, matching DraftView consistency
  const [libraryHeight, setLibraryHeight] = useState(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('deck_libraryHeight') : null;
    return saved ? parseInt(saved, 10) : 300;
  });

  const sidebarRef = React.useRef<HTMLDivElement>(null);
  const libraryRef = React.useRef<HTMLDivElement>(null);
  const resizingState = React.useRef<{
    startX: number,
    startY: number,
    startWidth: number,
    startHeight: number,
    active: 'sidebar' | 'library' | null
  }>({ startX: 0, startY: 0, startWidth: 0, startHeight: 0, active: null });

  // Initial visual set
  React.useEffect(() => {
    if (sidebarRef.current) sidebarRef.current.style.width = `${sidebarWidth}px`;
    if (libraryRef.current) libraryRef.current.style.height = `${libraryHeight}px`;
  }, []);

  // Persist Resize
  useEffect(() => {
    localStorage.setItem('deck_sidebarWidth', sidebarWidth.toString());
  }, [sidebarWidth]);

  useEffect(() => {
    localStorage.setItem('deck_libraryHeight', libraryHeight.toString());
  }, [libraryHeight]);

  // Persist Settings
  useEffect(() => localStorage.setItem('deck_layout', layout), [layout]);
  useEffect(() => localStorage.setItem('deck_viewMode', viewMode), [viewMode]);
  useEffect(() => localStorage.setItem('deck_groupBy', groupBy), [groupBy]);
  useEffect(() => localStorage.setItem('deck_cardWidth', cardWidth.toString()), [cardWidth]);

  const [deck, setDeck] = useState<any[]>(initialDeck);
  const [pool, setPool] = useState<any[]>(() => {
    if (initialDeck && initialDeck.length > 0) {
      // Need to be careful about IDs. 
      // If initialDeck cards are from the pool, they share IDs?
      // Usually yes.
      const deckIds = new Set(initialDeck.map(c => c.id));
      return initialPool.filter(c => !deckIds.has(c.id));
    }
    return initialPool;
  });
  // const [lands, setLands] = useState(...); // REMOVED: Managed directly in deck now
  const [hoveredCard, setHoveredCard] = useState<any>(null);
  const [displayCard, setDisplayCard] = useState<any>(null);

  // Constructed Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Derived unique sets for filter dropdown
  const availableSets = useMemo(() => {
    if (!searchResults.length) return [];
    const sets = new Set(searchResults.map(c => c.set || c.setCode).filter(Boolean));
    return Array.from(sets).sort();
  }, [searchResults]);

  // Search Toolbar State
  const [searchViewMode, setSearchViewMode] = useState<'list' | 'grid' | 'stack'>('grid');
  const [searchCardWidth, setSearchCardWidth] = useState(200); // Default larger for search
  const [searchFilterCmc, setSearchFilterCmc] = useState<number | null>(null);
  const [searchFilterSet, setSearchFilterSet] = useState('');

  // Filter Search Results
  const filteredSearchResults = useMemo(() => {
    if (!searchResults.length) return [];
    return searchResults.filter(c => {
      // CMC
      if (searchFilterCmc !== null) {
        const val = Math.floor(c.cmc || 0);
        if (searchFilterCmc === 7) {
          if (val < 7) return false;
        } else {
          if (val !== searchFilterCmc) return false;
        }
      }
      // Set
      if (searchFilterSet.trim()) {
        const query = searchFilterSet.toLowerCase();
        const setCode = (c.set || '').toLowerCase();
        const setName = (c.set_name || '').toLowerCase();
        if (!setCode.includes(query) && !setName.includes(query)) return false;
      }
      return true;
    });
  }, [searchResults, searchFilterCmc, searchFilterSet]);

  // Sync initialDeck prop changes
  useEffect(() => {
    if (initialDeck && initialDeck.length > 0) {
      setDeck(initialDeck);
      // We might need to filter pool if relevant, but for built decks usually pool is separate or irrelevant here.
    }
  }, [initialDeck]);

  React.useEffect(() => {
    if (hoveredCard) {
      setDisplayCard(hoveredCard);
    }
  }, [hoveredCard]);

  // Search Handler
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const res = await fetch(`/api/cards/search?q=${encodeURIComponent(searchQuery)}`);
      const data = await res.json();
      setSearchResults(data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSearching(false);
    }
  };

  const handleConstructedAdd = async (card: any) => {
    // Cache on pick
    try {
      await fetch('/api/cards/cache', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cards: [card] })
      });
    } catch (e) { console.error("Cache failed", e); }

    // Add to deck
    // For constructed, we usually add copies. 
    // Generate unique ID
    const newCard = {
      ...card,
      id: `${card.id}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      scryfallId: card.id, // Preserve original ID for image resolution
      setCode: card.set,   // Ensure set code is top-level
      // Ensure image prop is carried over for visual
      image: card.image_uris?.normal || card.card_faces?.[0]?.image_uris?.normal,
      imageArtCrop: card.image_uris?.art_crop || card.card_faces?.[0]?.image_uris?.art_crop
    };
    setDeck(prev => [...prev, newCard]);
  };

  // -- Commander Logic --
  const isCommanderFormat = useMemo(() => {
    const f = format.toLowerCase();
    return f.includes('commander') || f.includes('edh') || f.includes('brawl');
  }, [format]);

  const commanders = useMemo(() => deck.filter(c => c.isCommander), [deck]);
  const mainDeck = useMemo(() => deck.filter(c => !c.isCommander), [deck]);

  const toggleCommander = (card: any) => {
    if (card.isCommander) {
      // Demote
      setDeck(prev => prev.map(c => c.id === card.id ? { ...c, isCommander: false } : c));
    } else {
      // Promote
      if (commanders.length >= 2) {
        alert("You can only have up to 2 Commanders.");
        return;
      }
      setDeck(prev => prev.map(c => c.id === card.id ? { ...c, isCommander: true } : c));
    }
  };



  // --- Land Advice Logic ---
  const landSuggestion = useMemo(() => {
    // ... (logic remains same, simplified for brevity in thought but copied fully in implementation)
    const targetLands = 17;
    // @ts-ignore
    const existingLands = deck.filter(c => (c.typeLine || c.type_line || '').includes('Land')).length;
    const landsNeeded = Math.max(0, targetLands - existingLands);

    if (landsNeeded === 0) return null;

    const pips = { Plains: 0, Island: 0, Swamp: 0, Mountain: 0, Forest: 0 };
    let totalPips = 0;

    deck.forEach(card => {
      // @ts-ignore
      const tLine = card.typeLine || card.type_line;
      if (tLine && tLine.includes('Land')) return;
      if (!card.mana_cost) return;
      const cost = card.mana_cost;
      pips.Plains += (cost.match(/{W}/g) || []).length;
      pips.Island += (cost.match(/{U}/g) || []).length;
      pips.Swamp += (cost.match(/{B}/g) || []).length;
      pips.Mountain += (cost.match(/{R}/g) || []).length;
      pips.Forest += (cost.match(/{G}/g) || []).length;
    });

    totalPips = Object.values(pips).reduce((a, b) => a + b, 0);
    if (totalPips === 0) return null;

    const suggestion = { Plains: 0, Island: 0, Swamp: 0, Mountain: 0, Forest: 0 };
    let allocated = 0;

    (Object.keys(pips) as Array<keyof typeof pips>).forEach(type => {
      const count = Math.floor((pips[type] / totalPips) * landsNeeded);
      suggestion[type] = count;
      allocated += count;
    });

    let remainder = landsNeeded - allocated;
    if (remainder > 0) {
      const sortedTypes = (Object.keys(pips) as Array<keyof typeof pips>).sort((a, b) => pips[b] - pips[a]);
      for (let i = 0; i < remainder; i++) {
        suggestion[sortedTypes[i % sortedTypes.length]]++;
      }
    }

    return suggestion;
  }, [deck]);

  const applySuggestion = useCallback(() => {
    if (!landSuggestion) return;

    const newLands: any[] = [];
    const landsToCache: any[] = [];

    Object.entries(landSuggestion).forEach(([type, count]) => {
      if ((count as number) <= 0) return;

      // Find real land from cube or use Default Unhinged Land with valid set/ID for caching
      let landCard = availableBasicLands && availableBasicLands.length > 0
        ? (availableBasicLands.find(l => l.name === type) || availableBasicLands.find(l => l.name.includes(type)))
        : null;

      if (!landCard) {
        // Use default basic land with valid Set/ID
        const defaultLand = LAND_DEFAULTS[type];
        if (defaultLand) {
          landCard = {
            id: `basic-source-${type}`,
            name: defaultLand.name,
            set: defaultLand.set,
            setCode: defaultLand.set,
            scryfallId: defaultLand.id,
            image_uris: { normal: defaultLand.image, art_crop: defaultLand.image },
            image: defaultLand.image,
            typeLine: `Basic Land — ${defaultLand.name}`,
          };
          // Track for caching
          landsToCache.push(landCard);
        } else {
          // Fallback legacy (should not happen for basic types)
          landCard = {
            id: `basic-source-${type}`,
            name: type,
            image_uris: { normal: '', art_crop: '' },
            typeLine: "Basic Land",
            scryfallId: `generic-${type}`
          };
        }
      }

      for (let i = 0; i < (count as number); i++) {
        const newLand = {
          ...landCard,
          id: `land-${type}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}-${i}`,
          image_uris: landCard.image_uris || { normal: landCard.image },
          typeLine: landCard.typeLine || "Basic Land"
        };
        newLands.push(newLand);
      }
    });

    // Trigger background cache download for these lands so normalizeCard can pick them up locally
    if (landsToCache.length > 0) {
      fetch('/api/cards/cache', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cards: landsToCache })
      }).catch(e => console.warn("Failed to cache basic lands", e));
    }

    if (newLands.length > 0) setDeck(prev => [...prev, ...newLands]);
  }, [landSuggestion, availableBasicLands]);

  // --- Actions ---
  const formatTime = (seconds: number | string) => seconds;

  const addToDeck = useCallback((card: any) => {
    setPool(prev => prev.filter(c => c.id !== card.id));
    setDeck(prev => [...prev, card]);
  }, []);

  const addLandToDeck = useCallback((land: any) => {
    // If we're adding from the generic source, ensure it's the right data
    let baseLand = land;

    // If it's a generic source key, look up our default to be sure we get the set info
    if (land.id && land.id.startsWith('land-source-')) {
      const type = land.name;
      const defaultLand = LAND_DEFAULTS[type];
      if (defaultLand && !land.setCode) {
        // Enrich
        baseLand = {
          ...land,
          set: defaultLand.set,
          setCode: defaultLand.set,
          scryfallId: defaultLand.id,
          image: defaultLand.image
        };
        // Trigger cache on manual add too
        fetch('/api/cards/cache', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cards: [baseLand] })
        }).catch(() => { });
      }
    }

    const newLand = {
      ...baseLand,
      id: `land-${baseLand.scryfallId}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      image_uris: baseLand.image_uris || { normal: baseLand.image },
      image: baseLand.image, // Propagate resolved image
      imageArtCrop: baseLand.imageArtCrop
    };
    setDeck(prev => [...prev, newLand]);
  }, []);

  const removeFromDeck = useCallback((card: any) => {
    setDeck(prev => prev.filter(c => c.id !== card.id));
    if (!card.id.startsWith('land-')) {
      setPool(prev => [...prev, card]);
    }
  }, []);

  const submitDeck = () => {
    // Normalize deck images to use local cache before submitting
    const preparedDeck = deck.map(c => {
      const targetId = c.scryfallId; // DraftCard uses scryfallId for the real ID
      const setCode = c.setCode || c.set;

      const cardWithDefinition = {
        ...c,
        definition: {
          set: setCode,
          id: targetId,
          ...(c.definition || {})
        }
      };

      return cardWithDefinition;
    });



    if (onSubmit) {
      onSubmit(preparedDeck);
    } else {
      socketService.socket.emit('player_ready', { deck: preparedDeck });
    }
  };

  const handleAutoBuild = async () => {
    if (await confirm({
      title: "Auto-Build Deck",
      message: "This will replace your current deck with an auto-generated one. Continue?",
      confirmLabel: "Auto-Build",
      type: "warning"
    })) {
      console.log("Auto-Build: Started");
      // 1. Merge current deck back into pool (excluding basic lands generated)
      const currentDeckSpells = deck.filter(c => !c.isLandSource && !(c.typeLine || c.type_line || '').includes('Basic'));
      const fullPool = [...pool, ...currentDeckSpells];
      console.log("Auto-Build: Full Pool Size:", fullPool.length);

      // 2. Run Auto Builder
      // We need real basic land objects if available, or generic ones
      const landSource = availableBasicLands && availableBasicLands.length > 0 ? availableBasicLands : landSourceCards;
      console.log("Auto-Build: Land Source Size:", landSource?.length);

      try {
        const newDeck = await AutoDeckBuilder.buildDeckAsync(fullPool, landSource);
        console.log("Auto-Build: New Deck Generated:", newDeck.length);

        // 3. Update State
        // Remove deck cards from pool
        const newDeckIds = new Set(newDeck.map((c: any) => c.id));
        const remainingPool = fullPool.filter(c => !newDeckIds.has(c.id));
        console.log("Auto-Build: Remaining Pool Size:", remainingPool.length);

        setDeck(newDeck);
        setPool(remainingPool);
      } catch (e) {
        console.error("Auto-Build Error:", e);
      }
    }
  };

  /* --- DnD Handlers --- */
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 10 } }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 250,
        tolerance: 5,
      },
    })
  );

  const [draggedCard, setDraggedCard] = useState<any>(null);

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    setDraggedCard(active.data.current?.card);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) {
      setDraggedCard(null);
      return;
    }

    const data = active.data.current;
    if (!data) return;

    if (over.id === 'commander-zone') {
      // Only allow setting if format matches
      if (!isCommanderFormat) return;

      // Check if already 2 commanders
      if (commanders.length >= 2) {
        // If swapping within zone, do nothing. If new card, prevent.
        const isAlreadyCommander = data.source === 'deck' && data.card.isCommander;
        if (!isAlreadyCommander) {
          alert("Max 2 Commanders allowed.");
          setDraggedCard(null);
          return;
        }
      }

      if (data.source === 'pool') {
        addToDeck({ ...data.card, isCommander: true });
      } else if (data.source === 'deck') {
        // Just update flag
        setDeck(prev => prev.map(c => c.id === data.card.id ? { ...c, isCommander: true } : c));
      }
    } else if (data.type === 'land' && over.id === 'deck-zone') {
      addLandToDeck(data.card);
    } else if (data.source === 'pool' && over.id === 'deck-zone') {
      addToDeck(data.card);
      // Ensure if it was somehow commander false (default)
    } else if (data.source === 'deck' && over.id === 'pool-zone') {
      removeFromDeck(data.card);
    } else if (data.source === 'deck' && over.id === 'deck-zone') {
      // If dragging a commander back to deck zone, demote it
      if (data.card.isCommander) {
        setDeck(prev => prev.map(c => c.id === data.card.id ? { ...c, isCommander: false } : c));
      }
    }

    setDraggedCard(null);
  };

  // --- Import Logic ---
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [isImporting, setIsImporting] = useState(false);

  const handleImport = async () => {
    if (!importText.trim()) return;
    setIsImporting(true);
    try {
      const res = await fetch('/api/cards/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: importText })
      });

      if (!res.ok) throw new Error("Import failed");

      const cards = await res.json();
      if (Array.isArray(cards) && cards.length > 0) {
        // Add to deck preserving ID
        const newCards = cards.map((c: any) => ({
          ...c,
          id: `${c.id}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          scryfallId: c.id,
          setCode: c.set,
          image: c.image_uris?.normal || c.card_faces?.[0]?.image_uris?.normal,
          imageArtCrop: c.image_uris?.art_crop || c.card_faces?.[0]?.image_uris?.art_crop
        }));

        setDeck(prev => [...prev, ...newCards]);
        setIsImportOpen(false);
        setImportText('');
      }
    } catch (e) {
      console.error("Import error", e);
      alert("Failed to import cards. Please checks your format.");
    } finally {
      setIsImporting(false);
    }
  };

  const ImportModal = () => {
    const fileInputRef = React.useRef<HTMLInputElement>(null);

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        if (text) {
          setImportText(text);
        }
      };
      reader.readAsText(file);
    };

    if (!isImportOpen) return null;
    return (
      <div className="fixed inset-0 z-[1000] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden animate-in fade-in zoom-in-95">
          <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950">
            <h3 className="font-bold text-white flex items-center gap-2">
              <Upload className="w-5 h-5 text-indigo-400" /> Import Deck
            </h3>
            <button onClick={() => setIsImportOpen(false)} className="text-slate-500 hover:text-white transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="p-4 flex flex-col gap-4">
            <div className="bg-slate-800/50 p-3 rounded text-xs text-slate-400 border border-slate-700/50 flex justify-between items-start">
              <div>
                <p className="mb-1 font-bold text-slate-300">Supported Formats:</p>
                <ul className="list-disc pl-4 space-y-1">
                  <li>MTG Arena / Magic Online (Quantity Name)</li>
                  <li>Archidekt CSV (Headers: Quantity, Name)</li>
                  <li>Simple List (1 Lightning Bolt)</li>
                </ul>
              </div>
              <div>
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  accept=".csv,.txt"
                  onChange={handleFileUpload}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="bg-slate-700 hover:bg-slate-600 text-white px-3 py-1.5 rounded text-xs font-bold transition-colors flex items-center gap-2"
                >
                  <Upload className="w-3 h-3" /> Upload File
                </button>
              </div>
            </div>
            <textarea
              className="w-full h-48 bg-slate-950 border border-slate-700 rounded p-3 text-xs font-mono text-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
              placeholder={`4 Lightning Bolt\n4 Counterspell\n\nOR Paste CSV...`}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              disabled={isImporting}
            />
          </div>
          <div className="p-4 border-t border-slate-800 bg-slate-950 flex justify-end gap-2">
            <button
              onClick={() => setIsImportOpen(false)}
              className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-white transition-colors"
              disabled={isImporting}
            >
              Cancel
            </button>
            <button
              onClick={handleImport}
              disabled={isImporting || !importText.trim()}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg font-bold shadow-lg flex items-center gap-2 transition-transform active:scale-95 text-xs"
            >
              {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {isImporting ? 'Importing...' : 'Import Cards'}
            </button>
          </div>
        </div>
      </div>
    );
  };



  // --- Resize Handlers ---
  // --- Resize Handlers ---
  const handleResizeStart = (type: 'sidebar' | 'library', e: React.MouseEvent | React.TouchEvent) => {
    // Prevent default to avoid scrolling/selection
    if (e.cancelable) e.preventDefault();

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    resizingState.current = {
      startX: clientX,
      startY: clientY,
      startWidth: sidebarRef.current?.getBoundingClientRect().width || 320,
      startHeight: libraryRef.current?.getBoundingClientRect().height || 300,
      active: type
    };

    document.addEventListener('mousemove', onResizeMove);
    document.addEventListener('touchmove', onResizeMove, { passive: false });
    document.addEventListener('mouseup', onResizeEnd);
    document.addEventListener('touchend', onResizeEnd);
    document.body.style.cursor = type === 'sidebar' ? 'col-resize' : 'row-resize';
  };

  const onResizeMove = React.useCallback((e: MouseEvent | TouchEvent) => {
    if (!resizingState.current.active) return;

    if (e.cancelable) e.preventDefault();

    const clientX = (e as TouchEvent).touches ? (e as TouchEvent).touches[0].clientX : (e as MouseEvent).clientX;
    const clientY = (e as TouchEvent).touches ? (e as TouchEvent).touches[0].clientY : (e as MouseEvent).clientY;

    requestAnimationFrame(() => {
      if (resizingState.current.active === 'sidebar' && sidebarRef.current) {
        const delta = clientX - resizingState.current.startX;
        const newWidth = Math.max(200, Math.min(600, resizingState.current.startWidth + delta));
        sidebarRef.current.style.width = `${newWidth}px`;
      }

      if (resizingState.current.active === 'library' && libraryRef.current) {
        // Dragging UP increases height of bottom panel
        const delta = resizingState.current.startY - clientY;
        const newHeight = Math.max(100, Math.min(window.innerHeight * 0.8, resizingState.current.startHeight + delta));
        libraryRef.current.style.height = `${newHeight}px`;
      }
    });
  }, []);

  const onResizeEnd = React.useCallback(() => {
    if (resizingState.current.active === 'sidebar' && sidebarRef.current) {
      setSidebarWidth(parseInt(sidebarRef.current.style.width));
    }
    if (resizingState.current.active === 'library' && libraryRef.current) {
      setLibraryHeight(parseInt(libraryRef.current.style.height));
    }

    resizingState.current.active = null;
    document.removeEventListener('mousemove', onResizeMove);
    document.removeEventListener('touchmove', onResizeMove);
    document.removeEventListener('mouseup', onResizeEnd);
    document.removeEventListener('touchend', onResizeEnd);
    document.body.style.cursor = 'default';
  }, []);

  // --- Render Functions ---
  // --- Consolidated Pool Logic ---
  const landSourceCards = useMemo(() => {
    // If we have specific lands from cube, use them.
    if (availableBasicLands && availableBasicLands.length > 0) {
      // Deduplicate by Name to ensure strict "One per Type" rule on client side
      const uniqueLands: any[] = [];
      const seenNames = new Set();

      for (const land of availableBasicLands) {
        if (!seenNames.has(land.name)) {
          seenNames.add(land.name);
          uniqueLands.push(land);
        }
      }

      return uniqueLands.map(land => {
        const targetId = land.scryfallId || land.id;
        const setCode = land.setCode || land.set;

        const localImage = (targetId && setCode)
          ? `/cards/images/${setCode}/full/${targetId}.jpg`
          : null;

        return {
          ...land,
          id: `land-source-${land.scryfallId || land.name}`,
          scryfallId: targetId, // CRITICAL: Preserve the original UUID for image resolution!
          isLandSource: true,
          // Ensure image is set for display
          image: localImage || land.image || land.image_uris?.normal
        };
      });
    }

    // Otherwise generate generic basics
    const types = ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest'];
    return types.map(type => {
      const def = LAND_DEFAULTS[type];
      return {
        id: `basic-source-${type}`,
        name: type,
        isLandSource: true, // @ts-ignore
        scryfallId: def?.id,
        set: def?.set,
        setCode: def?.set,
        image: def?.image,
        image_uris: { normal: def?.image },
        imageArtCrop: def?.image, // Explicitly add fallback crop
        typeLine: `Basic Land — ${type}`,
        rarity: 'common',
        cmc: 0,
        colors: type === 'Plains' ? ['W'] : type === 'Island' ? ['U'] : type === 'Swamp' ? ['B'] : type === 'Mountain' ? ['R'] : ['G']
      };
    });
  }, [availableBasicLands]);

  // Removed displayPool memo to keep them separate



  return (
    <div
      ref={containerRef}
      className="flex-1 w-full flex h-full bg-slate-950 text-white overflow-hidden flex-col select-none"
      onContextMenu={(e) => e.preventDefault()}
      style={{ '--card-width': `${localCardWidth}px` } as React.CSSProperties}
    >
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        {/* Global Toolbar */}
        {/* Global Toolbar */}
        <div className="h-14 bg-slate-800 border-b border-slate-700 flex items-center justify-between px-4 shrink-0 overflow-x-auto text-xs sm:text-sm">
          <div className="flex items-center gap-4">
            {/* View Mode Switcher */}
            <div className="flex bg-slate-900 rounded-lg p-1 border border-slate-700">
              <button onClick={() => setViewMode('list')} className={`p-2 rounded ${viewMode === 'list' ? 'bg-slate-600 text-white shadow' : 'text-slate-500 hover:text-white'}`} title="List View"><List className="w-4 h-4" /></button>
              <button onClick={() => setViewMode('grid')} className={`p-2 rounded ${viewMode === 'grid' ? 'bg-slate-600 text-white shadow' : 'text-slate-500 hover:text-white'}`} title="Grid View"><LayoutGrid className="w-4 h-4" /></button>
              <button onClick={() => setViewMode('stack')} className={`p-2 rounded ${viewMode === 'stack' ? 'bg-slate-600 text-white shadow' : 'text-slate-500 hover:text-white'}`} title="Stack View"><Layers className="w-4 h-4" /></button>
            </div>

            {/* Group By Dropdown (Custom UI) */}
            {viewMode === 'stack' && (
              <div className="relative z-50">
                <button
                  onClick={() => {
                    // Store position for fixed dropdown
                    // We'll just use the button's position relative to viewport
                    // But since we can't easily pass state to the dropdown without more state,
                    // we'll just toggle and use fixed positioning in the dropdown render.
                    // Actually, let's use a simple state for position if needed, or just CSS.
                    setSortDropdownOpen(!sortDropdownOpen);
                  }}
                  className="flex items-center gap-2 bg-slate-900 rounded-lg p-1.5 border border-slate-700 h-9 px-3 text-xs font-bold text-white hover:bg-slate-800 transition-colors"
                >
                  <span className="text-slate-500 uppercase">Sort:</span>
                  <span className="capitalize">{groupBy === 'cmc' ? 'Mana Value' : groupBy}</span>
                  <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${sortDropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                {sortDropdownOpen && (
                  <>
                    <div className="fixed inset-0 z-[900]" onClick={() => setSortDropdownOpen(false)} />
                    <div
                      className="fixed z-[999] bg-slate-800 border border-slate-700 rounded-xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col gap-1 p-2 w-48"
                      style={{
                        top: (containerRef.current?.getBoundingClientRect()?.top || 0) + 60,
                        left: (containerRef.current?.getBoundingClientRect()?.left || 0) + 140
                      }}
                      // Improving position logic: Render close to the button would be better, but without refs it's hard.
                      // Let's rely on fixed centering or top-left offset if we can't get button rect easily.
                      // Actually, let's just render it relative to the logic above or modify button to set a ref.
                      // We can use a ref for the button which we don't have yet.
                      // Let's make it simple: Fixed position centered or just use a known offset?
                      // The tool-bar is overflow-x-auto, so relative position is risky.
                      // Let's use `top: 60px` (toolbar height ~56px) and some `left`.
                      // A better way is to attach a ref to the button now.
                      ref={(el) => {
                        if (el && el.previousElementSibling) { // The button is the previous sibling in DOM? No, the overlay is.
                          // This is getting hacky. Let's just fix the overflow issue in the Toolbar instead?
                          // User specifically asked to "take inspiration" and "sort list is opening below everything".
                          // Fixed positioning is safer.
                          // I will use a simple effect to position it if I had a ref.
                        }
                      }}
                    >
                      {/* We'll use a style hack to position it. OR just remove overflow-x-auto from toolbar if it's not needed. check resizing. */}
                      {/* User said "scrolls inside it's container". */}
                      {/* Let's use `position: fixed` and put it explicitly. */}
                      <div className="text-[10px] font-bold text-slate-500 px-2 py-1 uppercase tracking-wider">Group Cards By</div>
                      {[
                        { value: 'color', label: 'Color' },
                        { value: 'type', label: 'Type' },
                        { value: 'cmc', label: 'Mana Value' },
                        { value: 'rarity', label: 'Rarity' }
                      ].map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => {
                            setGroupBy(opt.value as any);
                            setSortDropdownOpen(false);
                          }}
                          className={`w-full text-left px-3 py-2 text-xs font-bold rounded-lg flex items-center justify-between transition-colors ${groupBy === opt.value ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-md' : 'text-slate-300 hover:bg-slate-700 hover:text-white'}`}
                        >
                          {opt.label}
                          {groupBy === opt.value && <Check className="w-3 h-3 text-white" />}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Layout Switcher */}
            <div className="hidden sm:flex bg-slate-900 rounded-lg p-1 border border-slate-700">
              <button onClick={() => setLayout('vertical')} className={`p-1.5 rounded ${layout === 'vertical' ? 'bg-slate-700 text-white shadow' : 'text-slate-500 hover:text-white'}`} title="Vertical Split"><Columns className="w-4 h-4" /></button>
              <button onClick={() => setLayout('horizontal')} className={`p-1.5 rounded ${layout === 'horizontal' ? 'bg-slate-700 text-white shadow' : 'text-slate-500 hover:text-white'}`} title="Horizontal Split"><LayoutTemplate className="w-4 h-4" /></button>
            </div>

            {/* Slider */}
            <div className="hidden sm:flex items-center gap-2 bg-slate-800 rounded-lg px-2 border border-slate-700 h-10">
              <div className="w-3 h-4 rounded border border-slate-500 bg-slate-700" title="Small Cards" />
              <input
                type="range"
                min={MIN_CARD_WIDTH}
                max={MAX_CARD_WIDTH}
                step="1"
                value={localCardWidth}
                onChange={(e) => {
                  const val = parseInt(e.target.value);
                  setLocalCardWidth(val);
                  if (containerRef.current) containerRef.current.style.setProperty('--card-width', `${val}px`);
                }}
                onMouseUp={() => setCardWidth(localCardWidth)}
                onTouchEnd={() => setCardWidth(localCardWidth)}
                className="w-24 accent-purple-500 cursor-pointer h-1.5 bg-slate-600 rounded-lg appearance-none"
              />
              <div className="w-4 h-6 rounded border border-slate-500 bg-slate-700" title="Large Cards" />
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsImportOpen(true)}
              className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded-lg border border-slate-600 shadow-sm font-bold text-xs transition-transform hover:scale-105"
              title="Import Deck List"
            >
              <Upload className="w-4 h-4" /> <span className="hidden sm:inline">Import</span>
            </button>

            {!isConstructed && (
              <button
                onClick={handleAutoBuild}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg border border-indigo-400/50 shadow-lg font-bold text-xs transition-transform hover:scale-105"
                title="Auto-Build Deck"
              >
                <Wand2 className="w-4 h-4" /> <span className="hidden sm:inline">Auto-Build</span>
              </button>
            )}

            <div className="hidden sm:flex items-center gap-2 text-amber-400 font-mono text-sm font-bold bg-slate-900 px-3 py-1.5 rounded border border-amber-500/30">
              <Clock className="w-4 h-4" /> {formatTime(timer)}
            </div>
            <button
              onClick={submitDeck}
              className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg font-bold shadow-lg flex items-center gap-2 transition-transform hover:scale-105 text-sm"
            >
              <Save className="w-4 h-4" /> <span className="hidden sm:inline">{submitLabel || 'Submit Deck'}</span><span className="sm:hidden">Save</span>
            </button>
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden lg:flex-row flex-col">
          {/* Zoom Sidebar */}
          <SidePanelPreview
            card={hoveredCard || displayCard}
            width={sidebarWidth}
            isCollapsed={isSidebarCollapsed}
            onToggleCollapse={setIsSidebarCollapsed}
            onResizeStart={(e) => handleResizeStart('sidebar', e)}
          >
            {/* Mana Curve at Bottom */}
            <div className="mt-auto w-full pt-4 border-t border-slate-800">
              <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 text-center">Mana Curve</div>
              <ManaCurve deck={deck} />
            </div>
          </SidePanelPreview>

          {/* Content Area */}
          {layout === 'vertical' ? (
            <div className="flex-1 flex flex-col lg:flex-row min-w-0 min-h-0">
              {/* Pool Column */}
              <DroppableZone id="pool-zone" className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden border-r border-slate-800 bg-slate-900/50">
                <div className="p-3 border-b border-slate-800 font-bold text-slate-400 uppercase text-xs flex justify-between items-center bg-slate-900 shrink-0">
                  <span>{isConstructed ? 'Cards & Search' : `Card Pool (${pool.length})`}</span>
                </div>

                {/* Constructed Search Toolbar */}
                {isConstructed && <SearchToolbar
                  searchQuery={searchQuery}
                  setSearchQuery={setSearchQuery}
                  handleSearch={handleSearch}
                  setSearchResults={setSearchResults}
                  searchViewMode={searchViewMode}
                  setSearchViewMode={setSearchViewMode}
                  searchCardWidth={searchCardWidth}
                  setSearchCardWidth={setSearchCardWidth}
                  searchFilterCmc={searchFilterCmc}
                  setSearchFilterCmc={setSearchFilterCmc}
                  searchFilterSet={searchFilterSet}
                  setSearchFilterSet={setSearchFilterSet}
                  availableSets={availableSets}
                />}

                <div className="flex-1 overflow-y-auto overflow-x-hidden p-2 custom-scrollbar flex flex-col shadow-inner">
                  {/* Land Station */}
                  {/* Land Station */}
                  <LandRow
                    landSourceCards={landSourceCards}
                    addLandToDeck={addLandToDeck}
                    setHoveredCard={setHoveredCard}
                    landSuggestion={landSuggestion}
                    applySuggestion={applySuggestion}
                  />

                  {isConstructed && searchQuery ? (
                    isSearching ? (
                      <div className="flex items-center justify-center p-8 text-slate-500 animate-pulse">Searching Scryfall...</div>
                    ) : (
                      <div style={{ '--card-width': `${searchCardWidth}px` } as React.CSSProperties} className="h-full">
                        <CardsDisplay
                          cards={filteredSearchResults}
                          viewMode={searchViewMode}
                          cardWidth={searchCardWidth}
                          onCardClick={handleConstructedAdd}
                          onHover={setHoveredCard}
                          emptyMessage={filteredSearchResults.length === 0 && searchResults.length > 0 ? "No cards match filters." : "No results found."}
                          source="pool"
                        />
                      </div>
                    )
                  ) : (
                    <CardsDisplay cards={pool} viewMode={viewMode} cardWidth={localCardWidth} onCardClick={addToDeck} onHover={setHoveredCard} emptyMessage={isConstructed ? "Search to add cards, or click lands above." : "Pool Empty"} source="pool" groupBy={groupBy} />
                  )}
                </div>
              </DroppableZone>

              {/* Right Side: Commander + Deck */}
              <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden bg-slate-900/50 relative">
                {/* Commander Zone */}
                {isCommanderFormat && (
                  <div className="shrink-0 p-2 border-b border-slate-800 bg-slate-950/30 flex gap-2 overflow-x-auto min-h-[140px]">
                    <DroppableZone id="commander-zone" className="flex-1 border-2 border-dashed border-slate-700/50 rounded-lg flex items-center justify-start p-2 gap-2 hover:border-indigo-500/50 transition-colors">
                      {commanders.length === 0 && (
                        <div className="text-slate-600 text-xs font-bold uppercase w-full text-center select-none">
                          Drop Commander Here
                        </div>
                      )}
                      {commanders.map(cmd => (
                        <div key={cmd.id} className="relative group shrink-0">
                          <div
                            className="relative rounded-lg overflow-hidden shadow-lg cursor-grab active:cursor-grabbing ring-2 ring-amber-500"
                            style={{ width: '100px', aspectRatio: '2.5/3.5' }} // Fixed mini size
                            onMouseEnter={() => setHoveredCard(cmd)}
                            onMouseLeave={() => setHoveredCard(null)}
                          >
                            <img src={cmd.imageArtCrop || cmd.image || cmd.image_uris?.art_crop || cmd.image_uris?.normal} className="w-full h-full object-cover" />
                            <button
                              onClick={() => toggleCommander(cmd)}
                              className="absolute top-1 right-1 bg-black/50 hover:bg-red-600 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                              title="Remove from Command Zone"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </DroppableZone>
                  </div>
                )}

                {/* Deck List */}
                <DroppableZone id="deck-zone" className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
                  <div className="p-3 border-b border-slate-800 font-bold text-slate-400 uppercase text-xs flex justify-between items-center bg-slate-900 shrink-0">
                    <span>Library ({mainDeck.length})</span>
                    {isCommanderFormat && <span className="text-amber-500 text-[10px] tracking-wider border border-amber-900/50 bg-amber-900/20 px-2 py-0.5 rounded">COMMANDER</span>}
                  </div>
                  <div className="flex-1 overflow-y-auto overflow-x-hidden p-2 custom-scrollbar shadow-inner">
                    <CardsDisplay cards={mainDeck} viewMode={viewMode} cardWidth={localCardWidth} onCardClick={removeFromDeck} onHover={setHoveredCard} emptyMessage="Your Library is Empty" source="deck" groupBy={groupBy} />
                  </div>
                </DroppableZone>
              </div>
            </div>
          ) : (
            // Horizontal Layout (Top/Bottom) - Add Commander Zone 
            <div className="flex-1 flex flex-col min-h-0 min-w-0 relative">
              {/* Top: Pool + Land Station */}
              <div className="flex-1 flex flex-col border-b border-slate-800 bg-slate-900/50 overflow-hidden min-h-0">
                <DroppableZone
                  id="pool-zone"
                  className="flex-1 flex flex-col overflow-hidden"
                >
                  <div className="p-2 border-b border-slate-800 font-bold text-slate-400 uppercase text-xs flex justify-between shrink-0 bg-slate-900">
                    <span>{isConstructed ? 'Cards & Search' : `Card Pool (${pool.length})`}</span>
                  </div>

                  {/* Constructed Search Toolbar */}
                  {isConstructed && <SearchToolbar
                    searchQuery={searchQuery}
                    setSearchQuery={setSearchQuery}
                    handleSearch={handleSearch}
                    setSearchResults={setSearchResults}
                    searchViewMode={searchViewMode}
                    setSearchViewMode={setSearchViewMode}
                    searchCardWidth={searchCardWidth}
                    setSearchCardWidth={setSearchCardWidth}
                    searchFilterCmc={searchFilterCmc}
                    setSearchFilterCmc={setSearchFilterCmc}
                    searchFilterSet={searchFilterSet}
                    setSearchFilterSet={setSearchFilterSet}
                    availableSets={availableSets}
                  />}

                  <div className="flex-1 overflow-auto p-2 custom-scrollbar flex flex-col">
                    {/* Land Station */}
                    <LandRow
                      landSourceCards={landSourceCards}
                      addLandToDeck={addLandToDeck}
                      setHoveredCard={setHoveredCard}
                      landSuggestion={landSuggestion}
                      applySuggestion={applySuggestion}
                    />
                    {isConstructed && searchQuery ? (
                      isSearching ? (
                        <div className="flex items-center justify-center p-8 text-slate-500 animate-pulse">Searching Scryfall...</div>
                      ) : (
                        <div style={{ '--card-width': `${searchCardWidth}px` } as React.CSSProperties} className="h-full">
                          <CardsDisplay
                            cards={filteredSearchResults}
                            viewMode={searchViewMode}
                            cardWidth={searchCardWidth}
                            onCardClick={handleConstructedAdd}
                            onHover={setHoveredCard}
                            emptyMessage={filteredSearchResults.length === 0 && searchResults.length > 0 ? "No cards match filters." : "No results found."}
                            source="pool"
                          />
                        </div>
                      )
                    ) : (
                      <CardsDisplay cards={pool} viewMode={viewMode} cardWidth={localCardWidth} onCardClick={addToDeck} onHover={setHoveredCard} emptyMessage={isConstructed ? "Search to add cards." : "Pool Empty"} source="pool" groupBy={groupBy} />
                    )}
                  </div>
                </DroppableZone>
              </div>

              {/* Resizer Handle */}
              <div
                className="h-2 bg-slate-800 hover:bg-purple-500/50 cursor-row-resize flex items-center justify-center shrink-0 z-20 group transition-colors touch-none w-full"
                onMouseDown={(e) => handleResizeStart('library', e)}
                onTouchStart={(e) => handleResizeStart('library', e)}
              >
                <div className="w-16 h-1 bg-slate-600 rounded-full group-hover:bg-purple-300" />
              </div>

              {/* Bottom: Library */}
              <div
                ref={libraryRef}
                style={{ height: `${libraryHeight}px` }}
                className="shrink-0 flex flex-row border-t border-slate-800 bg-slate-900/50 overflow-hidden z-10"
              >
                {isCommanderFormat && (
                  <DroppableZone id="commander-zone" className="w-40 shrink-0 border-r border-slate-800 bg-slate-950/30 flex flex-col p-2 gap-2 overflow-y-auto">
                    <div className="text-[10px] font-bold text-slate-500 uppercase text-center mb-1">Commanders</div>
                    {commanders.map(cmd => (
                      <div key={cmd.id} className="relative group w-full">
                        <div
                          className="relative rounded-lg overflow-hidden shadow-lg ring-2 ring-amber-500 aspect-[2.5/3.5]"
                          onMouseEnter={() => setHoveredCard(cmd)}
                          onMouseLeave={() => setHoveredCard(null)}
                        >
                          <img src={cmd.imageArtCrop || cmd.image || cmd.image_uris?.art_crop || cmd.image_uris?.normal} className="w-full h-full object-cover" />
                          <button
                            onClick={() => toggleCommander(cmd)}
                            className="absolute top-1 right-1 bg-black/50 hover:bg-red-600 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                    {commanders.length < 2 && (
                      <div className="border-2 border-dashed border-slate-700/50 rounded-lg flex-1 min-h-[100px] flex items-center justify-center text-slate-700 text-[10px] font-bold uppercase text-center p-2">
                        Drag Here
                      </div>
                    )}
                  </DroppableZone>
                )}

                <DroppableZone
                  id="deck-zone"
                  className="flex-1 flex flex-col min-h-0 overflow-hidden"
                >
                  {/* ... deck content uses mainDeck ... */}
                  <div className="p-2 border-b border-slate-800 font-bold text-slate-400 uppercase text-xs flex justify-between shrink-0 items-center">
                    <span>Library ({mainDeck.length})</span>
                  </div>
                  <div className="flex-1 overflow-auto p-2 custom-scrollbar">
                    <CardsDisplay cards={mainDeck} viewMode={viewMode} cardWidth={localCardWidth} onCardClick={removeFromDeck} onHover={setHoveredCard} emptyMessage="Your Library is Empty" source="deck" groupBy={groupBy} />
                  </div>
                </DroppableZone>
              </div>
            </div>
          )}
        </div>

        <DragOverlay dropAnimation={null}>
          {draggedCard ? (() => {
            const useArtCrop = localCardWidth < FULL_ART_THRESHOLD && !!draggedCard.imageArtCrop;
            const displayImage = useArtCrop ? draggedCard.imageArtCrop : (draggedCard.image || draggedCard.image_uris?.normal);
            // Default to square for crop, standard ratio otherwise
            const aspectRatio = useArtCrop ? 'aspect-square' : 'aspect-[2.5/3.5]';

            return (
              <div
                style={{ width: `${localCardWidth}px` }}
                className={`rounded-xl shadow-2xl opacity-90 rotate-3 cursor-grabbing overflow-hidden ring-2 ring-emerald-500 bg-slate-900 ${aspectRatio}`}
              >
                <img src={displayImage} alt={draggedCard.name} className="w-full h-full object-cover" draggable={false} />
              </div>
            );
          })() : null}
        </DragOverlay>
      </DndContext>
      <ImportModal />
    </div >
  );
};
