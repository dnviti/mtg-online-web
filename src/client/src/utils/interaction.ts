import { useRef, useCallback } from 'react';

/**
 * Hook to handle touch interactions for cards (Long Press for Preview).
 * - Tap: Click
 * - Long Press: Preview (Hover)
 * - Drag/Scroll: Cancel
 */
export function useCardTouch(
  onHover: (card: any | null) => void,
  onClick: () => void,
  cardPayload: any
) {
  const timerRef = useRef<any>(null);
  const isLongPress = useRef(false);

  const handleTouchStart = useCallback(() => {
    isLongPress.current = false;
    timerRef.current = setTimeout(() => {
      isLongPress.current = true;
      onHover(cardPayload);
    }, 400); // 400ms threshold
  }, [onHover, cardPayload]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (timerRef.current) clearTimeout(timerRef.current);

    if (isLongPress.current) {
      if (e.cancelable) e.preventDefault();
      onHover(null); // Clear preview on release, mimicking "hover out"
    }
  }, [onHover]);

  const handleTouchMove = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      // If we were already previewing? 
      // If user moves finger while holding, maybe we should effectively cancel the "click" potential too?
      // Usually moving means scrolling.
      isLongPress.current = false; // ensure we validly cancel any queued longpress action
    }
  }, []);

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (isLongPress.current) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    onClick();
  }, [onClick]);

  return {
    onTouchStart: handleTouchStart,
    onTouchEnd: handleTouchEnd,
    onTouchMove: handleTouchMove,
    onClick: handleClick
  };
}
