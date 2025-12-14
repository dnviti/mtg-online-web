import React, { useEffect, useState } from 'react';
import { CardInstance } from '../../types/game';

interface ContextMenuRequest {
  x: number;
  y: number;
  type: 'background' | 'card';
  targetId?: string;
  card?: CardInstance;
}

interface GameContextMenuProps {
  request: ContextMenuRequest | null;
  onClose: () => void;
  onAction: (action: string, payload?: any) => void;
}

export const GameContextMenu: React.FC<GameContextMenuProps> = ({ request, onClose, onAction }) => {
  const [submenu, setSubmenu] = useState<string | null>(null);

  useEffect(() => {
    const handleClickOutside = () => onClose();
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, [onClose]);

  if (!request) return null;

  const handleAction = (action: string, payload?: any) => {
    onAction(action, payload);
    onClose();
  };

  const style: React.CSSProperties = {
    position: 'fixed',
    top: request.y,
    left: request.x,
    zIndex: 9999, // Ensure it's above everything
  };

  // Prevent closing when clicking inside the menu
  const onMenuClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  return (
    <div
      style={style}
      className="bg-slate-900 border border-slate-700 shadow-2xl rounded-md w-56 flex flex-col py-1 text-sm text-slate-200 select-none animate-in fade-in zoom-in-95 duration-100"
      onClick={onMenuClick}
      onContextMenu={(e) => e.preventDefault()}
    >
      {request.type === 'card' && request.card && (
        <>
          <div className="px-3 py-1 font-bold text-xs text-slate-500 uppercase tracking-widest border-b border-slate-800 mb-1">
            {request.card.name}
          </div>
          <MenuItem label="Tap / Untap" onClick={() => handleAction('TAP_CARD', { cardId: request.targetId })} />
          <MenuItem label={request.card.faceDown ? "Flip Face Up" : "Flip Face Down"} onClick={() => handleAction('FLIP_CARD', { cardId: request.targetId })} />

          <div className="relative group">
            <MenuItem label="Add Counter ▸" onClick={() => { }} onMouseEnter={() => setSubmenu('counter')} />
            {/* Submenu */}
            <div className="absolute left-full top-0 ml-1 w-40 bg-slate-900 border border-slate-700 rounded shadow-lg hidden group-hover:block">
              <MenuItem label="+1/+1 Counter" onClick={() => handleAction('ADD_COUNTER', { cardId: request.targetId, counterType: '+1/+1', amount: 1 })} />
              <MenuItem label="-1/-1 Counter" onClick={() => handleAction('ADD_COUNTER', { cardId: request.targetId, counterType: '-1/-1', amount: 1 })} />
              <MenuItem label="Loyalty Counter" onClick={() => handleAction('ADD_COUNTER', { cardId: request.targetId, counterType: 'loyalty', amount: 1 })} />
              <MenuItem label="Remove Counter" onClick={() => handleAction('ADD_COUNTER', { cardId: request.targetId, counterType: '+1/+1', amount: -1 })} />
            </div>
          </div>

          <MenuItem label="Clone (Copy)" onClick={() => handleAction('CREATE_TOKEN', {
            tokenData: {
              name: `${request.card?.name} (Copy)`,
              imageUrl: request.card?.imageUrl,
              power: request.card?.ptModification?.power,
              toughness: request.card?.ptModification?.toughness
            },
            position: { x: (request.card?.position.x || 50) + 2, y: (request.card?.position.y || 50) + 2 }
          })} />

          <div className="h-px bg-slate-800 my-1 mx-2"></div>

          <MenuItem
            label="Delete Object"
            className="text-red-500 hover:bg-red-900/30 hover:text-red-400"
            onClick={() => handleAction('DELETE_CARD', { cardId: request.targetId })}
          />
        </>
      )}

      {request.type === 'background' && (
        <>
          <div className="px-3 py-1 font-bold text-xs text-slate-500 uppercase tracking-widest border-b border-slate-800 mb-1">
            Battlefield
          </div>
          <MenuItem
            label="Create Token (1/1)"
            onClick={() => handleAction('CREATE_TOKEN', {
              tokenData: { name: 'Soldier', power: 1, toughness: 1 },
              // Convert click position to approximate percent if possible or center
              // For now, simpler to spawn at center or random.
              position: { x: Math.random() * 40 + 30, y: Math.random() * 40 + 30 }
            })}
          />
          <MenuItem
            label="Create Token (2/2)"
            onClick={() => handleAction('CREATE_TOKEN', {
              tokenData: { name: 'Zombie', power: 2, toughness: 2, imageUrl: 'https://cards.scryfall.io/large/front/b/d/bd4047a5-d14f-4d2d-9333-5c628dfca115.jpg' },
              position: { x: Math.random() * 40 + 30, y: Math.random() * 40 + 30 }
            })}
          />
          <MenuItem
            label="Create Treasure"
            onClick={() => handleAction('CREATE_TOKEN', {
              tokenData: { name: 'Treasure', power: 0, toughness: 0, imageUrl: 'https://cards.scryfall.io/large/front/2/7/2776c5b9-1d22-4a00-9988-294747734185.jpg' },
              position: { x: Math.random() * 40 + 30, y: Math.random() * 40 + 30 }
            })}
          />
        </>
      )}
    </div>
  );
};

const MenuItem: React.FC<{ label: string; onClick: () => void; className?: string; onMouseEnter?: () => void }> = ({ label, onClick, className = '', onMouseEnter }) => (
  <div
    className={`px-4 py-2 hover:bg-emerald-600/20 hover:text-emerald-300 cursor-pointer transition-colors ${className}`}
    onClick={onClick}
    onMouseEnter={onMouseEnter}
  >
    {label}
  </div>
);
