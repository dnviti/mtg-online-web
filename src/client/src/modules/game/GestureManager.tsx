
import React, { createContext, useContext, useRef, useState, useEffect } from 'react';
import { socketService } from '../../services/SocketService';

interface GestureContextType {
  registerCard: (id: string, element: HTMLElement) => void;
  unregisterCard: (id: string) => void;
}

const GestureContext = createContext<GestureContextType>({
  registerCard: () => { },
  unregisterCard: () => { },
});

export const useGesture = () => useContext(GestureContext);

interface GestureManagerProps {
  children: React.ReactNode;
}

export const GestureManager: React.FC<GestureManagerProps> = ({ children }) => {
  const cardRefs = useRef<Map<string, HTMLElement>>(new Map());
  const [gesturePath, setGesturePath] = useState<{ x: number, y: number }[]>([]);
  const isGesturing = useRef(false);
  const startPoint = useRef<{ x: number, y: number } | null>(null);

  const registerCard = (id: string, element: HTMLElement) => {
    cardRefs.current.set(id, element);
  };

  const unregisterCard = (id: string) => {
    cardRefs.current.delete(id);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    // Only start gesture if clicking on background or specific handle?
    // For now, let's assume Right Click or Middle Drag is Gesture Mode?
    // Or just "Drag on Background".
    // If e.target is a card, usually DnD handles it. 
    // We check if event target is NOT a card.

    // Simplification: Check if Shift Key is held for Gesture Mode?
    // Or just native touch swipe.

    // Let's rely on event propagation. If card didn't stopPropagation, maybe background catches it.
    // Assuming GameView wrapper catches this.

    isGesturing.current = true;
    startPoint.current = { x: e.clientX, y: e.clientY };
    setGesturePath([{ x: e.clientX, y: e.clientY }]);

    // Capture pointer
    (e.target as Element).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!isGesturing.current) return;

    setGesturePath(prev => [...prev, { x: e.clientX, y: e.clientY }]);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!isGesturing.current) return;
    isGesturing.current = false;

    // Analyze Path for "Slash" (Swipe to Tap)
    // Check intersection with cards
    handleSwipeToTap();

    setGesturePath([]);
    (e.target as Element).releasePointerCapture(e.pointerId);
  };

  const handleSwipeToTap = () => {
    // Bounding box of path?
    // Simple: Check which cards intersect with the path line segments.
    // Optimization: Just check if path points are inside card rects.

    const intersectedCards = new Set<string>();

    const path = gesturePath;
    if (path.length < 2) return; // Too short

    // Check every card
    cardRefs.current.forEach((el, id) => {
      const rect = el.getBoundingClientRect();

      // Simple hit test: Does any point in path fall in rect?
      // Better: Line intersection.
      // For MVP: Check points.
      for (const p of path) {
        if (p.x >= rect.left && p.x <= rect.right && p.y >= rect.top && p.y <= rect.bottom) {
          intersectedCards.add(id);
          break; // Found hit
        }
      }
    });

    // If we hit cards, toggle tap
    if (intersectedCards.size > 0) {
      intersectedCards.forEach(id => {
        socketService.socket.emit('game_action', {
          action: { type: 'TAP_CARD', cardId: id }
        });
      });
    }
  };

  return (
    <GestureContext.Provider value={{ registerCard, unregisterCard }}>
      <div
        className="relative w-full h-full touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        {children}

        {/* SVG Overlay for Path */}
        {gesturePath.length > 0 && (
          <svg className="absolute inset-0 pointer-events-none z-50 overflow-visible">
            <polyline
              points={gesturePath.map(p => `${p.x},${p.y}`).join(' ')}
              fill="none"
              stroke="cyan"
              strokeWidth="4"
              strokeLinecap="round"
              strokeOpacity="0.6"
              className="drop-shadow-[0_0_10px_rgba(0,255,255,0.8)]"
            />
          </svg>
        )}
      </div>
    </GestureContext.Provider>
  );
};
