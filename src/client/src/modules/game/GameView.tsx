import React, { useState, useEffect, useRef } from 'react';
import { useConfirm } from '../../components/ConfirmDialog';
import { RotateCcw } from 'lucide-react';
import { useGameToast } from '../../components/GameToast';
import { ManaIcon } from '../../components/ManaIcon';
import { DndContext, DragOverlay, useSensor, useSensors, MouseSensor, TouchSensor, DragStartEvent, DragEndEvent, useDraggable, useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { GameState, CardInstance } from '../../types/game';
import { socketService } from '../../services/SocketService';
import { CardComponent } from './CardComponent';
import { GameContextMenu, ContextMenuRequest } from './GameContextMenu';
import { ZoneOverlay } from './ZoneOverlay';
import { PhaseStrip } from './PhaseStrip';
import { StackVisualizer } from './StackVisualizer';

import { GestureManager } from './GestureManager';
import { MulliganView } from './MulliganView';
import { RadialMenu, RadialOption } from './RadialMenu';
import { InspectorOverlay } from './InspectorOverlay';
import { CreateTokenModal } from './CreateTokenModal'; // Import Modal
import { TokenPickerModal } from './TokenPickerModal';
import { SidePanelPreview } from '../../components/SidePanelPreview';
import { calculateAutoTap } from '../../utils/manaUtils';

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
  const hasPriority = gameState.priorityPlayerId === currentPlayerId;
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
  const [dragAnimationMode, setDragAnimationMode] = useState<'start' | 'end'>('end');
  const [previewTappedIds, setPreviewTappedIds] = useState<Set<string>>(new Set());
  const [stopRequested, setStopRequested] = useState(false);

  const onToggleSuspend = () => {
    setStopRequested(prev => !prev);
  };


  // Custom Token Modal State
  const [isTokenModalOpen, setIsTokenModalOpen] = useState(false);
  const [isTokenPickerOpen, setIsTokenPickerOpen] = useState(false);
  const [pendingTokenPosition, setPendingTokenPosition] = useState<{ x: number, y: number } | null>(null);

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

  // Auto-Yield Logic (Smart Yield against Bot)
  const activePlayer = gameState.activePlayerId ? gameState.players[gameState.activePlayerId] : undefined;
  const isBotTurn = activePlayer?.isBot;

  // Ref to track turn changes to force reset yield
  const prevActivePlayerId = useRef(gameState.activePlayerId);

  useEffect(() => {
    // 1. Detect Turn Change (Active Player changed)
    if (prevActivePlayerId.current !== gameState.activePlayerId) {
      // Reset yield strictly on any turn change to prevent leakage
      setIsYielding(false);
      prevActivePlayerId.current = gameState.activePlayerId;
      // Logic continues below to re-enable if it IS a bot turn...
    }

    if (isBotTurn) {
      // Enforce Yielding during Bot turn (except combat decisions)
      if (['declare_attackers', 'declare_blockers'].includes(gameState.step || '')) {
        // Must pause yield for decisions
        setIsYielding(false);
        // Note: We don't check !isYielding here because if it was true, we want false. 
        // If it was false, we keep false. 
        // But we can't condtionally call setIsYielding based on isYielding inside effect IF the effect has isYielding dependency...
        // Wait, if I set it to false, isYielding changes -> effect runs again.
        // It enters here. isYielding is false. checks... checks...
        // It hit this block. We want it false. It is false. No-op. Stable.
      } else {
        // Standard Bot Phase -> Yield
        // However, we must be careful not to infinite loop if we already set it.
        // BUT, we just set it to false above if turn changed! 
        // So for Bot Turn start: 
        // 1. Turn Change detected -> isYielding = false.
        // 2. isBotTurn is true.
        // 3. We enter here. We want isYielding = true.
        // 4. setIsYielding(true).
        // 5. Render. Effect runs again.
        // 6. Turn Change NOT detected. matches.
        // 7. isBotTurn true.
        // 8. checks isYielding (true). No-op. Stable.

        // One issue: if I manually "Stop Yielding" during bot turn (e.g. to inspect), 
        // this logic will FORCE it back on.
        // That is acceptable for "Auto-Yield vs Bot". Bot turn = You don't play.
        // If you want to Inspect, inspecting doesn't require priority.
        // If you want to STOP the game to do something... well, you don't have priority anyway.
        // So forcing Yield on Bot turn is correct per requirements.

        // Only verify we don't set it if it's already true
        setIsYielding(prev => {
          if (prev) return prev; // already true
          return true;
        });
      }
    } else {
      // Human Turn
      // We do NOTHING here?
      // If we reset on turn change, then it starts false.
      // If I manually enable it, isBotTurn is false. We simply don't interfere.
      // This allows accurate Manual Yielding!
    }
  }, [gameState.activePlayerId, gameState.step, isBotTurn]);

  // --- Smart Auto-Pass (Suspend Logic) ---
  useEffect(() => {
    setStopRequested(false);
  }, [gameState.step, gameState.turn]);

  useEffect(() => {
    // Smart Auto-Pass Logic for NAP
    if (!gameState.activePlayerId) return;
    const amActivePlayer = gameState.activePlayerId === currentPlayerId;
    const amPriorityPlayer = gameState.priorityPlayerId === currentPlayerId;

    // Condition: I am NAP, I have Priority, and I have NOT requested a stop.
    // Logic: Auto-Pass.
    // Condition: I am NAP, I have Priority, and I have NOT requested a stop.
    // Logic: Auto-Pass.
    if (!amActivePlayer && amPriorityPlayer && !stopRequested) {
      if (gameState.step === 'declare_blockers') {
        console.log("[Smart Auto-Pass] Skipped: Enforce manual blocking declaration.");
        return; // Explicit wait for blockers
      }

      console.log("[Smart Auto-Pass] Auto-passing priority as NAP (No Suspend requested).Step:", gameState.step);
      const timer = setTimeout(() => {
        // Double check state hasn't changed in the timeout window
        if (gameState.step === 'declare_blockers') return;

        socketService.socket.emit('game_strict_action', { action: { type: 'PASS_PRIORITY' } });
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [gameState.activePlayerId, gameState.priorityPlayerId, stopRequested, currentPlayerId, gameState.step]);
  // If I access `isYielding` inside `setIsYielding`, I don't need it in dependency.
  // But wait, the `if (['declare_...'].includes)` logic needs to potentially set it false.
  // setIsYielding(false) is fine.
  // The logic seems sound without isYielding in dependency, assuming stable behavior.
  // BUT: `prevActivePlayerId` check needs stable run.

  // Let's keep `isYielding` in deps if I read it? 
  // I replaced reads with functional updates or just strict sets?
  // "if (isYielding) setIsYielding(false)" -> simply "setIsYielding(false)" is safer/idempotent if efficient.
  // React state updates bail out if same value.

  // BUT wait, if I remove `isYielding` from deps, and I toggle it manually...
  // The effect WON'T run.
  // If I toggle manual yield on My Turn. Effect doesn't run. Correct (we don't want it to interfere).

  // If I am in Bot Turn, and I somehow toggle it false? (Button click).
  // Effect doesn't run. isYielding stays false.
  // Bot waits forever? No, bot logic (server) continues.
  // Client just doesn't auto-pass.
  // But we WANT to force it.
  // So we SHOULD depend on `isYielding` so if user turns it off, we force it back on?
  // No, if user turns it off, maybe they want to see?
  // User Requirement: "Auto-Yield".
  // If I rely on `isYielding` in deps, I risk the loop again.
  // Let's try WITHOUT `isYielding` in deps first.
  // This means if I turn it off, it stays off until next step change or phase change.
  // Because `gameState.step` IS in deps.
  // So if step advances, effect runs -> sees Bot Turn -> Forces True.
  // This is good behavior. Re-enables each step.

  // So, removing isYielding from dependencies seems robust.

  // One catch: `['declare_attackers']`.
  // If step is declare_attackers. Effect runs.
  // Forces isYielding(false).
  // User manually clicks yield (true).
  // Effect doesn't run.
  // isYielding stays true.
  // This might be BAD if we want to enforce safety?
  // If user yields in declare_attackers... they yield their chance to attack.
  // That's on them.
  // But the "Flickering" issue was us fighting them.
  // If we don't react to isYielding change, we won't fight.
  // This solves flickering definitively too.

  // Final Plan: Use the logic block above, remove isYielding from deps.



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

  const onResizeMove = (e: MouseEvent | TouchEvent) => {
    if (!resizingState.current.active || !sidebarRef.current) return;
    if (e.cancelable) e.preventDefault();

    const clientX = (e as TouchEvent).touches ? (e as TouchEvent).touches[0].clientX : (e as MouseEvent).clientX;
    const delta = clientX - resizingState.current.startX;
    const newWidth = Math.max(200, Math.min(600, resizingState.current.startWidth + delta));
    sidebarRef.current.style.width = `${newWidth}px`;
  };

  const onResizeEnd = () => {
    if (resizingState.current.active && sidebarRef.current) {
      setSidebarWidth(parseInt(sidebarRef.current.style.width));
    }
    resizingState.current.active = false;
    document.removeEventListener('mousemove', onResizeMove);
    document.removeEventListener('touchmove', onResizeMove);
    document.removeEventListener('mouseup', onResizeEnd);
    document.removeEventListener('touchend', onResizeEnd);
    document.body.style.cursor = 'default';
  };

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
          { id: 'W', label: 'White', icon: <ManaIcon symbol="w" size="2x" shadow />, color: '#f0f2eb', onSelect: () => socketService.socket.emit('game_strict_action', { action: { type: 'ADD_MANA', color: 'W' } }) },
          { id: 'U', label: 'Blue', icon: <ManaIcon symbol="u" size="2x" shadow />, color: '#aae0fa', onSelect: () => socketService.socket.emit('game_strict_action', { action: { type: 'ADD_MANA', color: 'U' } }) },
          { id: 'B', label: 'Black', icon: <ManaIcon symbol="b" size="2x" shadow />, color: '#cbc2bf', onSelect: () => socketService.socket.emit('game_strict_action', { action: { type: 'ADD_MANA', color: 'B' } }) },
          { id: 'R', label: 'Red', icon: <ManaIcon symbol="r" size="2x" shadow />, color: '#f9aa8f', onSelect: () => socketService.socket.emit('game_strict_action', { action: { type: 'ADD_MANA', color: 'R' } }) },
          { id: 'G', label: 'Green', icon: <ManaIcon symbol="g" size="2x" shadow />, color: '#9bd3ae', onSelect: () => socketService.socket.emit('game_strict_action', { action: { type: 'ADD_MANA', color: 'G' } }) },
          { id: 'C', label: 'Colorless', icon: <ManaIcon symbol="c" size="2x" shadow />, color: '#ccc2c0', onSelect: () => socketService.socket.emit('game_strict_action', { action: { type: 'ADD_MANA', color: 'C' } }) },
        ]);
      }
      return;
    }

    if (actionType === 'VIEW_ZONE') {
      setViewingZone(payload.zone);
      return;
    }

    if (actionType === 'OPEN_CUSTOM_TOKEN_MODAL') {
      setPendingTokenPosition({
        x: (contextMenu?.x || window.innerWidth / 2) / window.innerWidth * 100,
        y: (contextMenu?.y || window.innerHeight / 2) / window.innerHeight * 100
      });
      setIsTokenModalOpen(true);
      return;
    }

    if (actionType === 'OPEN_TOKEN_PICKER') {
      setPendingTokenPosition({
        x: (contextMenu?.x || window.innerWidth / 2) / window.innerWidth * 100,
        y: (contextMenu?.y || window.innerHeight / 2) / window.innerHeight * 100
      });
      setIsTokenPickerOpen(true);
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

      const isSick = (card: CardInstance) => {
        const hasHaste = card.keywords?.some(k => k.toLowerCase() === 'haste') ||
          card.definition?.keywords?.some((k: string) => k.toLowerCase() === 'haste') ||
          card.oracleText?.toLowerCase().includes('haste');
        const currentT = gameState.turnCount ?? gameState.turn;
        return card.types?.includes('Creature') &&
          card.controlledSinceTurn === currentT &&
          !hasHaste;
      };

      if (type === 'ATTACK') {
        cardIds.forEach(id => {
          const card = gameState.cards[id];
          if (card && !isSick(card)) {
            newSet.add(id);
          } else if (card && isSick(card)) {
            // Ideally show toast here, but for batch gesture we just ignore
            console.warn(`Cannot attack with ${card.name}: Summoning Sickness`);
          }
        });
      } else if (type === 'CANCEL') {
        cardIds.forEach(id => newSet.delete(id));
      } else if (type === 'TAP') {
        // In declare attackers, Tap/Slash might mean "Toggle Attack"
        cardIds.forEach(id => {
          const card = gameState.cards[id];
          if (newSet.has(id)) newSet.delete(id);
          else {
            if (card && !isSick(card)) newSet.add(id);
          }
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

  const handleCreateCustomToken = (definition: any) => {
    setIsTokenModalOpen(false);
    if (!pendingTokenPosition) return;

    // Send Create Token Action
    socketService.socket.emit('game_action', {
      action: {
        type: 'CREATE_TOKEN',
        definition: definition,
        position: pendingTokenPosition,
        ownerId: currentPlayerId
      }
    });
    setPendingTokenPosition(null);
  };

  // --- Hooks & Services ---
  //  const { showToast } = useToast();
  const { showGameToast } = useGameToast();
  const { confirm } = useConfirm();
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 10 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } })
  );

  // --- Blocker Notification ---
  useEffect(() => {
    if (gameState.step === 'declare_blockers' && hasPriority) {
      showGameToast("Your Turn to Block!", 'info');
    }
  }, [gameState.step, hasPriority, showGameToast]);

  const handleDragStart = (event: DragStartEvent) => {
    const cardId = event.active.id as string;
    setActiveDragId(cardId);

    const card = gameState.cards[cardId];
    if (card && card.zone === 'hand') {
      setDragAnimationMode('start');

      // PREVIEW AUTO TAP
      // If no cost (Land), do nothing.
      if (card.manaCost && myPlayer) {
        const myLands = Object.values(gameState.cards).filter(c =>
          c.controllerId === currentPlayerId &&
          c.zone === 'battlefield' &&
          (c.types?.includes('Land') || c.typeLine?.includes('Land'))
        );
        const toTap = calculateAutoTap(card.manaCost, myPlayer, myLands);
        if (toTap.size > 0) {
          setPreviewTappedIds(toTap);
        }
      }

      // Trigger animation to shrink
      setTimeout(() => {
        setDragAnimationMode('end');
      }, 50);
    } else {
      setDragAnimationMode('end');
    }

    document.body.style.cursor = 'grabbing';
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragId(null);
    setPreviewTappedIds(new Set()); // Clear preview
    document.body.style.cursor = '';
    const { active, over } = event;

    if (!over) return;

    const cardId = active.id as string;
    const card = gameState.cards[cardId];
    if (!card) return;

    if (!hasPriority) return; // Strict Lock on executing drops

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

      // Handle Equipment / Ability on Battlefield
      if (card.zone === 'battlefield') {
        const isEquipment = card.types?.includes('Artifact') && card.subtypes?.includes('Equipment');

        if (isEquipment && over.data.current.type === 'card') { // Equip only targets cards (creatures)
          socketService.socket.emit('game_strict_action', {
            action: { type: 'ACTIVATE_ABILITY', abilityIndex: 0, sourceId: cardId, targets: [targetId] }
          });
          return;
        }
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

        <CreateTokenModal
          isOpen={isTokenModalOpen}
          onClose={() => setIsTokenModalOpen(false)}
          onCreate={handleCreateCustomToken}
        />

        <TokenPickerModal
          isOpen={isTokenPickerOpen}
          onClose={() => setIsTokenPickerOpen(false)}
          setCode={gameState.cards?.[Object.keys(gameState.cards)[0]]?.setCode || 'woe'} // Basic guess or improve setCode detection
          onSelect={(token) => {
            setIsTokenPickerOpen(false);
            if (pendingTokenPosition) {
              // Determine placement zone based on token type
              // Default is where clicked
              // But we construct the definition here

              // Logic to set types properly for Rules Engine to place it in correct row
              const types = (token.type_line || "").split('—')[0].trim().split(' ');
              const subtypes = (token.type_line.split('—')[1] || "").trim().split(' ');

              const definition = {
                name: token.name,
                colors: token.colors || [],
                types: types,
                subtypes: subtypes,
                power: token.power,
                toughness: token.toughness,
                imageUrl: token.image_uris?.normal || token.image_uris?.large || "",
                // If no image, CardComponent will fallback.
                // But server token object might have caching?
              };

              socketService.socket.emit('game_strict_action', {
                action: {
                  type: 'CREATE_TOKEN',
                  definition: definition,
                  position: pendingTokenPosition,
                  ownerId: currentPlayerId
                }
              });
              setPendingTokenPosition(null);
            }
          }}
        />

        {/* Zoom Sidebar */}
        <SidePanelPreview
          ref={sidebarRef}
          card={hoveredCard}
          width={sidebarWidth}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={setIsSidebarCollapsed}
          onResizeStart={handleResizeStart}
          showLog={true}
        />

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
            <div className="flex-1 w-full relative perspective-1000 z-0">
              <div
                className="w-full h-full relative"
                style={{
                  transform: 'rotateX(-20deg) scale(0.9)',
                  transformOrigin: 'center bottom',
                }}
              >
                {(() => {
                  // Organize Opponent Cards
                  const oppLands = oppBattlefield.filter(c => c.types?.includes('Land') && !c.types?.includes('Creature'));
                  const oppCreatures = oppBattlefield.filter(c => !c.types?.includes('Land') || c.types?.includes('Creature'));

                  return (
                    <div className="w-full h-full flex flex-col justify-end pb-4">
                      {/* Back Row: Lands (Top) */}
                      <div className="flex justify-center items-end -space-x-8 mb-4 opacity-90 scale-90 origin-bottom">
                        {oppLands.map((card, idx) => (
                          <div key={card.instanceId} style={{ zIndex: idx }} className="pointer-events-auto">
                            <CardComponent
                              card={card}
                              viewMode="cutout"
                              className="w-20 h-20 rounded shadow-sm"
                              onDragStart={() => { }}
                              onClick={() => { }}
                              onMouseEnter={() => setHoveredCard(card)}
                              onMouseLeave={() => setHoveredCard(null)}
                            />
                          </div>
                        ))}
                        {oppLands.length === 0 && <div className="h-20" />}
                      </div>

                      {/* Front Row: Creatures (Bottom) */}
                      <div className="flex justify-center items-end gap-2 flex-wrap px-8">
                        {oppCreatures.map(card => {
                          const isAttacking = card.attacking === currentPlayerId; // They are attacking ME
                          const isBlockedByMe = Array.from(proposedBlockers.values()).includes(card.instanceId);

                          return (
                            <div
                              key={card.instanceId}
                              className="relative transition-all duration-300 ease-out pointer-events-auto"
                              style={{
                                transform: isAttacking ? 'translateY(40px) scale(1.1)' : 'none', // Attack moves "Forward" (Down)
                                zIndex: 10
                              }}
                            >
                              <CardComponent
                                card={card}
                                viewMode="cutout"
                                onMouseEnter={() => setHoveredCard(card)}
                                onMouseLeave={() => setHoveredCard(null)}
                                onDragStart={() => { }}
                                onClick={() => { }}
                                className={`
                                  w-24 h-24 rounded shadow-sm
                                  ${isAttacking ? "ring-4 ring-red-600 shadow-[0_0_20px_rgba(220,38,38,0.6)]" : ""}
                                  ${isBlockedByMe ? "ring-4 ring-blue-500" : ""}
                                `}
                              />
                              <DroppableZone id={card.instanceId} data={{ type: 'card' }} className="absolute inset-0 rounded-lg pointer-events-none" />

                              {isAttacking && (
                                <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-red-600 text-white text-[10px] font-bold px-2 py-0.5 rounded shadow z-20">
                                  ATTACKING
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
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
                  className="w-full h-full relative flex flex-col overflow-visible"
                  style={{
                    transform: 'rotateX(5deg)',
                    transformOrigin: 'center 40%',
                  }}
                >


                  {(() => {
                    // Separate Roots and Attachments
                    const attachments = myBattlefield.filter(c => c.attachedTo);
                    const unattached = myBattlefield.filter(c => !c.attachedTo);

                    const creatures = unattached.filter(c => c.types?.includes('Creature'));
                    const allLands = unattached.filter(c => c.types?.includes('Land') && !c.types?.includes('Creature'));
                    const others = unattached.filter(c => !c.types?.includes('Creature') && !c.types?.includes('Land'));

                    // Map Attachments to Hosts
                    const attachmentsMap = attachments.reduce((acc, c) => {
                      const target = c.attachedTo;
                      if (target) {
                        if (!acc[target]) acc[target] = [];
                        acc[target].push(c);
                      }
                      return acc;
                    }, {} as Record<string, CardInstance[]>);

                    const landGroups = allLands.reduce((acc, card) => {
                      const key = card.name || 'Unknown Land';
                      if (!acc[key]) acc[key] = [];
                      acc[key].push(card);
                      return acc;
                    }, {} as Record<string, CardInstance[]>);

                    const renderCard = (card: CardInstance) => {
                      const isAttacking = proposedAttackers.has(card.instanceId);
                      const blockingTargetId = proposedBlockers.get(card.instanceId);
                      const isPreviewTapped = previewTappedIds.has(card.instanceId);

                      const attachedCards = attachmentsMap[card.instanceId] || [];

                      return (
                        <div
                          key={card.instanceId}
                          className="relative transition-all duration-300 group"
                          style={{
                            zIndex: 10,
                            transform: isAttacking
                              ? 'translateY(-40px) scale(1.1) rotateX(10deg)'
                              : blockingTargetId
                                ? 'translateY(-20px) scale(1.05)'
                                : isPreviewTapped
                                  ? 'rotate(10deg)'  // Preview Tap Rotation
                                  : 'none',
                            boxShadow: isAttacking ? '0 20px 40px -10px rgba(239, 68, 68, 0.5)' : 'none',
                            opacity: isPreviewTapped ? 0.7 : 1 // Preview Tap Opacity
                          }}
                        >
                          <DraggableCardWrapper card={card} disabled={!hasPriority}>
                            {/* Render Attachments UNDER the card */}
                            {attachedCards.length > 0 && (
                              <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 flex flex-col items-center -space-y-16 hover:space-y-4 hover:bottom-[-200px] transition-all duration-300 z-[-1] hover:z-50">
                                {attachedCards.map((att, idx) => (
                                  <div key={att.instanceId} className="relative transition-transform hover:scale-110" style={{ zIndex: idx }}>
                                    <CardComponent
                                      card={att}
                                      viewMode="cutout"
                                      onClick={() => { }}
                                      onDragStart={() => { }}
                                      className="w-16 h-16 opacity-90 hover:opacity-100 shadow-md border border-slate-600 rounded"
                                    />
                                    {/* Allow dragging attachment off? Need separate Draggable wrapper for it OR handle logic */}
                                    {/* For now, just visual representation. Use main logic to drag OFF if needed, but nested dragging is complex.
                                                Ideally, we define DraggableCardWrapper around THIS too?
                                                GameView dnd uses ID. If we use DraggableCardWrapper here, it should work.
                                            */}
                                  </div>
                                ))}
                              </div>
                            )}

                            <CardComponent
                              card={card}
                              viewMode="cutout"
                              currentTurn={gameState.turnCount ?? gameState.turn}
                              onDragStart={() => { }}
                              onClick={(id) => {
                                if (gameState.step === 'declare_attackers') {
                                  // Attack declaration is special: It happens during the "Pause" where AP has priority but isn't passing yet.
                                  // We allow toggling attackers if it's our turn to attack.
                                  if (gameState.activePlayerId !== currentPlayerId) return;

                                  // Validate Creature Type
                                  const types = card.types || [];
                                  const typeLine = card.typeLine || '';
                                  if (!types.includes('Creature') && !typeLine.includes('Creature')) {
                                    return;
                                  }

                                  const hasHaste = card.keywords?.some((k: string) => k.toLowerCase() === 'haste') ||
                                    card.definition?.keywords?.some((k: string) => k.toLowerCase() === 'haste') ||
                                    card.oracleText?.toLowerCase().includes('haste');

                                  const currentT = gameState.turnCount ?? gameState.turn;
                                  const isSick = card.controlledSinceTurn === currentT && !hasHaste;

                                  if (isSick) {
                                    // TODO: Toast or Alert
                                    // alert(`${card.name} has Summoning Sickness!`);
                                    showGameToast(`${card.name} has Summoning Sickness!`, 'warning');
                                    return;
                                  }

                                  const newSet = new Set(proposedAttackers);
                                  if (newSet.has(id)) newSet.delete(id);
                                  else newSet.add(id);
                                  setProposedAttackers(newSet);
                                } else if (gameState.step === 'declare_blockers') {
                                  // BLOCKING LOGIC
                                  // Only Defending Player (NOT active player) can declare blockers
                                  if (gameState.activePlayerId === currentPlayerId) return;

                                  // Check eligibility (Untapped Creature)
                                  if (card.tapped) return;
                                  const types = card.types || [];
                                  if (!types.includes('Creature') && !card.typeLine?.includes('Creature')) return;

                                  // Find all Valid Attackers
                                  // Attackers are cards in opponent's control that are marked 'attacking'
                                  const attackers = Object.values(gameState.cards).filter(c =>
                                    c.controllerId !== currentPlayerId && c.attacking
                                  );

                                  if (attackers.length === 0) return; // Nothing to block

                                  const currentTargetId = proposedBlockers.get(id);
                                  const newMap = new Map(proposedBlockers);

                                  if (!currentTargetId) {
                                    // Not currently blocking -> Block the first attacker
                                    newMap.set(id, attackers[0].instanceId);
                                  } else {
                                    // Currently blocking -> Cycle to next attacker OR unblock if at end of list
                                    const currentIndex = attackers.findIndex(a => a.instanceId === currentTargetId);
                                    if (currentIndex === -1 || currentIndex === attackers.length - 1) {
                                      // Was blocking last one (or invalid), so Unblock
                                      newMap.delete(id);
                                    } else {
                                      // Cycle to next
                                      newMap.set(id, attackers[currentIndex + 1].instanceId);
                                    }
                                  }
                                  setProposedBlockers(newMap);

                                } else {
                                  // Regular Tap (Mana/Ability)
                                  if (!hasPriority) return;
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
                        <div className="flex-1 flex flex-wrap content-end justify-center items-end p-4 gap-2 relative z-10 w-full overflow-visible">
                          {creatures.length === 0 && (
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-0">
                            </div>
                          )}
                          {creatures.map(renderCard)}
                        </div>
                        <div className="min-h-[120px] flex flex-wrap content-center justify-center items-center p-2 gap-2 relative z-0 w-full overflow-visible">
                          {others.length > 0 ? others.map(renderCard) : (
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-0">
                            </div>
                          )}
                        </div>
                        <div className="min-h-[120px] flex flex-wrap content-start justify-start items-start p-2 gap-1 relative z-0 w-full">
                          {allLands.length === 0 && (
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-10">
                              <span className="text-white text-xs font-bold uppercase tracking-widest">Lands</span>
                            </div>
                          )}
                          {Object.entries(landGroups).map(([name, group]) => (
                            <div
                              key={name}
                              className="relative w-24 transition-all duration-300"
                              style={{
                                height: `${96 + (group.length - 1) * 25}px`, // 96px base + 25px offset per card
                                marginBottom: '0.5rem'
                              }}
                            >
                              {group.map((card, index) => (
                                <div
                                  key={card.instanceId}
                                  className="absolute left-0 w-full"
                                  style={{
                                    top: `${index * 25}px`,
                                    zIndex: index
                                  }}
                                >
                                  {renderCard(card)}
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                      </>
                    );
                  })()}
                </div>
              </GestureManager>
            </div>
          </DroppableZone>

          {/* New Phase Control Bar - Between Battlefield and Hand */}
          <div className="w-full z-30 bg-black border-y border-white/10 flex justify-center shrink-0 relative shadow-2xl">
            <PhaseStrip
              gameState={gameState}
              currentPlayerId={currentPlayerId}
              onAction={(type: string, payload: any) => socketService.socket.emit(type, { action: payload })}
              contextData={{
                attackers: Array.from(proposedAttackers).map(id => ({ attackerId: id, targetId: opponentId })),
                blockers: Array.from(proposedBlockers.entries()).map(([blockerId, attackerId]) => ({ blockerId, attackerId }))
              }}
              isYielding={isYielding}
              onYieldToggle={() => setIsYielding(!isYielding)}
              stopRequested={stopRequested}
              onToggleSuspend={onToggleSuspend}
            />
          </div>

          {/* Bottom Area: Controls & Hand */}
          <div className="h-64 relative z-20 flex bg-gradient-to-t from-black to-slate-900/80 backdrop-blur-md shadow-[0_-5px_20px_rgba(0,0,0,0.5)]">

            {/* Left Controls: Library/Grave/Exile */}
            <div className="w-40 p-2 flex flex-col gap-2 items-center justify-start pt-6 border-r border-white/10">
              {/* Phase Strip Moved to Bottom Center */}


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

              <DroppableZone id="exile" data={{ type: 'zone' }} className="w-full text-center border-t border-white/10 mt-2 pt-2 cursor-pointer hover:bg-white/5 rounded p-1">
                <div onContextMenu={(e) => handleContextMenu(e, 'zone', undefined, 'exile')}>
                  <span className="text-xs text-slate-500 block">Exile</span>
                  <span className="text-lg font-bold text-slate-400">{myExile.length}</span>
                </div>
              </DroppableZone>
            </div>

            {/* Hand Area & Smart Button */}
            <div className="flex-1 relative flex flex-col items-center justify-end px-4 pb-2">
              <DroppableZone id="hand" data={{ type: 'zone' }} className="flex-1 w-full h-full flex flex-col justify-end">




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
                      <DraggableCardWrapper card={card} disabled={!hasPriority}>
                        <CardComponent
                          card={card}
                          viewMode="normal"
                          onDragStart={() => { }}
                          onDragEnd={() => { }}
                          onClick={() => setInspectedCard(card)}
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
            <div className="w-52 p-2 flex flex-col gap-2 items-center justify-between border-l border-white/10 py-2">
              <div className="text-center w-full relative">
                <button
                  className="absolute top-0 right-0 p-1 text-slate-600 hover:text-white transition-colors"
                  title="Restart Game (Dev)"
                  onClick={async () => {
                    if (await confirm({
                      title: 'Restart Game?',
                      message: 'Are you sure you want to restart the game? The deck will remain, but the game state will reset.',
                      confirmLabel: 'Restart',
                      type: 'warning'
                    })) {
                      socketService.socket.emit('game_action', { action: { type: 'RESTART_GAME' } });
                    }
                  }}
                >
                  <RotateCcw className="w-3 h-3" />
                </button>

                <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">Your Life</div>
                <div className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-b from-emerald-400 to-emerald-700 drop-shadow-[0_2px_10px_rgba(16,185,129,0.3)]">
                  {myPlayer?.life}
                </div>
                <div className="flex gap-1 mt-1 justify-center">
                  <button
                    className="w-6 h-6 rounded-full bg-slate-800 hover:bg-red-500/20 text-red-500 border border-slate-700 hover:border-red-500 transition-colors flex items-center justify-center font-bold"
                    onClick={() => socketService.socket.emit('game_action', { action: { type: 'UPDATE_LIFE', amount: -1 } })}
                  >
                    -
                  </button>
                  <button
                    className="w-6 h-6 rounded-full bg-slate-800 hover:bg-emerald-500/20 text-emerald-500 border border-slate-700 hover:border-emerald-500 transition-colors flex items-center justify-center font-bold"
                    onClick={() => socketService.socket.emit('game_action', { action: { type: 'UPDATE_LIFE', amount: 1 } })}
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Mana Pool Display */}
              {/* Mana Pool Display */}
              <div className="w-full bg-slate-800/50 rounded-lg p-2 grid grid-cols-3 gap-x-1 gap-y-1 border border-white/5">
                {['W', 'U', 'B', 'R', 'G', 'C'].map(color => {
                  const count = myPlayer?.manaPool?.[color] || 0;
                  // Use ManaIcon instead of emojis
                  return (
                    <div key={color} className="flex flex-col items-center">
                      <div className={`text-xs font-bold flex items-center gap-1`}>
                        <ManaIcon symbol={color.toLowerCase()} size="lg" shadow />
                      </div>

                      <div className="flex items-center gap-1 mt-1">
                        <button
                          className="w-4 h-4 flex items-center justify-center rounded bg-slate-700 hover:bg-red-900/50 text-red-500 text-[10px] disabled:opacity-30 disabled:hover:bg-slate-700"
                          onClick={() => socketService.socket.emit('game_strict_action', { action: { type: 'ADD_MANA', mana: { color, amount: -1 } } })}
                          disabled={count <= 0}
                        >
                          -
                        </button>
                        <span className={`text-sm font-mono w-4 text-center ${count > 0 ? 'text-white font-bold' : 'text-slate-500'}`}>
                          {count}
                        </span>
                        <button
                          className="w-4 h-4 flex items-center justify-center rounded bg-slate-700 hover:bg-emerald-900/50 text-emerald-500 text-[10px] hover:text-emerald-400"
                          onClick={() => socketService.socket.emit('game_strict_action', { action: { type: 'ADD_MANA', mana: { color, amount: 1 } } })}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

            </div>

          </div>
        </div>
        <DragOverlay dropAnimation={{ duration: 0, easing: 'linear' }}>
          {activeDragId ? (
            <div className="pointer-events-none z-[1000] drop-shadow-[0_20px_50px_rgba(0,0,0,0.5)] scale-110 -rotate-6 transition-transform">
              {(() => {
                const c = gameState.cards[activeDragId];
                if (!c) return null;

                // If coming from hand, we animate from Large to Cutout
                // If start, use 'large' (matches hand size approximately, but we ignore margins)
                // If end, use 'cutout'
                const isHandOrigin = c.zone === 'hand';
                const effectiveViewMode = (isHandOrigin && dragAnimationMode === 'start') ? 'large' : 'cutout';

                return (
                  <CardComponent
                    card={c}
                    viewMode={effectiveViewMode}
                    ignoreZoneLayout={true}
                    onDragStart={() => { }}
                    onClick={() => { }}
                    className="rounded-lg shadow-2xl ring-2 ring-white/50"
                  />
                );
              })()}
            </div>
          ) : null}
        </DragOverlay>
      </div>
    </DndContext>
  );
};
