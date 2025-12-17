import React, { useState, useEffect, useRef } from 'react';
import { DraftCard } from '../services/PackGeneratorService';

// --- Floating Preview Component ---
export const FoilOverlay = () => (
  <div className="absolute inset-0 z-20 pointer-events-none rounded-xl overflow-hidden">
    {/* CSS-based Holographic Pattern */}
    <div className="absolute inset-0 foil-holo" />

    {/* Gaussian Circular Glare - Spinning Radial Gradient (Mildly visible) */}
    <div className="absolute inset-[-50%] bg-[radial-gradient(circle_at_50%_50%,_rgba(255,255,255,0.25)_0%,_transparent_60%)] mix-blend-overlay opacity-25 animate-spin-slow" />
  </div>
);

export const FloatingPreview: React.FC<{ card: DraftCard; x: number; y: number; isMobile?: boolean; isClosing?: boolean }> = ({ card, x, y, isMobile, isClosing }) => {
  // Cast finishes to any to allow loose string matching if needed, or just standard check
  const isFoil = (card.finish as string) === 'foil' || (card.finish as string) === 'etched';
  const imgRef = useRef<HTMLImageElement>(null);

  // Basic boundary detection
  const [adjustedPos, setAdjustedPos] = useState({ top: y, left: x });
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    // Trigger entrance animation
    requestAnimationFrame(() => setIsMounted(true));
  }, []);

  const isActive = isMounted && !isClosing;

  useEffect(() => {
    if (isMobile) return;

    const OFFSET = 20;
    const CARD_WIDTH = 300;
    const CARD_HEIGHT = 420;

    let newX = x + OFFSET;
    let newY = y + OFFSET;

    if (newX + CARD_WIDTH > window.innerWidth) {
      newX = x - CARD_WIDTH - OFFSET;
    }

    if (newY + CARD_HEIGHT > window.innerHeight) {
      newY = y - CARD_HEIGHT - OFFSET;
    }

    setAdjustedPos({ top: newY, left: newX });

  }, [x, y, isMobile]);

  if (isMobile) {
    return (
      <div className={`fixed inset-0 z-[9999] pointer-events-none flex items-center justify-center bg-black/60 backdrop-blur-[2px] transition-all duration-300 ease-in-out ${isActive ? 'opacity-100' : 'opacity-0'}`}>
        <div className={`relative w-[85vw] max-w-sm rounded-2xl overflow-hidden shadow-2xl ring-4 ring-black/50 transition-all duration-300 ${isActive ? 'scale-100 opacity-100 ease-out' : 'scale-95 opacity-0 ease-in'}`}>
          <img src={card.image} alt={card.name} className="w-full h-auto" />
          {/* Universal mild brightening overlay */}
          <div className="absolute inset-0 bg-white/10 pointer-events-none mix-blend-overlay" />
          {isFoil && <FoilOverlay />}
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed z-[9999] pointer-events-none"
      style={{
        top: adjustedPos.top,
        left: adjustedPos.left
      }}
    >
      <div className={`relative w-[300px] rounded-xl overflow-hidden shadow-2xl border-4 border-slate-900 bg-black transition-all duration-300 ${isActive ? 'scale-100 opacity-100 ease-out' : 'scale-95 opacity-0 ease-in'}`}>
        <img ref={imgRef} src={card.image} alt={card.name} className="w-full h-auto" />
        {/* Universal mild brightening overlay */}
        <div className="absolute inset-0 bg-white/10 pointer-events-none mix-blend-overlay" />
        {/* CSS-based Holographic Pattern & Glare */}
        {isFoil && <FoilOverlay />}
      </div>
    </div>
  );
};

// --- Hover Wrapper to handle mouse events ---
export const CardHoverWrapper: React.FC<{ card: DraftCard; children: React.ReactNode; className?: string; preventPreview?: boolean }> = ({ card, children, className, preventPreview }) => {
  const [isHovering, setIsHovering] = useState(false);
  const [isLongPressing, setIsLongPressing] = useState(false);
  const [renderPreview, setRenderPreview] = useState(false);
  const [coords, setCoords] = useState({ x: 0, y: 0 });

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const initialTouchRef = useRef<{ x: number, y: number } | null>(null);
  const closeTimerRef = useRef<NodeJS.Timeout | null>(null);

  const hasImage = !!card.image;
  // Use a stable value for isMobile to avoid hydration mismatches if using SSR, 
  // but since this is client-side mostly, window check is okay.
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 1024;

  const shouldShow = (isHovering && !isMobile) || isLongPressing;

  // Handle mounting/unmounting animation
  useEffect(() => {
    if (shouldShow) {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
      setRenderPreview(true);
    } else {
      // Delay unmount for animation (all devices)
      if (renderPreview) {
        closeTimerRef.current = setTimeout(() => {
          setRenderPreview(false);
        }, 300); // 300ms matches duration-300
      } else {
        setRenderPreview(false);
      }
    }
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, [shouldShow, isMobile, renderPreview]);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!hasImage || isMobile) return;
    setCoords({ x: e.clientX, y: e.clientY });
  };

  const handleMouseEnter = (e: React.MouseEvent) => {
    if (isMobile) return;
    if (preventPreview) return;

    // Check if the card is already "big enough" on screen
    const rect = e.currentTarget.getBoundingClientRect();
    // Width > 200 && Height > 270 targets readable cards (Stack/Grid) but excludes list rows
    if (rect.width > 200 && rect.height > 270) {
      return;
    }

    setIsHovering(true);
  };

  const handleMouseLeave = () => {
    setIsHovering(false);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (!hasImage || !isMobile) return;
    const touch = e.touches[0];
    const { clientX, clientY } = touch;

    initialTouchRef.current = { x: clientX, y: clientY };
    setCoords({ x: clientX, y: clientY });

    timerRef.current = setTimeout(() => {
      setIsLongPressing(true);
    }, 500);
  };

  const handleTouchEnd = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setIsLongPressing(false);
    initialTouchRef.current = null;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!initialTouchRef.current) return;

    const touch = e.touches[0];
    const moveX = Math.abs(touch.clientX - initialTouchRef.current.x);
    const moveY = Math.abs(touch.clientY - initialTouchRef.current.y);

    // Cancel if moved more than 10px
    if (moveX > 10 || moveY > 10) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      // Do not close if already long pressing
    }
  };

  return (
    <div
      className={className}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onMouseMove={handleMouseMove}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchMove={handleTouchMove}
      onContextMenu={(e) => {
        // Prevent context menu to allow long-press preview without browser menu
        // We block it if we are on mobile (trying to open preview) 
        // OR if we are already in long-press state.
        if ((isMobile && hasImage) || isLongPressing) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
    >
      {children}
      {hasImage && renderPreview && (
        <FloatingPreview
          card={card}
          x={coords.x}
          y={coords.y}
          isMobile={isMobile}
          isClosing={!shouldShow}
        />
      )}
    </div>
  );
};
