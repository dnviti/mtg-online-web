import React from 'react';
import { CardInstance } from '../../types/game';
import { useGesture } from './GestureManager';
import { useRef, useEffect } from 'react';
import { CardVisual } from '../../components/CardVisual';

interface CardComponentProps {
  card: CardInstance;
  onDragStart: (e: React.DragEvent, cardId: string) => void;
  onClick: (cardId: string) => void;
  onContextMenu?: (cardId: string, e: React.MouseEvent) => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onDrop?: (e: React.DragEvent, targetId: string) => void;
  onDrag?: (e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
  style?: React.CSSProperties;
  className?: string;
  viewMode?: 'normal' | 'cutout';
}

export const CardComponent: React.FC<CardComponentProps> = ({ card, onDragStart, onClick, onContextMenu, onMouseEnter, onMouseLeave, onDrop, onDrag, onDragEnd, style, className, viewMode = 'normal' }) => {
  const { registerCard, unregisterCard } = useGesture();
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (cardRef.current) {
      registerCard(card.instanceId, cardRef.current);
    }
    return () => unregisterCard(card.instanceId);
  }, [card.instanceId]);

  // Robustly resolve Image Source based on viewMode is now handled in CardVisual

  return (
    <div
      ref={cardRef}
      draggable
      onDragStart={(e) => onDragStart(e, card.instanceId)}
      onDrag={(e) => onDrag && onDrag(e)}
      onDragEnd={(e) => onDragEnd && onDragEnd(e)}
      onDrop={(e) => {
        if (onDrop) {
          e.stopPropagation(); // prevent background drop
          onDrop(e, card.instanceId);
        }
      }}
      onDragOver={(e) => {
        if (onDrop) e.preventDefault();
      }}
      onClick={() => onClick(card.instanceId)}
      onContextMenu={(e) => {
        if (onContextMenu) {
          e.preventDefault();
          onContextMenu(card.instanceId, e);
        }
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={`
        relative rounded-lg shadow-md cursor-pointer transition-transform hover:scale-105 select-none
        ${card.tapped ? 'rotate-45' : ''}
        ${card.zone === 'hand' ? 'w-32 h-44 -ml-12 first:ml-0 hover:z-10 hover:-translate-y-4' : 'w-24 h-32'}
        ${className || ''}
      `}
      style={style}
    >
      <div className="w-full h-full relative rounded-lg bg-slate-800 border-2 border-slate-700">
        <CardVisual
          card={card}
          viewMode={viewMode}
          className="w-full h-full rounded-lg"
        />



      </div>
    </div>
  );
};
