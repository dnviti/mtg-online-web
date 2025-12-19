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

  // Robustly resolve Art Crop
  // Robustly resolve Art Crop
  // Robustly resolve Art Crop
  let imageSrc = card.imageUrl;

  if (card.image_uris) {
    if (viewMode === 'cutout' && card.image_uris.crop) {
      imageSrc = card.image_uris.crop;
    } else if (card.image_uris.normal) {
      imageSrc = card.image_uris.normal;
    }
  } else if (card.definition && card.definition.set && card.definition.id) {
    if (viewMode === 'cutout') {
      imageSrc = `/cards/images/${card.definition.set}/crop/${card.definition.id}.jpg`;
    } else {
      imageSrc = `/cards/images/${card.definition.set}/full/${card.definition.id}.jpg`;
    }
  } else if (viewMode === 'cutout' && card.definition) {
    if (card.definition.image_uris?.art_crop) {
      imageSrc = card.definition.image_uris.art_crop;
    } else if (card.definition.card_faces?.[0]?.image_uris?.art_crop) {
      imageSrc = card.definition.card_faces[0].image_uris.art_crop;
    }
  }

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
      <div className="w-full h-full relative overflow-hidden rounded-lg bg-slate-800 border-2 border-slate-700">
        {!card.faceDown ? (
          <img
            src={imageSrc}
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
