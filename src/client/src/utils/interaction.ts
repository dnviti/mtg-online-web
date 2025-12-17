import { useRef, useCallback } from 'react';

/**
 * Hook to handle touch interactions for cards.
 * - Tap: Click (can be disabled by caller)
 * - 1-Finger Long Press: Drag (handled externally by dnd-kit usually, so we ignore here)
 * - 2-Finger Long Press: Preview (onHover)
 */
export function useCardTouch(
  onHover: (card: any | null) => void,
  onClick: () => void,
  cardPayload: any
) {
  const timerRef = useRef<any>(null);
  const isLongPress = useRef(false);
  const touchStartCount = useRef(0);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartCount.current = e.touches.length;
    isLongPress.current = false;

    // Only Start "Preview" Timer if 2 fingers
    if (e.touches.length === 2) {
      timerRef.current = setTimeout(() => {
        isLongPress.current = true;
        onHover(cardPayload);
      }, 400); // 400ms threshold
    }
  }, [onHover, cardPayload]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (timerRef.current) clearTimeout(timerRef.current);

    // If it was a 2-finger long press, clear hover on release
    if (isLongPress.current) {
      if (e.cancelable) e.preventDefault();
      onHover(null);
      isLongPress.current = false;
      return;
    }
  }, [onHover]);

  const handleTouchMove = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      isLongPress.current = false;
    }
  }, []);

  const handleClick = useCallback((e: React.MouseEvent) => {
    // If it was a long press, block click
    if (isLongPress.current) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    // Simple click
    onClick();
  }, [onClick]);

  return {
    onTouchStart: handleTouchStart,
    onTouchEnd: handleTouchEnd,
    onTouchMove: handleTouchMove,
    onClick: handleClick
  };
}
