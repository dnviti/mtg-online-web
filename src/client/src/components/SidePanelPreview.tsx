import React, { forwardRef } from 'react';
import { CardVisual, VisualCard } from './CardVisual';
import { Eye, ChevronLeft } from 'lucide-react';
import { ManaIcon } from './ManaIcon';
import { formatOracleText } from '../utils/textUtils';
import { GameLogPanel } from './GameLogPanel';

interface SidePanelPreviewProps {
  card: VisualCard | null;
  width: number;
  isCollapsed: boolean;
  onToggleCollapse: (collapsed: boolean) => void;
  onResizeStart?: (e: React.MouseEvent | React.TouchEvent) => void;
  className?: string;
  children?: React.ReactNode;
  showLog?: boolean;
  onLogCardHover?: (card: VisualCard | null) => void;
}

export const SidePanelPreview = forwardRef<HTMLDivElement, SidePanelPreviewProps>(({
  card,
  width,
  isCollapsed,
  onToggleCollapse,
  onResizeStart,
  className,
  children,
  showLog = true,
  onLogCardHover,
}, ref) => {
  // If collapsed, render the collapsed strip
  if (isCollapsed) {
    return (
      <div ref={ref} className={`flex shrink-0 w-12 flex-col items-center py-4 bg-slate-900 border-r border-slate-800 z-30 gap-4 transition-all duration-300 ${className || ''}`}>
        <button
          onClick={() => onToggleCollapse(false)}
          className="p-3 rounded-xl transition-all duration-200 group relative text-slate-500 hover:text-purple-400 hover:bg-slate-800"
          title="Expand Preview"
        >
          <Eye className="w-6 h-6" />
          <span className="absolute left-full ml-3 top-1/2 -translate-y-1/2 bg-slate-800 text-white text-xs font-bold px-2 py-1 rounded shadow-xl opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none ring-1 ring-white/10 z-50">
            Card Preview
          </span>
        </button>
      </div>
    );
  }

  // Expanded View
  return (
    <div
      ref={ref}
      className={`flex shrink-0 flex-col items-center justify-start pt-4 border-r border-slate-800 bg-slate-900 z-30 p-4 relative group/sidebar shadow-2xl ${className || ''}`}
      style={{ width: width }}
    >
      {/* Collapse Button */}
      <button
        onClick={() => onToggleCollapse(true)}
        className="absolute top-2 right-2 p-1.5 bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg transition-colors z-20 opacity-0 group-hover/sidebar:opacity-100"
        title="Collapse Preview"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>

      {/* 3D Card Container */}
      <div className="w-full relative sticky top-4 flex flex-col h-full overflow-hidden">
        <div className="relative w-full aspect-[2.5/3.5] transition-all duration-300 ease-in-out shrink-0">
          <div
            className="relative w-full h-full"
            style={{
              transformStyle: 'preserve-3d',
              transform: card ? 'rotateY(0deg)' : 'rotateY(180deg)',
              transition: 'transform 0.6s cubic-bezier(0.4, 0.0, 0.2, 1)'
            }}
          >
            {/* Front Face */}
            <div
              className="absolute inset-0 w-full h-full bg-slate-900 rounded-xl"
              style={{ backfaceVisibility: 'hidden' }}
            >
              {card && (
                <CardVisual
                  card={card}
                  viewMode="normal"
                  className="w-full h-full rounded-xl shadow-2xl shadow-black ring-1 ring-white/10"
                // Pass specific foil prop if your card object uses different property keys or logic
                // VisualCard handles `card.finish` internally too
                />
              )}
            </div>

            {/* Back Face */}
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

        {/* Details Section */}
        {card && (
          <div className="mt-4 flex-1 overflow-y-auto px-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
            <h3 className="text-lg font-bold text-slate-200 leading-tight">{card.name}</h3>

            {/* Mana Cost */}
            {(card['manaCost'] || (card as any).mana_cost) && (
              <div className="mt-1 flex items-center text-slate-400">
                {((card['manaCost'] || (card as any).mana_cost) as string).match(/\{([^}]+)\}/g)?.map((s, i) => {
                  const sym = s.replace(/[{}]/g, '').toLowerCase().replace('/', '');
                  return <ManaIcon key={i} symbol={sym} shadow className="text-base mr-0.5" />;
                }) || <span className="font-mono">{card['manaCost'] || (card as any).mana_cost}</span>}
              </div>
            )}

            {/* Type Line */}
            {(card['typeLine'] || (card as any).type_line) && (
              <div className="text-xs text-emerald-400 uppercase tracking-wider font-bold mt-2 border-b border-white/10 pb-2 mb-3">
                {card['typeLine'] || (card as any).type_line}
              </div>
            )}

            {/* Oracle Text */}
            {(card['oracleText'] || (card as any).oracle_text) && (
              <div className="text-sm text-slate-300 text-left bg-slate-900/50 p-3 rounded-lg border border-slate-800 leading-relaxed shadow-inner">
                {formatOracleText(card['oracleText'] || (card as any).oracle_text)}
              </div>
            )}
          </div>
        )}
        {children}
      </div>

      {/* Resize Handle */}
      {onResizeStart && (
        <div
          className="absolute right-0 top-0 bottom-0 w-1 bg-transparent hover:bg-emerald-500/50 cursor-col-resize z-50 flex flex-col justify-center items-center group transition-colors touch-none"
          onMouseDown={onResizeStart}
          onTouchStart={onResizeStart}
        >
          <div className="h-8 w-1 bg-slate-700/50 rounded-full group-hover:bg-emerald-400 transition-colors" />
        </div>
      )}


      {/* Game Action Log - Fixed at bottom */}
      {showLog && (
        <GameLogPanel
          className="w-full shrink-0 border-t border-slate-800"
          maxHeight="30%"
          onCardHover={onLogCardHover ? (card) => {
            if (card) {
              // Convert CardReference to VisualCard format for the preview
              onLogCardHover({
                name: card.name,
                imageUrl: card.imageUrl || card.imageArtCrop || '',
                imageArtCrop: card.imageArtCrop,
                manaCost: card.manaCost,
                typeLine: card.typeLine,
                oracleText: card.oracleText,
              } as VisualCard);
            } else {
              onLogCardHover(null);
            }
          } : undefined}
        />
      )}
    </div>
  );
});

SidePanelPreview.displayName = 'SidePanelPreview';
