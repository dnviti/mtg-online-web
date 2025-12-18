import React from 'react';
import { CardInstance } from '../../types/game';
import { useGesture } from './GestureManager';
import { useRef, useEffect } from 'react';

interface CardComponentProps {
  card: CardInstance;
  onDragStart: (e: React.DragEvent, cardId: string) => void;
  onClick: (cardId: string) => void;
  onContextMenu?: (cardId: string, e: React.MouseEvent) => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  style?: React.CSSProperties;
}

export const CardComponent: React.FC<CardComponentProps> = ({ card, onDragStart, onClick, onContextMenu, onMouseEnter, onMouseLeave, style }) => {
  const { registerCard, unregisterCard } = useGesture();
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (cardRef.current) {
      registerCard(card.instanceId, cardRef.current);
    }
    return () => unregisterCard(card.instanceId);
  }, [card.instanceId]);

  return (
    <div
      ref={cardRef}
      draggable
      onDragStart={(e) => onDragStart(e, card.instanceId)}
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
        ${card.tapped ? 'rotate-90' : ''}
        ${card.zone === 'hand' ? 'w-32 h-44 -ml-12 first:ml-0 hover:z-10 hover:-translate-y-4' : 'w-24 h-32'}
      `}
      style={style}
    >
      <div className="w-full h-full relative overflow-hidden rounded-lg bg-slate-800 border-2 border-slate-700">
        {!card.faceDown ? (
          <img
            src={card.imageUrl}
            alt={card.name}
            className="w-full h-full object-cover"
            draggable={false}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-slate-900 bg-opacity-90 bg-[url('https://c1.scryfall.com/file/scryfall-card-backs/large/59/597b79b3-7d77-4261-871a-60dd17403388.jpg')] bg-cover">
          </div>
        )}

        {/* Counters / PowerToughness overlays can go here */}
        {(card.counters.length > 0) && (
          <div className="absolute top-1 right-1 bg-black/70 text-white text-xs px-1 rounded">
            {card.counters.map(c => c.count).reduce((a, b) => a + b, 0)}
          </div>
        )}
      </div>
    </div>
  );
};
