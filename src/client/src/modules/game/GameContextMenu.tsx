import React, { useEffect } from 'react';
import { CardInstance } from '../../types/game';

export interface ContextMenuRequest {
  x: number;
  y: number;
  type: 'background' | 'card' | 'zone';
  targetId?: string; // cardId or zoneName
  card?: CardInstance;
  zone?: string; // 'library', 'graveyard', 'exile', 'hand'
}

interface GameContextMenuProps {
  request: ContextMenuRequest | null;
  onClose: () => void;
  onAction: (action: string, payload?: any) => void;
}

export const GameContextMenu: React.FC<GameContextMenuProps> = ({ request, onClose, onAction }) => {

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
    top: Math.min(request.y, window.innerHeight - 300), // Prevent going off bottom
    left: Math.min(request.x, window.innerWidth - 224), // Prevent going off right (w-56 = 224px)
    zIndex: 9999,
  };

  // Prevent closing when clicking inside the menu
  const onMenuClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  const renderCardMenu = (card: CardInstance) => {
    const zone = card.zone;

    return (
      <>
        <div className="px-3 py-1 font-bold text-xs text-slate-500 uppercase tracking-widest border-b border-slate-800 mb-1 flex justify-between items-center">
          <span className="truncate max-w-[120px]">{card.name}</span>
          <span className="text-[10px] bg-slate-800 px-1 rounded text-slate-400 capitalize">{zone}</span>
        </div>

        {/* Hand Menu */}
        {zone === 'hand' && (
          <>
            <MenuItem label="Play (Battlefield)" onClick={() => handleAction('MOVE_CARD', { cardId: card.instanceId, toZone: 'battlefield', position: { x: 50, y: 50 } })} />
            <MenuItem label="Discard" onClick={() => handleAction('MOVE_CARD', { cardId: card.instanceId, toZone: 'graveyard' })} />
            <MenuItem label="Exile" onClick={() => handleAction('MOVE_CARD', { cardId: card.instanceId, toZone: 'exile' })} />
            <div className="h-px bg-slate-800 my-1 mx-2"></div>
            <MenuItem label="To Library (Top)" onClick={() => handleAction('MOVE_CARD', { cardId: card.instanceId, toZone: 'library', position: 'top' })} />
            <MenuItem label="To Library (Bottom)" onClick={() => handleAction('MOVE_CARD', { cardId: card.instanceId, toZone: 'library', position: 'bottom' })} />
          </>
        )}

        {/* Battlefield Menu */}
        {zone === 'battlefield' && (
          <>
            <MenuItem label="Tap / Untap" onClick={() => handleAction('TAP_CARD', { cardId: card.instanceId })} />
            <MenuItem label={card.faceDown ? "Flip Face Up" : "Flip Face Down"} onClick={() => handleAction('FLIP_CARD', { cardId: card.instanceId })} />

            <div className="relative group">
              <MenuItem label="Add Counter ▸" onClick={() => { }} />
              <div className="absolute left-full top-0 ml-1 w-40 bg-slate-900 border border-slate-700 rounded shadow-lg hidden group-hover:block z-50">
                <MenuItem label="+1/+1 Counter" onClick={() => handleAction('ADD_COUNTER', { cardId: card.instanceId, counterType: '+1/+1', amount: 1 })} />
                <MenuItem label="-1/-1 Counter" onClick={() => handleAction('ADD_COUNTER', { cardId: card.instanceId, counterType: '-1/-1', amount: 1 })} />
                <MenuItem label="Loyalty Counter" onClick={() => handleAction('ADD_COUNTER', { cardId: card.instanceId, counterType: 'loyalty', amount: 1 })} />
                <MenuItem label="Remove Counter" onClick={() => handleAction('ADD_COUNTER', { cardId: card.instanceId, counterType: '+1/+1', amount: -1 })} />
              </div>
            </div>

            <MenuItem label="Clone (Copy)" onClick={() => handleAction('CREATE_TOKEN', {
              tokenData: {
                name: `${card.name} (Copy)`,
                imageUrl: card.imageUrl,
                power: card.ptModification?.power,
                toughness: card.ptModification?.toughness
              },
              position: { x: (card.position.x || 50) + 2, y: (card.position.y || 50) + 2 }
            })} />

            <div className="h-px bg-slate-800 my-1 mx-2"></div>
            <MenuItem label="To Hand" onClick={() => handleAction('MOVE_CARD', { cardId: card.instanceId, toZone: 'hand' })} />
            <MenuItem label="Destroy (Grave)" onClick={() => handleAction('MOVE_CARD', { cardId: card.instanceId, toZone: 'graveyard' })} />
            <MenuItem label="Exile" onClick={() => handleAction('MOVE_CARD', { cardId: card.instanceId, toZone: 'exile' })} />
            <MenuItem label="To Library (Top)" onClick={() => handleAction('MOVE_CARD', { cardId: card.instanceId, toZone: 'library', position: 'top' })} />
          </>
        )}

        {/* Graveyard Menu */}
        {zone === 'graveyard' && (
          <>
            <MenuItem label="Exile" onClick={() => handleAction('MOVE_CARD', { cardId: card.instanceId, toZone: 'exile' })} />
            <MenuItem label="Return to Hand" onClick={() => handleAction('MOVE_CARD', { cardId: card.instanceId, toZone: 'hand' })} />
            <MenuItem label="Return to Battlefield" onClick={() => handleAction('MOVE_CARD', { cardId: card.instanceId, toZone: 'battlefield' })} />
            <MenuItem label="To Library (Bottom)" onClick={() => handleAction('MOVE_CARD', { cardId: card.instanceId, toZone: 'library', position: 'bottom' })} />
          </>
        )}

        {/* Exile Menu */}
        {zone === 'exile' && (
          <>
            <MenuItem label="Return to Graveyard" onClick={() => handleAction('MOVE_CARD', { cardId: card.instanceId, toZone: 'graveyard' })} />
            <MenuItem label="Return to Battlefield" onClick={() => handleAction('MOVE_CARD', { cardId: card.instanceId, toZone: 'battlefield' })} />
            <MenuItem label="Return to Hand" onClick={() => handleAction('MOVE_CARD', { cardId: card.instanceId, toZone: 'hand' })} />
          </>
        )}

        {/* Library Menu (if we ever show context menu for cards IN library view?) */}
        {zone === 'library' && (
          <>
            <MenuItem label="Draw" onClick={() => handleAction('MOVE_CARD', { cardId: card.instanceId, toZone: 'hand' })} />
          </>
        )}

        <div className="h-px bg-slate-800 my-1 mx-2"></div>
        <MenuItem
          label="Delete Object"
          className="text-red-500 hover:bg-red-900/30 hover:text-red-400"
          onClick={() => handleAction('DELETE_CARD', { cardId: card.instanceId })}
        />
      </>
    );
  };

  const renderZoneMenu = (zone: string) => {
    return (
      <>
        <div className="px-3 py-1 font-bold text-xs text-slate-500 uppercase tracking-widest border-b border-slate-800 mb-1">
          {zone} Zone
        </div>

        <MenuItem label={`View ${zone.charAt(0).toUpperCase() + zone.slice(1)}`} onClick={() => handleAction('VIEW_ZONE', { zone })} />

        {zone === 'library' && (
          <>
            <MenuItem label="Draw Card" onClick={() => handleAction('DRAW_CARD')} />
            <MenuItem label="Shuffle Library" onClick={() => handleAction('SHUFFLE_LIBRARY')} />
            <MenuItem label="Mill 1 Card" onClick={() => handleAction('MILL_CARD', { amount: 1 })} />
          </>
        )}

        {zone === 'graveyard' && (
          <>
            <MenuItem label="Exile All" onClick={() => handleAction('EXILE_GRAVEYARD')} />
            <MenuItem label="Shuffle Graveyard" onClick={() => handleAction('SHUFFLE_GRAVEYARD')} />
          </>
        )}

        {zone === 'exile' && (
          <>
            <MenuItem label="Shuffle Exile" onClick={() => handleAction('SHUFFLE_EXILE')} />
          </>
        )}
      </>
    );
  };

  return (
    <div
      style={style}
      className="bg-slate-900 border border-slate-700 shadow-2xl rounded-md w-56 flex flex-col py-1 text-sm text-slate-200 select-none animate-in fade-in zoom-in-95 duration-100"
      onClick={onMenuClick}
      onContextMenu={(e) => e.preventDefault()}
    >
      {request.type === 'card' && request.card && renderCardMenu(request.card)}

      {request.type === 'zone' && request.zone && renderZoneMenu(request.zone)}

      {request.type === 'background' && (
        <>
          <div className="px-3 py-1 font-bold text-xs text-slate-500 uppercase tracking-widest border-b border-slate-800 mb-1">
            Battlefield
          </div>
          <MenuItem
            label="Create Token (1/1)"
            onClick={() => handleAction('CREATE_TOKEN', {
              tokenData: { name: 'Soldier', power: 1, toughness: 1 },
              position: { x: (request.x / window.innerWidth) * 100, y: (request.y / window.innerHeight) * 100 }
            })}
          />
          <MenuItem
            label="Create Token (2/2)"
            onClick={() => handleAction('CREATE_TOKEN', {
              tokenData: { name: 'Zombie', power: 2, toughness: 2, imageUrl: 'https://cards.scryfall.io/large/front/b/d/bd4047a5-d14f-4d2d-9333-5c628dfca115.jpg' },
              position: { x: (request.x / window.innerWidth) * 100, y: (request.y / window.innerHeight) * 100 }
            })}
          />
          <MenuItem
            label="Create Treasure"
            onClick={() => handleAction('CREATE_TOKEN', {
              tokenData: { name: 'Treasure', power: 0, toughness: 0, imageUrl: 'https://cards.scryfall.io/large/front/2/7/2776c5b9-1d22-4a00-9988-294747734185.jpg' },
              position: { x: (request.x / window.innerWidth) * 100, y: (request.y / window.innerHeight) * 100 }
            })}
          />
          <div className="h-px bg-slate-800 my-1 mx-2"></div>
          <MenuItem label="Untap All My Permanents" onClick={() => handleAction('UNTAP_ALL')} />
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
