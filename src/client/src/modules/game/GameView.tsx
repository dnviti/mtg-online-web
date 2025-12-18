import { useRef, useState, useEffect, useCallback } from 'react';
import { ChevronLeft, Eye, RotateCcw } from 'lucide-react';
import { DndContext, DragOverlay, useSensor, useSensors, MouseSensor, TouchSensor, DragStartEvent, DragEndEvent, useDraggable, useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { GameState, CardInstance } from '../../types/game';
import { socketService } from '../../services/SocketService';
import { CardComponent } from './CardComponent';
import { GameContextMenu, ContextMenuRequest } from './GameContextMenu';
import { ZoneOverlay } from './ZoneOverlay';
import { PhaseStrip } from './PhaseStrip';
import { SmartButton } from './SmartButton';
import { StackVisualizer } from './StackVisualizer';
import { GestureManager } from './GestureManager';
import { MulliganView } from './MulliganView';
import { RadialMenu, RadialOption } from './RadialMenu';
import { InspectorOverlay } from './InspectorOverlay';

// --- DnD Helpers ---
const DraggableCardWrapper = ({ children, card, disabled }: { children: React.ReactNode, card: CardInstance, disabled?: boolean }) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: card.instanceId,
    data: { card, type: 'card' },
    disabled
  });

  const style: React.CSSProperties | undefined = transform ? {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0 : 1, // Hide original when dragging, we use overlay
    zIndex: isDragging ? 999 : undefined
  } : undefined;

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes} className="relative touch-none">
      {children}
    </div>
  );
};

const DroppableZone = ({ id, children, className, data }: { id: string, children?: React.ReactNode, className?: string, data?: any }) => {
  const { setNodeRef, isOver } = useDroppable({
    id,
    data
  });

  return (
    <div ref={setNodeRef} className={`${className} ${isOver ? 'ring-2 ring-emerald-400 bg-emerald-400/10' : ''}`}>
      {children}
    </div>
  );
};

interface GameViewProps {
  gameState: GameState;
  currentPlayerId: string;
}

export const GameView: React.FC<GameViewProps> = ({ gameState, currentPlayerId }) => {
  // Assuming useGameSocket is a custom hook that provides game state and player info
  // This line was added based on the provided snippet, assuming it's part of the intended context.
  // If useGameSocket is not defined elsewhere, this will cause an error.
  // For the purpose of this edit, I'm adding it as it appears in the instruction's context.
  // const { gameState: socketGameState, myPlayerId, isConnected } = useGameSocket();
  const battlefieldRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [inspectedCard, setInspectedCard] = useState<CardInstance | null>(null);
  const [radialOptions, setRadialOptions] = useState<RadialOption[] | null>(null);
  const [radialPosition, setRadialPosition] = useState<{ x: number, y: number }>({ x: 0, y: 0 });
  const [isYielding, setIsYielding] = useState(false);

  const [contextMenu, setContextMenu] = useState<ContextMenuRequest | null>(null);
  const [viewingZone, setViewingZone] = useState<string | null>(null);
  const [hoveredCard, setHoveredCard] = useState<CardInstance | null>(null);

  // Auto-Pass Priority if Yielding
  useEffect(() => {
    if (isYielding && gameState.priorityPlayerId === currentPlayerId) {
      // Stop yielding if stack is NOT empty? usually F4 stops if something is on stack that ISN'T what we yielded to.
      // For simple "Yield All", we just pass. But if it's "Yield until EOT", we pass on empty stack?
      // Let's implement safe yield: Pass if stack is empty OR if we didn't specify a stop condition.
      // Actually, for MVP "Yield", just pass everything. User can cancel.

      // Important: Don't yield during Declare Attackers/Blockers (steps where action isn't strictly priority pass)
      if (['declare_attackers', 'declare_blockers'].includes(gameState.step || '')) {
        setIsYielding(false); // Auto-stop yield on combat decisions
        return;
      }

      console.log("Auto-Yielding Priority...");
      const timer = setTimeout(() => {
        socketService.socket.emit('game_strict_action', { action: { type: 'PASS_PRIORITY' } });
      }, 500); // Small delay to visualize "Yielding" state or allow cancel
      return () => clearTimeout(timer);
    }
  }, [isYielding, gameState.priorityPlayerId, gameState.step, currentPlayerId]);

  // Reset Yield on Turn Change
  useEffect(() => {
    // If turn changes or phase changes significantly? F4 is until EOT.
    // We can reset if it's my turn again? Or just let user toggle.
    // Strict F4 resets at cleanup.
    if (gameState.step === 'cleanup') {
      setIsYielding(false);
    }
  }, [gameState.step]);

  // --- Combat State ---
  const [proposedAttackers, setProposedAttackers] = useState<Set<string>>(new Set());
  const [proposedBlockers, setProposedBlockers] = useState<Map<string, string>>(new Map()); // BlockerId -> AttackerId

  // Reset proposed state when step changes
  useEffect(() => {
    setProposedAttackers(new Set());
    setProposedBlockers(new Map());
  }, [gameState.step]);

  // --- Sidebar State ---
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    return localStorage.getItem('game_sidebarCollapsed') === 'true';
  });
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem('game_sidebarWidth');
    return saved ? parseInt(saved, 10) : 320;
  });

  const resizingState = useRef<{
    startX: number,
    startWidth: number,
    active: boolean
  }>({ startX: 0, startWidth: 0, active: false });

  // --- Persistence ---
  useEffect(() => {
    localStorage.setItem('game_sidebarCollapsed', isSidebarCollapsed.toString());
  }, [isSidebarCollapsed]);

  useEffect(() => {
    localStorage.setItem('game_sidebarWidth', sidebarWidth.toString());
  }, [sidebarWidth]);

  useEffect(() => {
    if (sidebarRef.current) sidebarRef.current.style.width = `${sidebarWidth}px`;
  }, []);

  // --- Resize Handlers ---
  const handleResizeStart = (e: React.MouseEvent | React.TouchEvent) => {
    if (e.cancelable) e.preventDefault();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;

    resizingState.current = {
      startX: clientX,
      startWidth: sidebarRef.current?.getBoundingClientRect().width || 320,
      active: true
    };

    document.addEventListener('mousemove', onResizeMove);
    document.addEventListener('touchmove', onResizeMove, { passive: false });
    document.addEventListener('mouseup', onResizeEnd);
    document.addEventListener('touchend', onResizeEnd);
    document.body.style.cursor = 'col-resize';
  };

  const onResizeMove = useCallback((e: MouseEvent | TouchEvent) => {
    if (!resizingState.current.active || !sidebarRef.current) return;
    if (e.cancelable) e.preventDefault();

    const clientX = (e as TouchEvent).touches ? (e as TouchEvent).touches[0].clientX : (e as MouseEvent).clientX;
    const delta = clientX - resizingState.current.startX;
    const newWidth = Math.max(200, Math.min(600, resizingState.current.startWidth + delta));
    sidebarRef.current.style.width = `${newWidth}px`;
  }, []);

  const onResizeEnd = useCallback(() => {
    if (resizingState.current.active && sidebarRef.current) {
      setSidebarWidth(parseInt(sidebarRef.current.style.width));
    }
    resizingState.current.active = false;
    document.removeEventListener('mousemove', onResizeMove);
    document.removeEventListener('touchmove', onResizeMove);
    document.removeEventListener('mouseup', onResizeEnd);
    document.removeEventListener('touchend', onResizeEnd);
    document.body.style.cursor = 'default';
  }, []);

  useEffect(() => {
    // Disable default context menu
    const handleContext = (e: MouseEvent) => e.preventDefault();
    document.addEventListener('contextmenu', handleContext);
    return () => document.removeEventListener('contextmenu', handleContext);
  }, []);

  const handleContextMenu = (e: React.MouseEvent, type: 'background' | 'card' | 'zone', targetId?: string, zoneName?: string) => {
    e.preventDefault();
    e.stopPropagation();

    const card = (type === 'card' && targetId) ? gameState.cards[targetId] : undefined;

    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      type,
      targetId,
      card,
      zone: zoneName
    });
  };

  const handleMenuAction = (actionType: string, payload: any) => {
    setContextMenu(null); // Close context menu after action

    // Handle local-only actions (Inspect)
    if (actionType === 'INSPECT') {
      const card = gameState.cards[payload.cardId];
      if (card) {
        setInspectedCard(card);
      }
      return;
    }

    // Handle Radial Menu trigger (MANA)
    if (actionType === 'MANA') {
      const card = gameState.cards[payload.cardId];
      if (card) {
        setRadialPosition({ x: payload.x || window.innerWidth / 2, y: payload.y || window.innerHeight / 2 });
        setRadialOptions([
          { id: 'W', label: 'White', color: '#f0f2eb', onSelect: () => socketService.socket.emit('game_strict_action', { action: { type: 'ADD_MANA', color: 'W' } }) },
          { id: 'U', label: 'Blue', color: '#aae0fa', onSelect: () => socketService.socket.emit('game_strict_action', { action: { type: 'ADD_MANA', color: 'U' } }) },
          { id: 'B', label: 'Black', color: '#cbc2bf', onSelect: () => socketService.socket.emit('game_strict_action', { action: { type: 'ADD_MANA', color: 'B' } }) },
          { id: 'R', label: 'Red', color: '#f9aa8f', onSelect: () => socketService.socket.emit('game_strict_action', { action: { type: 'ADD_MANA', color: 'R' } }) },
          { id: 'G', label: 'Green', color: '#9bd3ae', onSelect: () => socketService.socket.emit('game_strict_action', { action: { type: 'ADD_MANA', color: 'G' } }) },
          { id: 'C', label: 'Colorless', color: '#ccc2c0', onSelect: () => socketService.socket.emit('game_strict_action', { action: { type: 'ADD_MANA', color: 'C' } }) },
        ]);
      }
      return;
    }

    if (actionType === 'VIEW_ZONE') {
      setViewingZone(payload.zone);
      return;
    }

    // Default payload to object if undefined
    const safePayload = payload || {};

    // Inject currentPlayerId if not present (acts as actor)
    if (!safePayload.playerId) {
      safePayload.playerId = currentPlayerId;
    }
    // Inject ownerId if not present (useful for token creation etc)
    if (!safePayload.ownerId) {
      safePayload.ownerId = currentPlayerId;
    }

    socketService.socket.emit('game_action', {
      action: {
        type: actionType,
        ...safePayload
      }
    });
  };

  const toggleTap = (cardId: string) => {
    socketService.socket.emit('game_action', {
      action: {
        type: 'TAP_CARD',
        cardId
      }
    });
  }

  const handleGesture = (type: 'TAP' | 'ATTACK' | 'CANCEL', cardIds: string[]) => {
    if (gameState.activePlayerId !== currentPlayerId) return;

    // Combat Logic
    if (gameState.step === 'declare_attackers') {
      const newSet = new Set(proposedAttackers);
      if (type === 'ATTACK') {
        cardIds.forEach(id => newSet.add(id));
      } else if (type === 'CANCEL') {
        cardIds.forEach(id => newSet.delete(id));
      } else if (type === 'TAP') {
        // In declare attackers, Tap/Slash might mean "Toggle Attack"
        cardIds.forEach(id => {
          if (newSet.has(id)) newSet.delete(id);
          else newSet.add(id);
        });
      }
      setProposedAttackers(newSet);
      return;
    }

    // Default Tap Logic (Outside combat declaration)
    if (type === 'TAP') {
      cardIds.forEach(id => {
        socketService.socket.emit('game_action', {
          action: { type: 'TAP_CARD', cardId: id }
        });
      });
    }
  };

  // --- DnD Sensors & Logic ---
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 10 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } })
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragId(null);
    const { active, over } = event;

    if (!over) return;

    const cardId = active.id as string;
    const card = gameState.cards[cardId];
    if (!card) return;

    // --- Drop on Zone ---
    if (over.data.current?.type === 'zone') {
      const zoneName = over.id as string;

      if (zoneName === 'battlefield') {
        // Handle Battlefield Drop (Play Land / Cast)
        // Note: dnd-kit doesn't give precise coordinates relative to the container as easily as native events
        // unless we calculate it from `event.delta` or `active.rect`.
        // For now, we will drop to "center" or default position if we don't calculate relative %.
        // Let's rely on standard logic:

        if (card.typeLine?.includes('Land')) {
          socketService.socket.emit('game_strict_action', { action: { type: 'PLAY_LAND', cardId } });
        } else {
          socketService.socket.emit('game_strict_action', { action: { type: 'CAST_SPELL', cardId, targets: [] } });
        }
      } else {
        // Move to other zones (Hand/Grave/Exile)
        socketService.socket.emit('game_action', { action: { type: 'MOVE_CARD', cardId, toZone: zoneName } });
      }
      return;
    }

    // --- Drop on Card (Targeting / Blocking) ---
    if (over.data.current?.type === 'card' || over.data.current?.type === 'player') {
      const targetId = over.id as string;
      const targetCard = gameState.cards[targetId];

      if (gameState.step === 'declare_blockers' && card.zone === 'battlefield') {
        // Blocking Logic
        if (targetCard && targetCard.controllerId !== currentPlayerId) {
          const newMap = new Map(proposedBlockers);
          newMap.set(card.instanceId, targetCard.instanceId);
          setProposedBlockers(newMap);
        }
        return;
      }

      // Default Cast with Target
      if (card.zone === 'hand') {
        socketService.socket.emit('game_strict_action', {
          action: { type: 'CAST_SPELL', cardId, targets: [targetId] }
        });
      }
    }
  };

  const myPlayer = gameState.players[currentPlayerId];
  const opponentId = Object.keys(gameState.players).find(id => id !== currentPlayerId);
  const opponent = opponentId ? gameState.players[opponentId] : null;

  const getCards = (ownerId: string | undefined, zone: string) => {
    if (!ownerId) return [];
    return Object.values(gameState.cards).filter(c => c.zone === zone && (c.controllerId === ownerId || c.ownerId === ownerId));
  };

  const myHand = getCards(currentPlayerId, 'hand');
  const myBattlefield = getCards(currentPlayerId, 'battlefield');
  const myGraveyard = getCards(currentPlayerId, 'graveyard');
  const myLibrary = getCards(currentPlayerId, 'library');
  const myExile = getCards(currentPlayerId, 'exile');

  const oppBattlefield = getCards(opponentId, 'battlefield');
  const oppHand = getCards(opponentId, 'hand');
  const oppLibrary = getCards(opponentId, 'library');
  const oppGraveyard = getCards(opponentId, 'graveyard');
  const oppExile = getCards(opponentId, 'exile');

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div
        className="flex h-full w-full bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-900 to-black text-white overflow-hidden select-none font-sans"
        onContextMenu={(e) => handleContextMenu(e, 'background')}
      >
        <GameContextMenu
          request={contextMenu}
          onClose={() => setContextMenu(null)}
          onAction={handleMenuAction}
        />

        {
          viewingZone && (
            <ZoneOverlay
              zoneName={viewingZone}
              cards={getCards(currentPlayerId, viewingZone)}
              onClose={() => setViewingZone(null)}
              onCardContextMenu={(e, cardId) => handleContextMenu(e, 'card', cardId)}
            />
          )
        }

        {/* Targeting Tether Overlay */}
        {/* Targeting Tether Overlay - REMOVED per user request */}

        {/* Mulligan Overlay */}
        {
          gameState.step === 'mulligan' && !myPlayer?.handKept && (
            <MulliganView
              hand={myHand}
              mulliganCount={myPlayer?.mulliganCount || 0}
              onDecision={(keep, cardsToBottom) => {
                socketService.socket.emit('game_strict_action', {
                  action: {
                    type: 'MULLIGAN_DECISION',
                    keep,
                    cardsToBottom
                  }
                });
              }}
            />
          )
        }

        {/* Inspector Overlay */}
        {
          inspectedCard && (
            <InspectorOverlay
              card={inspectedCard}
              onClose={() => setInspectedCard(null)}
            />
          )
        }

        {/* Radial Menu (Mana Ability Demo) */}
        {
          radialOptions && (
            <RadialMenu
              options={radialOptions}
              position={radialPosition}
              onClose={() => setRadialOptions(null)}
            />
          )
        }

        {/* Zoom Sidebar */}
        {
          isSidebarCollapsed ? (
            <div key="collapsed" className="hidden xl:flex shrink-0 w-12 flex-col items-center py-4 bg-slate-900 border-r border-slate-800 z-30 gap-4 transition-all duration-300">
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
              className="hidden xl:flex shrink-0 flex-col items-center justify-start pt-4 border-r border-slate-800 bg-slate-900 z-30 p-4 relative group/sidebar shadow-2xl"
              style={{ width: sidebarWidth }}
            >
              {/* Collapse Button */}
              <button
                onClick={() => setIsSidebarCollapsed(true)}
                className="absolute top-2 right-2 p-1.5 bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg transition-colors z-20 opacity-0 group-hover/sidebar:opacity-100"
                title="Collapse Preview"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <div className="w-full relative sticky top-4 flex flex-col h-full overflow-hidden">
                <div className="relative w-full aspect-[2.5/3.5] transition-all duration-300 ease-in-out shrink-0">
                  <div
                    className="relative w-full h-full"
                    style={{
                      transformStyle: 'preserve-3d',
                      transform: hoveredCard ? 'rotateY(0deg)' : 'rotateY(180deg)',
                      transition: 'transform 0.6s cubic-bezier(0.4, 0.0, 0.2, 1)'
                    }}
                  >
                    {/* Front Face (Hovered Card) */}
                    <div
                      className="absolute inset-0 w-full h-full bg-slate-900 rounded-xl"
                      style={{ backfaceVisibility: 'hidden' }}
                    >
                      {hoveredCard && (
                        <img
                          src={hoveredCard.imageUrl}
                          alt={hoveredCard.name}
                          className="w-full h-full object-cover rounded-xl shadow-2xl shadow-black ring-1 ring-white/10"
                        />
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

                {/* Oracle Text & Details - Only when card is hovered */}
                {hoveredCard && (
                  <div className="mt-4 flex-1 overflow-y-auto px-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
                    <h3 className="text-lg font-bold text-slate-200 leading-tight">{hoveredCard.name}</h3>

                    {hoveredCard.manaCost && (
                      <p className="text-sm text-slate-400 mt-1 font-mono tracking-widest">{hoveredCard.manaCost}</p>
                    )}

                    {hoveredCard.typeLine && (
                      <div className="text-xs text-emerald-400 uppercase tracking-wider font-bold mt-2 border-b border-white/10 pb-2 mb-3">
                        {hoveredCard.typeLine}
                      </div>
                    )}

                    {hoveredCard.oracleText && (
                      <div className="text-sm text-slate-300 text-left bg-slate-900/50 p-3 rounded-lg border border-slate-800 whitespace-pre-wrap leading-relaxed shadow-inner">
                        {hoveredCard.oracleText}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Resize Handle */}
              <div
                className="absolute right-0 top-0 bottom-0 w-1 bg-transparent hover:bg-emerald-500/50 cursor-col-resize z-50 flex flex-col justify-center items-center group transition-colors touch-none"
                onMouseDown={handleResizeStart}
                onTouchStart={handleResizeStart}
              >
                <div className="h-8 w-1 bg-slate-700/50 rounded-full group-hover:bg-emerald-400 transition-colors" />
              </div>
            </div>
          )
        }

        {/* Main Game Area */}
        <div className="flex-1 flex flex-col h-full relative">
          <StackVisualizer gameState={gameState} />

          {/* Top Area: Opponent */}
          <div className="flex-[2] relative flex flex-col pointer-events-none">
            {/* Opponent Hand (Visual) */}
            <div className="absolute top-[-40px] left-0 right-0 flex justify-center -space-x-4 opacity-70">
              {oppHand.map((_, i) => (
                <div key={i} className="w-16 h-24 bg-slate-800 border border-slate-600 rounded shadow-lg transform rotate-180"></div>
              ))}
            </div>

            {/* Opponent Info Bar */}
            <div
              className="absolute top-4 left-4 z-10 flex items-center space-x-4 pointer-events-auto bg-black/50 p-2 rounded-lg backdrop-blur-sm border border-slate-700"
            >
              <DroppableZone id={opponentId || 'opponent'} data={{ type: 'player' }} className="absolute inset-0 z-0 opacity-0">Player</DroppableZone>
              <div className="flex flex-col z-10 pointer-events-none">
                <div className="flex flex-col">
                  <span className="font-bold text-lg text-red-400">{opponent?.name || 'Waiting...'}</span>
                  <div className="flex gap-2 text-xs text-slate-400">
                    <span>Hand: {oppHand.length}</span>
                    <span>Lib: {oppLibrary.length}</span>
                    <span>Grave: {oppGraveyard.length}</span>
                    <span>Exile: {oppExile.length}</span>
                  </div>
                </div>
                <div className="text-3xl font-bold text-white">{opponent?.life}</div>
              </div>
            </div>

            {/* Opponent Battlefield */}
            <div className="flex-1 w-full relative perspective-1000">
              <div
                className="w-full h-full relative"
                style={{
                  transform: 'rotateX(-20deg) scale(0.9)',
                  transformOrigin: 'center bottom',
                }}
              >
                {oppBattlefield.map(card => {
                  const isAttacking = card.attacking === currentPlayerId; // They are attacking ME
                  const isBlockedByMe = Array.from(proposedBlockers.values()).includes(card.instanceId);

                  return (
                    <div
                      key={card.instanceId}
                      className="absolute transition-all duration-300 ease-out"
                      style={{
                        left: `${card.position?.x || 50}%`,
                        top: `${card.position?.y || 50}%`,
                        zIndex: Math.floor((card.position?.y || 0)),
                        transform: isAttacking ? 'translateY(40px) scale(1.1)' : 'none' // Move towards me
                      }}
                    >
                      <CardComponent
                        card={card}
                        viewMode="cutout"
                        onDragStart={() => { }}
                        onClick={() => { }}
                        onMouseEnter={() => setHoveredCard(card)}
                        onMouseLeave={() => setHoveredCard(null)}
                        className={`
                              w-24 h-24 rounded shadow-sm
                              ${isAttacking ? "ring-4 ring-red-600 shadow-[0_0_20px_rgba(220,38,38,0.6)]" : ""}
                              ${isBlockedByMe ? "ring-4 ring-blue-500" : ""}
                            `}
                      />
                      <DroppableZone id={card.instanceId} data={{ type: 'card' }} className="absolute inset-0 rounded-lg" />
                      {isAttacking && (
                        <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-red-600 text-white text-[10px] font-bold px-2 py-0.5 rounded shadow">
                          ATTACKING
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Middle Area: My Battlefield (The Table) */}
          <DroppableZone id="battlefield" data={{ type: 'zone' }} className="flex-[4] relative perspective-1000 z-10">
            <div
              className="w-full h-full"
              ref={battlefieldRef}
            >
              <GestureManager onGesture={handleGesture}>
                <div
                  className="w-full h-full relative bg-slate-900/20 border-y border-white/5 shadow-inner flex flex-col"
                  style={{
                    transform: 'rotateX(25deg)',
                    transformOrigin: 'center 40%',
                    boxShadow: 'inset 0 0 100px rgba(0,0,0,0.8)'
                  }}
                >
                  {/* Battlefield Texture/Grid */}
                  <div className="absolute inset-0 opacity-10 bg-[linear-gradient(rgba(255,255,255,0.1)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.1)_1px,transparent_1px)] bg-[size:50px_50px] pointer-events-none"></div>

                  {(() => {
                    const creatures = myBattlefield.filter(c => c.types?.includes('Creature'));
                    const allLands = myBattlefield.filter(c => c.types?.includes('Land') && !c.types?.includes('Creature'));
                    const others = myBattlefield.filter(c => !c.types?.includes('Creature') && !c.types?.includes('Land'));

                    const untappedLands = allLands.filter(c => !c.tapped);
                    const tappedLands = allLands.filter(c => c.tapped);

                    const renderCard = (card: CardInstance) => {
                      const isAttacking = proposedAttackers.has(card.instanceId);
                      const blockingTargetId = proposedBlockers.get(card.instanceId);

                      return (
                        <div
                          key={card.instanceId}
                          className="relative transition-all duration-300"
                          style={{
                            zIndex: 10,
                            transform: isAttacking
                              ? 'translateY(-40px) scale(1.1) rotateX(10deg)'
                              : blockingTargetId
                                ? 'translateY(-20px) scale(1.05)'
                                : 'none',
                            boxShadow: isAttacking ? '0 20px 40px -10px rgba(239, 68, 68, 0.5)' : 'none'
                          }}
                        >
                          <DraggableCardWrapper card={card}>
                            <CardComponent
                              card={card}
                              viewMode="cutout"
                              onDragStart={() => { }}
                              onClick={(id) => {
                                if (gameState.step === 'declare_attackers') {
                                  const newSet = new Set(proposedAttackers);
                                  if (newSet.has(id)) newSet.delete(id);
                                  else newSet.add(id);
                                  setProposedAttackers(newSet);
                                } else {
                                  toggleTap(id);
                                }
                              }}
                              onContextMenu={(id, e) => handleContextMenu(e, 'card', id)}
                              onMouseEnter={() => setHoveredCard(card)}
                              onMouseLeave={() => setHoveredCard(null)}
                              className={`
                                  w-24 h-24 rounded shadow-sm transition-all duration-300
                                  ${isAttacking ? "ring-4 ring-red-500 ring-offset-2 ring-offset-slate-900" : ""}
                                  ${blockingTargetId ? "ring-4 ring-blue-500 ring-offset-2 ring-offset-slate-900" : ""}
                                `}
                            />
                          </DraggableCardWrapper>
                          {blockingTargetId && (
                            <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-[10px] uppercase font-bold px-2 py-0.5 rounded shadow z-50 whitespace-nowrap">
                              Blocking
                            </div>
                          )}
                        </div>
                      );
                    };

                    return (
                      <>
                        <div className="flex-1 flex flex-wrap content-end justify-center items-end p-4 gap-2 border-b border-white/5 relative z-10 w-full">
                          {creatures.length === 0 && (
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-20">
                              <span className="text-white text-2xl font-bold uppercase tracking-widest">Combat Zone</span>
                            </div>
                          )}
                          {creatures.map(renderCard)}
                        </div>
                        <div className="min-h-[120px] flex flex-wrap content-center justify-center items-center p-2 gap-2 border-b border-white/5 relative z-0 w-full bg-slate-900/30">
                          {others.length > 0 ? others.map(renderCard) : (
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-10">
                              <span className="text-white text-xs font-bold uppercase tracking-widest">Artifacts & Enchantments</span>
                            </div>
                          )}
                        </div>
                        <div className="min-h-[120px] flex content-start justify-center items-start p-2 gap-4 relative z-0 w-full">
                          {allLands.length === 0 && (
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-10">
                              <span className="text-white text-xs font-bold uppercase tracking-widest">Lands</span>
                            </div>
                          )}

                          {/* Tapped Lands Stack */}
                          {tappedLands.length > 0 && (
                            <div className="relative min-w-[140px] h-32 flex items-center justify-center">
                              {tappedLands.map((card, i) => (
                                <div
                                  key={card.instanceId}
                                  className="absolute origin-center"
                                  style={{
                                    transform: `translate(${i * 2}px, ${i * -2}px)`,
                                    zIndex: i,
                                  }}
                                >
                                  {renderCard(card)}
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Untapped Lands */}
                          <div className="flex flex-wrap gap-1 content-start items-start justify-center">
                            {untappedLands.map(renderCard)}
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </GestureManager>
            </div>
          </DroppableZone>

          {/* Bottom Area: Controls & Hand */}
          <div className="h-48 relative z-20 flex bg-gradient-to-t from-black to-slate-900/80 backdrop-blur-md shadow-[0_-5px_20px_rgba(0,0,0,0.5)]">

            {/* Left Controls: Library/Grave */}
            <div className="w-40 p-2 flex flex-col gap-2 items-center justify-center border-r border-white/10">
              {/* Phase Strip Integration */}
              <div className="mb-2 scale-75 origin-center">
                <PhaseStrip gameState={gameState} />
              </div>

              <div className="flex gap-2">
                <DroppableZone
                  id="library"
                  data={{ type: 'zone' }}
                  className="group relative w-12 h-16 bg-slate-800 rounded border border-slate-600 cursor-pointer shadow-lg transition-transform hover:-translate-y-1 hover:shadow-cyan-500/20"
                >
                  <div
                    className="w-full h-full relative"
                    onClick={() => socketService.socket.emit('game_action', { action: { type: 'DRAW_CARD' } })}
                    onContextMenu={(e: React.MouseEvent) => handleContextMenu(e, 'zone', undefined, 'library')}
                  >
                    <div className="absolute inset-0 bg-gradient-to-br from-slate-700 to-slate-800 rounded"></div>
                    <div className="absolute inset-0 flex items-center justify-center flex-col">
                      <span className="text-[8px] font-bold text-slate-300">Lib</span>
                      <span className="text-sm font-bold text-white">{myLibrary.length}</span>
                    </div>
                  </div>
                </DroppableZone>

                <DroppableZone
                  id="graveyard"
                  data={{ type: 'zone' }}
                  className="w-12 h-16 border-2 border-dashed border-slate-600 rounded flex items-center justify-center transition-colors hover:border-slate-400 hover:bg-white/5"
                >
                  <div
                    className="w-full h-full flex flex-col items-center justify-center"
                    onContextMenu={(e) => handleContextMenu(e, 'zone', undefined, 'graveyard')}
                  >
                    <span className="block text-slate-500 text-[8px] uppercase">GY</span>
                    <span className="text-sm font-bold text-slate-400">{myGraveyard.length}</span>
                  </div>
                </DroppableZone>
              </div>
            </div>

            {/* Hand Area & Smart Button */}
            <div className="flex-1 relative flex flex-col items-center justify-end px-4 pb-2">
              <DroppableZone id="hand" data={{ type: 'zone' }} className="flex-1 w-full h-full flex flex-col justify-end">

                {/* Smart Button Floating above Hand */}
                <div className="mb-4 z-40 self-center">
                  <SmartButton
                    gameState={gameState}
                    playerId={currentPlayerId}
                    onAction={(type, payload) => socketService.socket.emit(type, { action: payload })}
                    contextData={{
                      attackers: Array.from(proposedAttackers).map(id => ({ attackerId: id, targetId: opponentId })),
                      blockers: Array.from(proposedBlockers.entries()).map(([blockerId, attackerId]) => ({ blockerId, attackerId }))
                    }}
                    isYielding={isYielding}
                    onYieldToggle={() => setIsYielding(!isYielding)}
                  />
                </div>

                <div className="flex justify-center -space-x-12 w-full h-full items-end pb-4 perspective-500">
                  {myHand.map((card, index) => (
                    <div
                      key={card.instanceId}
                      className="transition-all duration-300 hover:-translate-y-16 hover:scale-110 hover:z-50 hover:rotate-0 origin-bottom"
                      style={{
                        transform: `rotate(${(index - (myHand.length - 1) / 2) * 5}deg) translateY(${Math.abs(index - (myHand.length - 1) / 2) * 5}px)`,
                        zIndex: index
                      }}
                    >
                      <DraggableCardWrapper card={card}>
                        <CardComponent
                          card={card}
                          onDragStart={() => { }}
                          onDragEnd={() => { }}
                          onClick={toggleTap}
                          onContextMenu={(id, e) => handleContextMenu(e, 'card', id)}
                          style={{ transformOrigin: 'bottom center' }}
                          onMouseEnter={() => setHoveredCard(card)}
                          onMouseLeave={() => setHoveredCard(null)}
                        />
                      </DraggableCardWrapper>
                    </div>
                  ))}
                </div>
              </DroppableZone>
            </div>

            {/* Right Controls: Exile / Life */}
            <div className="w-40 p-2 flex flex-col gap-4 items-center justify-between border-l border-white/10 py-4">
              <div className="text-center w-full relative">
                <button
                  className="absolute top-0 right-0 p-1 text-slate-600 hover:text-white transition-colors"
                  title="Restart Game (Dev)"
                  onClick={() => {
                    if (window.confirm('Restart game? Deck will remain, state will reset.')) {
                      socketService.socket.emit('game_action', { action: { type: 'RESTART_GAME' } });
                    }
                  }}
                >
                  <RotateCcw className="w-3 h-3" />
                </button>

                <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">Your Life</div>
                <div className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-b from-emerald-400 to-emerald-700 drop-shadow-[0_2px_10px_rgba(16,185,129,0.3)]">
                  {myPlayer?.life}
                </div>
                <div className="flex gap-1 mt-2 justify-center">
                  <button
                    className="w-8 h-8 rounded-full bg-slate-800 hover:bg-red-500/20 text-red-500 border border-slate-700 hover:border-red-500 transition-colors flex items-center justify-center font-bold"
                    onClick={() => socketService.socket.emit('game_action', { action: { type: 'UPDATE_LIFE', amount: -1 } })}
                  >
                    -
                  </button>
                  <button
                    className="w-8 h-8 rounded-full bg-slate-800 hover:bg-emerald-500/20 text-emerald-500 border border-slate-700 hover:border-emerald-500 transition-colors flex items-center justify-center font-bold"
                    onClick={() => socketService.socket.emit('game_action', { action: { type: 'UPDATE_LIFE', amount: 1 } })}
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Mana Pool Display */}
              <div className="w-full bg-slate-800/50 rounded-lg p-2 flex flex-wrap justify-between gap-1 border border-white/5">
                {['W', 'U', 'B', 'R', 'G', 'C'].map(color => {
                  const count = myPlayer?.manaPool?.[color] || 0;
                  const icons: Record<string, string> = {
                    W: '☀️', U: '💧', B: '💀', R: '🔥', G: '🌳', C: '💎'
                  };
                  const colors: Record<string, string> = {
                    W: 'text-yellow-100', U: 'text-blue-300', B: 'text-slate-400', R: 'text-red-400', G: 'text-green-400', C: 'text-slate-300'
                  };

                  return (
                    <div key={color} className={`flex flex-col items-center w-[30%] ${count > 0 ? 'opacity-100 scale-110 font-bold' : 'opacity-30'} transition-all`}>
                      <div className={`text-xs ${colors[color]}`}>{icons[color]}</div>
                      <div className="text-sm font-mono">{count}</div>
                    </div>
                  );
                })}
              </div>

              <DroppableZone id="exile" data={{ type: 'zone' }} className="w-full text-center border-t border-white/5 pt-2 cursor-pointer hover:bg-white/5 rounded p-1">
                <div onContextMenu={(e) => handleContextMenu(e, 'zone', undefined, 'exile')}>
                  <span className="text-xs text-slate-500 block">Exile Drop Zone</span>
                  <span className="text-lg font-bold text-slate-400">{myExile.length}</span>
                </div>
              </DroppableZone>
            </div>

          </div>
        </div>
        <DragOverlay dropAnimation={{ duration: 0, easing: 'linear' }}>
          {activeDragId ? (
            <div className="w-32 h-48 pointer-events-none opacity-80 z-[1000]">
              <img
                src={gameState.cards[activeDragId]?.imageUrl}
                alt="Drag Preview"
                className="w-full h-full object-cover rounded-xl shadow-2xl"
              />
            </div>
          ) : null}
        </DragOverlay>
      </div>
    </DndContext>
  );
};
