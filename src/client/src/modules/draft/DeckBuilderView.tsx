import React, { useState, useMemo } from 'react';
import { socketService } from '../../services/SocketService';
import { Save, Layers, Clock, Columns, LayoutTemplate, List, LayoutGrid } from 'lucide-react';
import { StackView } from '../../components/StackView';
import { FoilOverlay } from '../../components/CardPreview';
import { DraftCard } from '../../services/PackGeneratorService';
import { useCardTouch } from '../../utils/interaction';
import { DndContext, DragOverlay, useSensor, useSensors, MouseSensor, TouchSensor, DragStartEvent, DragEndEvent, useDraggable, useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';

interface DeckBuilderViewProps {
  roomId: string;
  currentPlayerId: string;
  initialPool: any[];
  availableBasicLands?: any[];
}

// Internal Helper to normalize card data for visuals
const normalizeCard = (c: any): DraftCard => ({
  ...c,
  finish: c.finish || 'nonfoil',
  typeLine: c.typeLine || c.type_line,
  // Ensure image is top-level for components that expect it
  image: c.image || c.image_uris?.normal || c.card_faces?.[0]?.image_uris?.normal
});

// Draggable Wrapper for Cards
const DraggableCardWrapper = ({ children, card, source, disabled }: any) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: card.id,
    data: { card, source },
    disabled
  });

  const style = transform ? {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0 : 1,
    zIndex: isDragging ? 999 : undefined
  } : undefined;

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes} className="relative z-0">
      {children}
    </div>
  );
};

// Draggable Wrapper for Lands (Special case: ID is generic until dropped)
const DraggableLandWrapper = ({ children, land }: any) => {
  const id = `land-source-${land.name}`;
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: id,
    data: { card: land, type: 'land' }
  });

  // For lands, we want to copy, so don't hide original
  const style = transform ? {
    transform: CSS.Translate.toString(transform),
    zIndex: isDragging ? 999 : undefined,
    opacity: isDragging ? 0.5 : 1 // Show ghost
  } : undefined;

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes} className="relative z-0">
      {children}
    </div>
  );
};

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
const ListItem: React.FC<{ card: DraftCard; onClick?: () => void; onHover?: (c: any) => void }> = ({ card, onClick, onHover }) => {
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
};

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
}> = ({ cards, viewMode, cardWidth, onCardClick, onHover, emptyMessage, source, groupBy = 'color' }) => {
  if (cards.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-500 opacity-50 p-8 border-2 border-dashed border-slate-700/50 rounded-lg">
        <Layers className="w-12 h-12 mb-2" />
        <p>{emptyMessage}</p>
      </div>
    )
  }

  if (viewMode === 'list') {
    const sorted = [...cards].sort((a, b) => (a.cmc || 0) - (b.cmc || 0));
    return (
      <div className="flex flex-col gap-1 w-full">
        {sorted.map(c => (
          <DraggableCardWrapper key={c.id} card={c} source={source}>
            <ListItem card={normalizeCard(c)} onClick={() => onCardClick(c)} onHover={onHover} />
          </DraggableCardWrapper>
        ))}
      </div>
    );
  }

  if (viewMode === 'stack') {
    return (
      <div className="w-full h-full"> {/* Allow native scrolling from parent */}
        {/* StackView doesn't support DnD yet, so we disable it or handle it differently. 
            For now, drag from StackView is not implemented, falling back to Click. */}
        <StackView
          cards={cards.map(normalizeCard)}
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
        />
      </div>
    )
  }

  // Grid View
  return (
    <div
      className="grid gap-4 pb-20 content-start"
      style={{
        gridTemplateColumns: `repeat(auto-fill, minmax(${cardWidth}px, 1fr))`
      }}
    >
      {cards.map(c => {
        const card = normalizeCard(c);
        const useArtCrop = cardWidth < 200 && !!card.imageArtCrop;

        const isFoil = card.finish === 'foil';

        return (
          <DraggableCardWrapper key={card.id} card={card} source={source}>
            <DeckCardItem
              card={card}
              useArtCrop={useArtCrop}
              isFoil={isFoil}
              onCardClick={onCardClick}
              onHover={onHover}
            />
          </DraggableCardWrapper>
        );
      })}
    </div>
  )
};

export const DeckBuilderView: React.FC<DeckBuilderViewProps> = ({ initialPool, availableBasicLands = [] }) => {
  // Unlimited Timer (Static for now)
  const [timer] = useState<string>("Unlimited");
  const [layout, setLayout] = useState<'vertical' | 'horizontal'>('vertical');
  const [viewMode, setViewMode] = useState<'list' | 'grid' | 'stack'>('stack'); // Default to stack as requested? Or keep grid. User didn't say default view, just default Order.
  const [groupBy, setGroupBy] = useState<'type' | 'color' | 'cmc' | 'rarity'>('color');
  const [cardWidth, setCardWidth] = useState(60);

  const [pool, setPool] = useState<any[]>(initialPool);
  const [deck, setDeck] = useState<any[]>([]);
  const [lands, setLands] = useState({ Plains: 0, Island: 0, Swamp: 0, Mountain: 0, Forest: 0 });
  const [hoveredCard, setHoveredCard] = useState<any>(null);
  const [displayCard, setDisplayCard] = useState<any>(null);

  React.useEffect(() => {
    if (hoveredCard) {
      setDisplayCard(hoveredCard);
    }
  }, [hoveredCard]);

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

  const applySuggestion = () => {
    if (!landSuggestion) return;
    if (availableBasicLands && availableBasicLands.length > 0) {
      const newLands: any[] = [];
      Object.entries(landSuggestion).forEach(([type, count]) => {
        if (count <= 0) return;
        const landCard = availableBasicLands.find(l => l.name === type) || availableBasicLands.find(l => l.name.includes(type));
        if (landCard) {
          for (let i = 0; i < count; i++) {
            const newLand = {
              ...landCard,
              id: `land-${landCard.scryfallId}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}-${i}`,
              image_uris: landCard.image_uris || { normal: landCard.image }
            };
            newLands.push(newLand);
          }
        }
      });
      if (newLands.length > 0) setDeck(prev => [...prev, ...newLands]);
    } else {
      setLands(landSuggestion);
    }
  };

  // --- Actions ---
  const formatTime = (seconds: number | string) => seconds;

  const addToDeck = (card: any) => {
    setPool(prev => prev.filter(c => c.id !== card.id));
    setDeck(prev => [...prev, card]);
  };

  const addLandToDeck = (land: any) => {
    const newLand = {
      ...land,
      id: `land-${land.scryfallId}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      image_uris: land.image_uris || { normal: land.image }
    };
    setDeck(prev => [...prev, newLand]);
  };

  const removeFromDeck = (card: any) => {
    setDeck(prev => prev.filter(c => c.id !== card.id));
    if (!card.id.startsWith('land-')) {
      setPool(prev => [...prev, card]);
    }
  };

  const handleLandChange = (type: string, delta: number) => {
    setLands(prev => ({ ...prev, [type]: Math.max(0, prev[type as keyof typeof lands] + delta) }));
  };

  const submitDeck = () => {
    const genericLandCards = Object.entries(lands).flatMap(([type, count]) => {
      const landUrlMap: any = {
        Plains: "https://cards.scryfall.io/normal/front/d/1/d1ea1858-ad25-4d13-9860-25c898b02c42.jpg",
        Island: "https://cards.scryfall.io/normal/front/2/f/2f3069b3-c15c-4399-ab99-c88c0379435b.jpg",
        Swamp: "https://cards.scryfall.io/normal/front/1/7/17d0571f-df6c-4b53-912f-9cb4d5a9d224.jpg",
        Mountain: "https://cards.scryfall.io/normal/front/f/5/f5383569-42b7-4c07-b67f-2736bc88bd37.jpg",
        Forest: "https://cards.scryfall.io/normal/front/1/f/1fa688da-901d-4876-be11-884d6b677271.jpg"
      };
      return Array(count).fill(null).map((_, i) => ({
        id: `basic-${type}-${i}`,
        name: type,
        image_uris: { normal: landUrlMap[type] },
        typeLine: "Basic Land"
      }));
    });

    const fullDeck = [...deck, ...genericLandCards];
    socketService.socket.emit('player_ready', { deck: fullDeck });
  };

  const sortedLands = useMemo(() => {
    return [...(availableBasicLands || [])].sort((a, b) => a.name.localeCompare(b.name));
  }, [availableBasicLands]);

  // --- DnD Handlers ---
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

    if (data.type === 'land' && over.id === 'deck-zone') {
      addLandToDeck(data.card);
    } else if (data.source === 'pool' && over.id === 'deck-zone') {
      addToDeck(data.card);
    } else if (data.source === 'deck' && over.id === 'pool-zone') {
      removeFromDeck(data.card);
    }
    setDraggedCard(null);
  };

  // --- Render Functions ---
  const renderLandStation = () => (
    <div className="bg-slate-900/40 rounded border border-slate-700/50 p-2 mb-2 shrink-0 flex flex-col gap-2">
      {/* Header & Advisor */}
      <div className="flex justify-between items-center bg-slate-800/50 p-2 rounded">
        <h4 className="text-xs font-bold text-slate-400 uppercase">Land Station</h4>
        {landSuggestion ? (
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-slate-500">Advice:</span>
            <div className="flex gap-1">
              {Object.entries(landSuggestion).map(([type, count]) => {
                if ((count as number) <= 0) return null;
                const color = type === 'Plains' ? 'text-amber-200' : type === 'Island' ? 'text-blue-200' : type === 'Swamp' ? 'text-purple-200' : type === 'Mountain' ? 'text-red-200' : 'text-emerald-200';
                return <span key={type} className={`text-[10px] font-bold ${color}`}>{type[0]}:{count as number}</span>
              })}
            </div>
            <button onClick={applySuggestion} className="bg-emerald-700 hover:bg-emerald-600 text-white text-[10px] px-2 py-0.5 rounded shadow font-bold uppercase">Auto-Fill</button>
          </div>
        ) : (
          <span className="text-[10px] text-slate-600 italic">Add spells for advice</span>
        )}
      </div>

      {/* Land Scroll */}
      {availableBasicLands && availableBasicLands.length > 0 ? (
        <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar pb-1">
          {sortedLands.map((land) => (
            <DraggableLandWrapper key={land.scryfallId} land={land}>
              <div
                className="relative group cursor-pointer shrink-0"
                onClick={() => addLandToDeck(land)}
                onMouseEnter={() => setHoveredCard(land)}
                onMouseLeave={() => setHoveredCard(null)}
              >
                <img
                  src={land.image || land.image_uris?.normal}
                  className="w-16 rounded shadow group-hover:scale-105 transition-transform"
                  alt={land.name}
                  draggable={false}
                />
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-black/40 rounded transition-opacity">
                  <span className="text-white font-bold text-[10px] bg-black/50 px-1 rounded">+</span>
                </div>
              </div>
            </DraggableLandWrapper>
          ))}
        </div>
      ) : (
        <div className="flex justify-between px-2">
          {Object.keys(lands).map(type => (
            <div key={type} className="flex flex-col items-center">
              <div className="text-[10px] font-bold text-slate-500">{type[0]}</div>
              <div className="flex items-center gap-1">
                <button onClick={() => handleLandChange(type, -1)} className="w-5 h-5 bg-slate-700 rounded text-slate-300 flex items-center justify-center font-bold text-xs">-</button>
                <span className="w-4 text-center text-xs font-bold">{lands[type as keyof typeof lands]}</span>
                <button onClick={() => handleLandChange(type, 1)} className="w-5 h-5 bg-slate-700 rounded text-slate-300 flex items-center justify-center font-bold text-xs">+</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="flex-1 w-full flex h-full bg-slate-950 text-white overflow-hidden flex-col select-none" onContextMenu={(e) => e.preventDefault()}>
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        {/* Global Toolbar */}
        {/* Global Toolbar */}
        <div className="h-14 bg-slate-800 border-b border-slate-700 flex items-center justify-between px-4 shrink-0 overflow-x-auto text-xs sm:text-sm">
          <div className="flex items-center gap-4">
            {/* View Mode Switcher */}
            <div className="flex bg-slate-900 rounded-lg p-1 border border-slate-700">
              <button onClick={() => setViewMode('list')} className={`p-1.5 rounded ${viewMode === 'list' ? 'bg-slate-700 text-white shadow' : 'text-slate-500 hover:text-white'}`} title="List View"><List className="w-4 h-4" /></button>
              <button onClick={() => setViewMode('grid')} className={`p-1.5 rounded ${viewMode === 'grid' ? 'bg-slate-700 text-white shadow' : 'text-slate-500 hover:text-white'}`} title="Grid View"><LayoutGrid className="w-4 h-4" /></button>
              <button onClick={() => setViewMode('stack')} className={`p-1.5 rounded ${viewMode === 'stack' ? 'bg-slate-700 text-white shadow' : 'text-slate-500 hover:text-white'}`} title="Stack View"><Layers className="w-4 h-4" /></button>
            </div>

            {/* Group By Dropdown (Only relevant for Stack View usually, but nice to have) */}
            {viewMode === 'stack' && (
              <div className="flex bg-slate-900 rounded-lg p-1 border border-slate-700 h-9 items-center px-2 gap-2">
                <span className="text-[10px] text-slate-500 uppercase font-bold">Sort:</span>
                <select
                  value={groupBy}
                  onChange={(e) => setGroupBy(e.target.value as any)}
                  className="bg-transparent text-xs font-bold text-white outline-none cursor-pointer"
                >
                  <option value="color">Color</option>
                  <option value="type">Type</option>
                  <option value="cmc">Mana Value</option>
                  <option value="rarity">Rarity</option>
                </select>
              </div>
            )}

            {/* Layout Switcher */}
            <div className="hidden sm:flex bg-slate-900 rounded-lg p-1 border border-slate-700">
              <button onClick={() => setLayout('vertical')} className={`p-1.5 rounded ${layout === 'vertical' ? 'bg-slate-700 text-white shadow' : 'text-slate-500 hover:text-white'}`} title="Vertical Split"><Columns className="w-4 h-4" /></button>
              <button onClick={() => setLayout('horizontal')} className={`p-1.5 rounded ${layout === 'horizontal' ? 'bg-slate-700 text-white shadow' : 'text-slate-500 hover:text-white'}`} title="Horizontal Split"><LayoutTemplate className="w-4 h-4" /></button>
            </div>

            {/* Slider */}
            <div className="hidden sm:flex items-center gap-2 bg-slate-900 rounded-lg px-2 py-1 border border-slate-700 h-9">
              <div className="w-2 h-3 rounded border border-slate-500 bg-slate-700" />
              <input
                type="range"
                min="60"
                max="200"
                step="1"
                value={cardWidth}
                onChange={(e) => setCardWidth(parseInt(e.target.value))}
                className="w-24 accent-purple-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg appearance-none"
              />
              <div className="w-3 h-5 rounded border border-slate-500 bg-slate-700" />
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2 text-amber-400 font-mono text-sm font-bold bg-slate-900 px-3 py-1.5 rounded border border-amber-500/30">
              <Clock className="w-4 h-4" /> {formatTime(timer)}
            </div>
            <button
              onClick={submitDeck}
              className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg font-bold shadow-lg flex items-center gap-2 transition-transform hover:scale-105 text-sm"
            >
              <Save className="w-4 h-4" /> <span className="hidden sm:inline">Submit Deck</span><span className="sm:hidden">Save</span>
            </button>
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden lg:flex-row flex-col">
          {/* Zoom Sidebar */}
          <div className="hidden xl:flex w-72 shrink-0 flex-col items-center justify-start pt-4 border-r border-slate-800 bg-slate-900 z-10 p-4" style={{ perspective: '1000px' }}>
            <div className="w-full relative sticky top-4">
              <div
                className="relative w-full aspect-[2.5/3.5] transition-all duration-300 ease-in-out"
                style={{
                  transformStyle: 'preserve-3d',
                  transform: hoveredCard ? 'rotateY(0deg)' : 'rotateY(180deg)'
                }}
              >
                {/* Front Face (Hovered Card) */}
                <div
                  className="absolute inset-0 w-full h-full bg-slate-900 rounded-xl"
                  style={{ backfaceVisibility: 'hidden' }}
                >
                  {(hoveredCard || displayCard) && (
                    <div className="w-full h-full flex flex-col bg-slate-900 rounded-xl">
                      <img
                        src={(hoveredCard || displayCard).image || (hoveredCard || displayCard).image_uris?.normal || (hoveredCard || displayCard).card_faces?.[0]?.image_uris?.normal}
                        alt={(hoveredCard || displayCard).name}
                        className="w-full rounded-xl shadow-2xl shadow-black ring-1 ring-white/10"
                        draggable={false}
                      />
                      <div className="mt-4 text-center">
                        <h3 className="text-lg font-bold text-slate-200">{(hoveredCard || displayCard).name}</h3>
                        <p className="text-xs text-slate-400 uppercase tracking-wider mt-1">{(hoveredCard || displayCard).typeLine || (hoveredCard || displayCard).type_line}</p>
                        {(hoveredCard || displayCard).oracle_text && (
                          <div className="mt-4 text-xs text-slate-400 text-left bg-slate-950 p-3 rounded-lg border border-slate-800 leading-relaxed">
                            {(hoveredCard || displayCard).oracle_text.split('\n').map((line: string, i: number) => <p key={i} className="mb-1">{line}</p>)}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Back Face (Card Back) */}
                <div
                  className="absolute inset-0 w-full h-full rounded-xl shadow-2xl overflow-hidden bg-slate-900"
                  style={{
                    backfaceVisibility: 'hidden',
                    transform: 'rotateY(180deg)'
                  }}
                >
                  <img
                    src="/images/back.jpg"
                    alt="Card Back"
                    className="w-full h-full object-cover"
                    draggable={false}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Content Area */}
          {layout === 'vertical' ? (
            <div className="flex-1 flex flex-col lg:flex-row">
              {/* Pool Column */}
              <DroppableZone id="pool-zone" className="flex-1 flex flex-col min-w-0 border-r border-slate-800 bg-slate-900/50">
                <div className="p-3 border-b border-slate-800 font-bold text-slate-400 uppercase text-xs flex justify-between">
                  <span>Card Pool ({pool.length})</span>
                </div>
                <div className="flex-1 overflow-auto p-2 custom-scrollbar flex flex-col">
                  {renderLandStation()}
                  <CardsDisplay cards={pool} viewMode={viewMode} cardWidth={cardWidth} onCardClick={addToDeck} onHover={setHoveredCard} emptyMessage="Pool Empty" source="pool" groupBy={groupBy} />
                </div>
              </DroppableZone>
              {/* Deck Column */}
              <DroppableZone id="deck-zone" className="flex-1 flex flex-col min-w-0 bg-slate-900/50">
                <div className="p-3 border-b border-slate-800 font-bold text-slate-400 uppercase text-xs flex justify-between">
                  <span>Library ({deck.length})</span>
                </div>
                <div className="flex-1 overflow-auto p-2 custom-scrollbar">
                  <CardsDisplay cards={deck} viewMode={viewMode} cardWidth={cardWidth} onCardClick={removeFromDeck} onHover={setHoveredCard} emptyMessage="Your Library is Empty" source="deck" groupBy={groupBy} />
                </div>
              </DroppableZone>
            </div>
          ) : (
            <div className="flex-1 flex flex-col">
              {/* Top: Pool + Land Station */}
              <DroppableZone id="pool-zone" className="flex-1 flex flex-col min-h-0 border-b border-slate-800 bg-slate-900/50">
                <div className="p-2 border-b border-slate-800 font-bold text-slate-400 uppercase text-xs flex justify-between shrink-0">
                  <span>Card Pool ({pool.length})</span>
                </div>
                <div className="flex-1 overflow-auto p-2 custom-scrollbar flex flex-col">
                  {renderLandStation()}
                  <CardsDisplay cards={pool} viewMode={viewMode} cardWidth={cardWidth} onCardClick={addToDeck} onHover={setHoveredCard} emptyMessage="Pool Empty" source="pool" groupBy={groupBy} />
                </div>
              </DroppableZone>
              {/* Bottom: Deck */}
              <DroppableZone id="deck-zone" className="h-[40%] flex flex-col min-h-0 bg-slate-900/50">
                <div className="p-2 border-b border-slate-800 font-bold text-slate-400 uppercase text-xs flex justify-between shrink-0">
                  <span>Library ({deck.length})</span>
                </div>
                <div className="flex-1 overflow-auto p-2 custom-scrollbar">
                  <CardsDisplay cards={deck} viewMode={viewMode} cardWidth={cardWidth} onCardClick={removeFromDeck} onHover={setHoveredCard} emptyMessage="Your Library is Empty" source="deck" groupBy={groupBy} />
                </div>
              </DroppableZone>
            </div>
          )}
        </div>

        <DragOverlay dropAnimation={null}>
          {draggedCard ? (
            <div
              style={{ width: `${cardWidth}px` }}
              className={`rounded-xl shadow-2xl opacity-90 rotate-3 cursor-grabbing overflow-hidden ring-2 ring-emerald-500 bg-slate-900 aspect-[2.5/3.5]`}
            >
              <img src={draggedCard.image || draggedCard.image_uris?.normal} alt={draggedCard.name} className="w-full h-full object-cover" draggable={false} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
};

const DeckCardItem = ({ card, useArtCrop, isFoil, onCardClick, onHover }: any) => {
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
};
