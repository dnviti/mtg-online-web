import React, { useState, useEffect, useRef } from 'react';
import { DraftCard } from '../services/PackGeneratorService';

// --- Floating Preview Component ---
export const FloatingPreview: React.FC<{ card: DraftCard; x: number; y: number }> = ({ card, x, y }) => {
  const isFoil = card.finish === 'foil';
  const imgRef = useRef<HTMLImageElement>(null);

  // Basic boundary detection
  const [adjustedPos, setAdjustedPos] = useState({ top: y, left: x });

  useEffect(() => {
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

  }, [x, y]);

  return (
    <div
      className="fixed z-[9999] pointer-events-none transition-opacity duration-75"
      style={{
        top: adjustedPos.top,
        left: adjustedPos.left
      }}
    >
      <div className="relative w-[300px] rounded-xl overflow-hidden shadow-2xl border-4 border-slate-900 bg-black">
        <img ref={imgRef} src={card.image} alt={card.name} className="w-full h-auto" />
        {isFoil && <div className="absolute inset-0 bg-gradient-to-br from-purple-500/20 to-blue-500/20 mix-blend-overlay animate-pulse"></div>}
      </div>
    </div>
  );
};

// --- Hover Wrapper to handle mouse events ---
export const CardHoverWrapper: React.FC<{ card: DraftCard; children: React.ReactNode; className?: string }> = ({ card, children, className }) => {
  const [isHovering, setIsHovering] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const hasImage = !!card.image;

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!hasImage) return;
    setMousePos({ x: e.clientX, y: e.clientY });
  };

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 1024; // Disable on tablet/mobile

  return (
    <div
      className={className}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      onMouseMove={handleMouseMove}
    >
      {children}
      {isHovering && hasImage && !isMobile && (
        <FloatingPreview card={card} x={mousePos.x} y={mousePos.y} />
      )}
    </div>
  );
};
