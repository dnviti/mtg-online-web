
import React, { useState, useEffect, useRef } from 'react';
import { socketService } from '../../services/SocketService';
import { LogOut, Columns, LayoutTemplate, ChevronLeft, Eye } from 'lucide-react';
import { Modal } from '../../components/Modal';
import { FoilOverlay, FloatingPreview } from '../../components/CardPreview';
import { useCardTouch } from '../../utils/interaction';
import { DndContext, DragOverlay, useSensor, useSensors, MouseSensor, TouchSensor, DragStartEvent, DragEndEvent, useDraggable, useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';

// Helper to normalize card data for visuals
const normalizeCard = (c: any) => ({
  ...c,
  finish: c.finish || 'nonfoil',
  image: c.image || c.image_uris?.normal || c.card_faces?.[0]?.image_uris?.normal
});

// Droppable Wrapper for Pool
const PoolDroppable = ({ children, className, style }: any) => {
  const { setNodeRef, isOver } = useDroppable({
    id: 'pool-zone',
  });

  return (
    <div ref={setNodeRef} className={`${className} ${isOver ? 'ring-4 ring-emerald-500/50 bg-emerald-900/20' : ''}`} style={{ ...style, touchAction: 'none' }}>
      {children}
    </div>
  );
};

interface DraftViewProps {
  draftState: any;
  roomId: string; // Passed from parent
  currentPlayerId: string;
  onExit?: () => void;
}

export const DraftView: React.FC<DraftViewProps> = ({ draftState, currentPlayerId, onExit }) => {
  const [timer, setTimer] = useState(60);
  const [confirmExitOpen, setConfirmExitOpen] = useState(false);

  const myPlayer = draftState.players[currentPlayerId];
  const pickExpiresAt = myPlayer?.pickExpiresAt;

  useEffect(() => {
    if (!pickExpiresAt) {
      setTimer(0);
      return;
    }

    const updateTimer = () => {
      const remainingMs = pickExpiresAt - Date.now();
      setTimer(Math.max(0, Math.ceil(remainingMs / 1000)));
    };

    updateTimer();
    const interval = setInterval(updateTimer, 500); // Check twice a second for smoother updates
    return () => clearInterval(interval);
  }, [pickExpiresAt]);



  // --- UI State & Persistence ---
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem('draft_sidebarWidth');
    return saved ? parseInt(saved, 10) : 320;
  });
  const [poolHeight, setPoolHeight] = useState<number>(() => {
    const saved = localStorage.getItem('draft_poolHeight');
    return saved ? parseInt(saved, 10) : 220;
  });

  const sidebarRef = React.useRef<HTMLDivElement>(null);
  const poolRef = React.useRef<HTMLDivElement>(null);
  const resizingState = React.useRef<{
    startX: number,
    startY: number,
    startWidth: number,
    startHeight: number,
    active: 'sidebar' | 'pool' | null
  }>({ startX: 0, startY: 0, startWidth: 0, startHeight: 0, active: null });

  // Apply initial sizes visually without causing re-renders
  useEffect(() => {
    if (sidebarRef.current) sidebarRef.current.style.width = `${sidebarWidth}px`;
    if (poolRef.current) poolRef.current.style.height = `${poolHeight}px`;
  }, []); // Only on mount to set initial visual state, subsequent updates handled by resize logic


  const [cardScale, setCardScale] = useState<number>(() => {
    const saved = localStorage.getItem('draft_cardScale');
    return saved ? parseFloat(saved) : 0.35;
  });
  // Local state for smooth slider
  const [localCardScale, setLocalCardScale] = useState(cardScale);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync local state if external update happens
  useEffect(() => {
    setLocalCardScale(cardScale);
    if (containerRef.current) {
      containerRef.current.style.setProperty('--card-scale', cardScale.toString());
    }
  }, [cardScale]);

  const [layout, setLayout] = useState<'vertical' | 'horizontal'>('vertical'); // Default to vertical for consistency
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    return localStorage.getItem('draft_sidebarCollapsed') === 'true';
  });

  // Persist settings
  useEffect(() => {
    localStorage.setItem('draft_sidebarCollapsed', isSidebarCollapsed.toString());
  }, [isSidebarCollapsed]);
  useEffect(() => {
    localStorage.setItem('draft_poolHeight', poolHeight.toString());
  }, [poolHeight]);

  useEffect(() => {
    localStorage.setItem('draft_sidebarWidth', sidebarWidth.toString());
  }, [sidebarWidth]);

  useEffect(() => {
    localStorage.setItem('draft_cardScale', cardScale.toString());
  }, [cardScale]);

  const handleResizeStart = (type: 'sidebar' | 'pool', e: React.MouseEvent | React.TouchEvent) => {
    // Prevent default to avoid scrolling/selection
    if (e.cancelable) e.preventDefault();

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    resizingState.current = {
      startX: clientX,
      startY: clientY,
      startWidth: sidebarRef.current?.getBoundingClientRect().width || 320,
      startHeight: poolRef.current?.getBoundingClientRect().height || 220,
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

    // Direct DOM manipulation for performance
    requestAnimationFrame(() => {
      if (resizingState.current.active === 'sidebar' && sidebarRef.current) {
        const delta = clientX - resizingState.current.startX;
        const newWidth = Math.max(200, Math.min(600, resizingState.current.startWidth + delta));
        sidebarRef.current.style.width = `${newWidth}px`;
      }

      if (resizingState.current.active === 'pool' && poolRef.current) {
        const delta = resizingState.current.startY - clientY; // Dragging up increases height
        const newHeight = Math.max(100, Math.min(window.innerHeight * 0.6, resizingState.current.startHeight + delta));
        poolRef.current.style.height = `${newHeight}px`;
      }
    });
  }, []);

  const onResizeEnd = React.useCallback(() => {
    // Commit final state
    if (resizingState.current.active === 'sidebar' && sidebarRef.current) {
      setSidebarWidth(parseInt(sidebarRef.current.style.width));
    }
    if (resizingState.current.active === 'pool' && poolRef.current) {
      setPoolHeight(parseInt(poolRef.current.style.height));
    }

    resizingState.current.active = null;
    document.removeEventListener('mousemove', onResizeMove);
    document.removeEventListener('touchmove', onResizeMove);
    document.removeEventListener('mouseup', onResizeEnd);
    document.removeEventListener('touchend', onResizeEnd);
    document.body.style.cursor = 'default';
  }, []);

  const [hoveredCard, setHoveredCard] = useState<any>(null);
  const [displayCard, setDisplayCard] = useState<any>(null);

  useEffect(() => {
    if (hoveredCard) {
      setDisplayCard(normalizeCard(hoveredCard));
    }
  }, [hoveredCard]);

  const activePack = draftState.players[currentPlayerId]?.activePack;
  const pickedCards = draftState.players[currentPlayerId]?.pool || [];

  const handlePick = (cardId: string) => {
    socketService.socket.emit('pick_card', { cardId });
  };

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
    if (over && over.id === 'pool-zone') {
      handlePick(active.id as string);
    }
    setDraggedCard(null);
  };

  return (
    <div
      ref={containerRef}
      className="flex-1 w-full flex flex-col h-full bg-slate-950 text-white overflow-hidden relative select-none"
      onContextMenu={(e) => e.preventDefault()}
      style={{ '--card-scale': localCardScale } as React.CSSProperties}
    >
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-black opacity-50 pointer-events-none"></div>

        {/* Top Header: Timer & Pack Info */}
        <div className="shrink-0 p-4 z-10">
          <div className="flex flex-col lg:flex-row justify-between items-center bg-slate-900/80 backdrop-blur border border-slate-800 p-4 rounded-lg shadow-lg gap-4 lg:gap-0">
            <div className="flex flex-wrap justify-center items-center gap-4 lg:gap-8">
              <div className="text-center lg:text-left">
                <h2 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-500 shadow-amber-500/20 drop-shadow-sm">
                  Pack {draftState.packNumber}
                </h2>
                <span className="text-sm text-slate-400 font-medium">Pick {pickedCards.length % 15 + 1}</span>
              </div>

              {/* Layout Switcher */}
              <div className="flex bg-slate-900 rounded-lg p-1 border border-slate-700 h-10 items-center">
                <button
                  onClick={() => setLayout('vertical')}
                  className={`p-1.5 rounded ${layout === 'vertical' ? 'bg-slate-700 text-white shadow' : 'text-slate-500 hover:text-white'}`}
                  title="Vertical Split"
                >
                  <Columns className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setLayout('horizontal')}
                  className={`p-1.5 rounded ${layout === 'horizontal' ? 'bg-slate-700 text-white shadow' : 'text-slate-500 hover:text-white'}`}
                  title="Horizontal Split"
                >
                  <LayoutTemplate className="w-4 h-4" />
                </button>
              </div>

              {/* Card Scalar */}
              <div className="flex items-center gap-2 bg-slate-900 rounded-lg px-2 border border-slate-700 h-10">
                <div className="w-2 h-3 rounded border border-slate-500 bg-slate-700" title="Small Cards" />
                <input
                  type="range"
                  min="0.35"
                  max="1.0"
                  step="0.01"
                  value={localCardScale}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    setLocalCardScale(val);
                    // Direct DOM update for performance
                    if (containerRef.current) {
                      containerRef.current.style.setProperty('--card-scale', val.toString());
                    }
                  }}
                  onMouseUp={() => setCardScale(localCardScale)}
                  onTouchEnd={() => setCardScale(localCardScale)}
                  className="w-24 accent-emerald-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg appearance-none"
                />
                <div className="w-3 h-5 rounded border border-slate-500 bg-slate-700" title="Large Cards" />
              </div>
            </div>

            <div className="flex items-center gap-6">
              {!activePack ? (
                <div className="text-sm font-bold text-amber-500 animate-pulse uppercase tracking-wider">Waiting...</div>
              ) : (
                <div className="text-4xl font-mono text-emerald-400 font-bold drop-shadow-[0_0_10px_rgba(52,211,153,0.5)]">
                  00:{timer < 10 ? `0${timer}` : timer}
                </div>
              )}
              {onExit && (
                <button
                  onClick={() => setConfirmExitOpen(true)}
                  className="p-3 bg-slate-800 hover:bg-red-500/20 text-slate-400 hover:text-red-500 border border-slate-700 hover:border-red-500/50 rounded-xl transition-all shadow-lg group"
                  title="Exit to Lobby"
                >
                  <LogOut className="w-5 h-5 group-hover:scale-110 transition-transform" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Middle Content: Zoom Sidebar + Pack Grid */}
        <div className="flex-1 flex overflow-hidden">

          {/* Dedicated Zoom Zone (Left Sidebar) */}
          {/* Collapsed State: Toolbar Column */}
          {isSidebarCollapsed ? (
            <div key="collapsed" className="hidden lg:flex shrink-0 w-12 flex-col items-center py-4 bg-slate-900 border-r border-slate-800/50 backdrop-blur-sm z-10 gap-4 transition-all duration-300">
              <button
                onClick={() => setIsSidebarCollapsed(false)}
                className="p-3 rounded-xl transition-all duration-200 group relative text-slate-500 hover:text-purple-400 hover:bg-slate-800"
                title="Expand Preview"
              >
                <Eye className="w-6 h-6" />
                <span className="absolute left-full ml-3 top-1/2 -translate-y-1/2 bg-slate-800 text-white text-xs font-bold px-2 py-1 rounded shadow-xl opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none ring-1 ring-white/10 z-50">
                  Card Preview
                </span>
              </button>
            </div>
          ) : (
            <div
              key="expanded"
              ref={sidebarRef}
              className="hidden lg:flex shrink-0 flex-col items-center justify-start pt-8 border-r border-slate-800/50 bg-slate-900/20 backdrop-blur-sm z-10 relative group/sidebar"
              style={{ perspective: '1000px', width: `${sidebarWidth}px` }}
            >
              {/* Collapse Button */}
              <button
                onClick={() => setIsSidebarCollapsed(true)}
                className="absolute top-2 right-2 p-1.5 bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg transition-colors z-20 opacity-0 group-hover/sidebar:opacity-100"
                title="Collapse Preview"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <div className="w-full relative sticky top-8 px-6">
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
                            <div className="mt-4 text-xs text-slate-400 text-left bg-slate-950 p-3 rounded-lg border border-slate-800 leading-relaxed max-h-60 overflow-y-auto custom-scrollbar">
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
              {/* Resize Handle for Sidebar */}
              <div
                className="absolute right-0 top-0 bottom-0 w-1 bg-transparent hover:bg-emerald-500/50 cursor-col-resize z-50 flex flex-col justify-center items-center group transition-colors"
                onMouseDown={(e) => handleResizeStart('sidebar', e)}
                onTouchStart={(e) => handleResizeStart('sidebar', e)}
              >
                <div className="h-8 w-1 bg-slate-700/50 rounded-full group-hover:bg-emerald-400 transition-colors" />
              </div>
            </div>
          )}

          {/* Main Content Area: Handles both Pack and Pool based on layout */}
          {layout === 'vertical' ? (
            <div className="flex-1 flex min-w-0">
              {/* Left: Pack */}
              <div className="flex-1 overflow-y-auto p-4 z-0 custom-scrollbar border-r border-slate-800">
                {!activePack ? (
                  <div className="flex flex-col items-center justify-center min-h-full pb-10 fade-in animate-in duration-500">
                    <div className="w-24 h-24 mb-6 relative">
                      <div className="absolute inset-0 rounded-full border-4 border-slate-800"></div>
                      <div className="absolute inset-0 rounded-full border-t-4 border-emerald-500 animate-spin"></div>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <LogOut className="w-8 h-8 text-emerald-500 rotate-180" />
                      </div>
                    </div>
                    <h2 className="text-3xl font-bold text-white mb-2">Waiting...</h2>
                    <p className="text-slate-400">Your neighbor is picking.</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center min-h-full pb-10">
                    <h3 className="text-center text-slate-500 uppercase tracking-[0.2em] text-xs font-bold mb-8">Select a Card</h3>
                    <div className="flex flex-wrap justify-center gap-6">
                      {activePack.cards.map((rawCard: any) => (
                        <DraftCardItem
                          key={rawCard.id}
                          rawCard={rawCard}
                          cardScale={cardScale}
                          handlePick={handlePick}
                          setHoveredCard={setHoveredCard}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Right: Pool (Vertical Column) */}
              <PoolDroppable className="flex-1 bg-slate-900/50 flex flex-col min-w-0 border-l border-slate-800 transition-colors duration-200">
                <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between shrink-0 bg-slate-900/80">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    Your Pool ({pickedCards.length})
                  </h3>
                </div>
                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                  <div className="flex flex-wrap gap-4 content-start">
                    {pickedCards.map((card: any, idx: number) => (
                      <PoolCardItem key={`${card.id}-${idx}`} card={card} setHoveredCard={setHoveredCard} vertical={true} />
                    ))}
                  </div>
                </div>
              </PoolDroppable>
            </div>
          ) : (
            <div className="flex-1 flex flex-col min-w-0">
              {/* Top: Pack */}
              <div className="flex-1 overflow-y-auto p-4 z-0 custom-scrollbar">
                {!activePack ? (
                  <div className="flex flex-col items-center justify-center min-h-full pb-10 fade-in animate-in duration-500">
                    <div className="w-24 h-24 mb-6 relative">
                      <div className="absolute inset-0 rounded-full border-4 border-slate-800"></div>
                      <div className="absolute inset-0 rounded-full border-t-4 border-emerald-500 animate-spin"></div>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <LogOut className="w-8 h-8 text-emerald-500 rotate-180" />
                      </div>
                    </div>
                    <h2 className="text-3xl font-bold text-white mb-2">Waiting...</h2>
                    <p className="text-slate-400">Your neighbor is picking.</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center min-h-full pb-10">
                    <h3 className="text-center text-slate-500 uppercase tracking-[0.2em] text-xs font-bold mb-8">Select a Card</h3>
                    <div className="flex flex-wrap justify-center gap-6">
                      {activePack.cards.map((rawCard: any) => (
                        <DraftCardItem
                          key={rawCard.id}
                          rawCard={rawCard}
                          cardScale={cardScale}
                          handlePick={handlePick}
                          setHoveredCard={setHoveredCard}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Resize Handle */}
              <div
                className="h-2 bg-slate-800 hover:bg-emerald-500/50 cursor-row-resize z-30 transition-colors w-full flex items-center justify-center shrink-0 group touch-none"
                onMouseDown={(e) => handleResizeStart('pool', e)}
                onTouchStart={(e) => handleResizeStart('pool', e)}
              >
                <div className="w-16 h-1 bg-slate-600 rounded-full group-hover:bg-emerald-300"></div>
              </div>

              {/* Bottom: Pool (Horizontal Strip) */}
              <div ref={poolRef} style={{ height: `${poolHeight}px` }} className="shrink-0 flex flex-col overflow-hidden">
                <PoolDroppable
                  className="flex-1 bg-slate-900/90 backdrop-blur-md flex flex-col z-20 shadow-[-10px_-10px_30px_rgba(0,0,0,0.3)] border-t border-slate-800 min-h-0"
                >
                  <div className="px-6 py-2 flex items-center justify-between shrink-0">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                      Your Pool ({pickedCards.length})
                    </h3>
                  </div>
                  <div className="flex-1 overflow-x-auto flex gap-2 px-6 pb-2 pt-2 custom-scrollbar min-h-0">
                    {pickedCards.map((card: any, idx: number) => (
                      <PoolCardItem key={`${card.id}-${idx}`} card={card} setHoveredCard={setHoveredCard} />
                    ))}
                  </div>
                </PoolDroppable>
              </div>
            </div>
          )}

        </div>
        <Modal
          isOpen={confirmExitOpen}
          onClose={() => setConfirmExitOpen(false)}
          title="Exit Draft?"
          message="Are you sure you want to exit the draft? You can rejoin later."
          type="warning"
          confirmLabel="Exit Draft"
          cancelLabel="Stay"
          onConfirm={onExit}
        />

        {/* Drag Overlay */}
        <DragOverlay dropAnimation={null}>
          {draggedCard ? (
            <div
              className="opacity-90 rotate-3 cursor-grabbing shadow-2xl rounded-xl"
              style={{ width: `calc(14rem * var(--card-scale, ${localCardScale}))`, aspectRatio: '2.5/3.5' }}
            >
              <img src={draggedCard.image} alt={draggedCard.name} className="w-full h-full object-cover rounded-xl" draggable={false} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Mobile Full Screen Preview (triggered by 2-finger long press) */}
      {
        hoveredCard && (
          <div className="lg:hidden">
            <FloatingPreview card={hoveredCard} x={0} y={0} isMobile={true} />
          </div>
        )
      }
    </div >
  );
};

const DraftCardItem = ({ rawCard, handlePick, setHoveredCard }: any) => {
  const card = normalizeCard(rawCard);
  const isFoil = card.finish === 'foil';
  const { onTouchStart, onTouchEnd, onTouchMove, onClick } = useCardTouch(setHoveredCard, () => {
    // Disable tap-to-pick on touch devices, rely on Drag and Drop
    if (window.matchMedia('(pointer: coarse)').matches) return;
    handlePick(card.id);
  }, card);

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: card.id,
    data: { card }
  });

  const style = transform ? {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0 : 1, // Hide original when dragging
  } : undefined;

  // Merge listeners to avoid overriding dnd-kit's TouchSensor
  const mergedListeners = {
    ...listeners,
    onTouchStart: (e: any) => {
      listeners?.onTouchStart?.(e);
      onTouchStart(e);
    },
    onTouchEnd: (e: any) => {
      listeners?.onTouchEnd?.(e);
      onTouchEnd(e);
    },
    onTouchMove: (e: any) => {
      listeners?.onTouchMove?.(e);
      onTouchMove();
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={{ ...style, width: `calc(14rem * var(--card-scale))` }}
      {...attributes}
      {...mergedListeners}
      className="group relative transition-all duration-300 hover:scale-110 hover:-translate-y-4 hover:z-50 cursor-pointer"
      onClick={onClick}
      onMouseEnter={() => setHoveredCard(card)}
      onMouseLeave={() => setHoveredCard(null)}
    >
      {/* Foil Glow Effect */}
      {isFoil && <div className="absolute inset-0 -m-1 rounded-xl bg-purple-500 blur-md opacity-20 group-hover:opacity-60 transition-opacity duration-300 animate-pulse"></div>}

      <div className={`relative w-full rounded-xl shadow-2xl shadow-black overflow-hidden bg-slate-900 ${isFoil ? 'ring-2 ring-purple-400/50' : 'group-hover:ring-2 ring-emerald-400/50'}`}>
        <img
          src={card.image}
          alt={card.name}
          className="w-full h-full object-cover relative z-10"
          draggable={false}
        />
        {isFoil && <FoilOverlay />}
        {isFoil && <div className="absolute top-2 right-2 z-30 text-[10px] font-bold text-white bg-purple-600/80 px-1.5 rounded backdrop-blur-sm border border-white/20">FOIL</div>}
      </div>
    </div>
  );
};

const PoolCardItem = ({ card, setHoveredCard, vertical = false }: any) => {
  const { onTouchStart, onTouchEnd, onTouchMove, onClick } = useCardTouch(setHoveredCard, () => {
    if (window.matchMedia('(pointer: coarse)').matches) return;
  }, card);

  return (
    <div
      className={`relative group shrink-0 flex items-center justify-center cursor-pointer ${vertical ? 'w-24 h-32' : 'h-full aspect-[2.5/3.5] p-2'}`}
      onMouseEnter={() => setHoveredCard(card)}
      onMouseLeave={() => setHoveredCard(null)}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onTouchMove={onTouchMove}
      onClick={onClick}
    >
      <img
        src={card.image || card.image_uris?.normal || card.card_faces?.[0]?.image_uris?.normal}
        alt={card.name}
        className={`${vertical ? 'w-full h-full object-cover' : 'h-full w-auto object-contain'} rounded-lg shadow-lg border border-slate-700/50 group-hover:border-emerald-500/50 group-hover:shadow-emerald-500/20 transition-all`}
        draggable={false}
      />
    </div>
  )
};
