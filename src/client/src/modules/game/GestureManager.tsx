
import React, { createContext, useContext, useRef, useState } from 'react';

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
  onGesture?: (type: 'TAP' | 'ATTACK' | 'CANCEL', cardIds: string[]) => void;
}

export const GestureManager: React.FC<GestureManagerProps> = ({ children, onGesture }) => {
  const cardRefs = useRef<Map<string, HTMLElement>>(new Map());
  const [gesturePath, setGesturePath] = useState<{ x: number, y: number }[]>([]);
  const isGesturing = useRef(false);

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
    analyzeGesture(gesturePath);

    setGesturePath([]);
    (e.target as Element).releasePointerCapture(e.pointerId);
  };

  const analyzeGesture = (path: { x: number, y: number }[]) => {
    if (path.length < 5) return; // Too short

    const start = path[0];
    const end = path[path.length - 1];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    let gestureType: 'TAP' | 'ATTACK' | 'CANCEL' = 'TAP';

    // If vertical movement is dominant and significant
    if (absDy > absDx && absDy > 50) {
      if (dy < 0) gestureType = 'ATTACK'; // Swipe Up
      else gestureType = 'CANCEL'; // Swipe Down
    } else {
      gestureType = 'TAP'; // Horizontal / Slash
    }

    // Find Logic
    const intersectedCards = new Set<string>();

    // Bounding Box Optimization
    const minX = Math.min(start.x, end.x);
    const maxX = Math.max(start.x, end.x);
    const minY = Math.min(start.y, end.y);
    const maxY = Math.max(start.y, end.y);

    cardRefs.current.forEach((el, id) => {
      const rect = el.getBoundingClientRect();

      // Rough Intersection of Line Segment
      // Check if rect intersects with bbox of path first
      if (rect.right < minX || rect.left > maxX || rect.bottom < minY || rect.top > maxY) return;

      // Check points (Simpler)
      for (let i = 0; i < path.length; i += 2) { // Skip some points for perf
        const p = path[i];
        if (p.x >= rect.left && p.x <= rect.right && p.y >= rect.top && p.y <= rect.bottom) {
          intersectedCards.add(id);
          break;
        }
      }
    });

    if (intersectedCards.size > 0 && onGesture) {
      onGesture(gestureType, Array.from(intersectedCards));
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
