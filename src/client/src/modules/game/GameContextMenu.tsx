import React, { useEffect } from 'react';
import { ChevronRight } from 'lucide-react';
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

        {/* Command Zone Menu */}
        {zone === 'command' && (
          <>
            <MenuItem
              label={card.typeLine?.toLowerCase().includes('land') ? "Play Land" : "Cast Commander"}
              onClick={() => {
                const isLand = (card.types?.some(t => t.toLowerCase() === 'land')) ||
                  (card.typeLine?.toLowerCase().includes('land'));
                if (isLand) {
                  handleAction('PLAY_LAND', { cardId: card.instanceId });
                } else {
                  handleAction('CAST_SPELL', { cardId: card.instanceId, targets: [] });
                }
              }}
            />
            <div className="h-px bg-slate-800 my-1 mx-2"></div>
            <MenuItem label="To Hand" onClick={() => handleAction('MOVE_CARD', { cardId: card.instanceId, toZone: 'hand' })} />
            <MenuItem label="To Library (Top)" onClick={() => handleAction('MOVE_CARD', { cardId: card.instanceId, toZone: 'library', position: 'top' })} />
          </>
        )}

        {/* Hand Menu */}
        {zone === 'hand' && (
          <>
            <MenuItem label="Play (Battlefield)" onClick={() => handleAction('REQUEST_PLAY', { cardId: card.instanceId })} />
            <MenuItem label="Play Face Down" onClick={() => handleAction('MOVE_CARD', { cardId: card.instanceId, toZone: 'battlefield', faceDown: true })} />
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
              <MenuItem label="Counters" hasSubmenu />
              <div className="absolute left-full top-0 pl-1 hidden group-hover:block z-50 w-48">
                <div className="bg-slate-900 border border-slate-700 rounded shadow-lg max-h-96 overflow-y-auto">
                  <div className="px-3 py-1 font-bold text-xs text-slate-500 uppercase tracking-widest border-b border-slate-800 mb-1">
                    Counters
                  </div>
                  <MenuItem label="+1/+1 Counter" onClick={() => handleAction('ADD_COUNTER', { cardId: card.instanceId, counterType: '+1/+1', amount: 1 })} />
                  <MenuItem label="-1/-1 Counter" onClick={() => handleAction('ADD_COUNTER', { cardId: card.instanceId, counterType: '-1/-1', amount: 1 })} />
                  <MenuItem label="Loyalty Counter" onClick={() => handleAction('ADD_COUNTER', { cardId: card.instanceId, counterType: 'loyalty', amount: 1 })} />

                  {/* Remove Counter - only show if card has counters */}
                  {card.counters && card.counters.length > 0 && card.counters.some(c => c.count > 0) && (
                    <>
                      <div className="px-3 py-1 font-bold text-xs text-red-400 uppercase tracking-widest border-b border-slate-800 mt-2 mb-1">
                        Remove Counter
                      </div>
                      {card.counters.filter(c => c.count > 0).map((counter) => (
                        <MenuItem
                          key={counter.type}
                          label={`${counter.type} (${counter.count})`}
                          className="text-red-400 hover:bg-red-900/30 hover:text-red-300"
                          onClick={() => handleAction('ADD_COUNTER', { cardId: card.instanceId, counterType: counter.type, amount: -1 })}
                        />
                      ))}
                    </>
                  )}

                  <div className="px-3 py-1 font-bold text-xs text-emerald-400 uppercase tracking-widest border-b border-slate-800 mt-2 mb-1">
                    Abilities (Permanent)
                  </div>
                  <MenuItem label="Flying" onClick={() => handleAction('MODIFY_CARD', { cardId: card.instanceId, modification: { type: 'ability_grant', value: 'Flying' }, untilEndOfTurn: false })} />
                  <MenuItem label="Haste" onClick={() => handleAction('MODIFY_CARD', { cardId: card.instanceId, modification: { type: 'ability_grant', value: 'Haste' }, untilEndOfTurn: false })} />
                  <MenuItem label="Trample" onClick={() => handleAction('MODIFY_CARD', { cardId: card.instanceId, modification: { type: 'ability_grant', value: 'Trample' }, untilEndOfTurn: false })} />
                  <MenuItem label="Lifelink" onClick={() => handleAction('MODIFY_CARD', { cardId: card.instanceId, modification: { type: 'ability_grant', value: 'Lifelink' }, untilEndOfTurn: false })} />
                  <MenuItem label="Deathtouch" onClick={() => handleAction('MODIFY_CARD', { cardId: card.instanceId, modification: { type: 'ability_grant', value: 'Deathtouch' }, untilEndOfTurn: false })} />
                  <MenuItem label="Indestructible" onClick={() => handleAction('MODIFY_CARD', { cardId: card.instanceId, modification: { type: 'ability_grant', value: 'Indestructible' }, untilEndOfTurn: false })} />
                  <MenuItem label="Hexproof" onClick={() => handleAction('MODIFY_CARD', { cardId: card.instanceId, modification: { type: 'ability_grant', value: 'Hexproof' }, untilEndOfTurn: false })} />
                  <MenuItem label="First Strike" onClick={() => handleAction('MODIFY_CARD', { cardId: card.instanceId, modification: { type: 'ability_grant', value: 'First strike' }, untilEndOfTurn: false })} />
                  <MenuItem label="Double Strike" onClick={() => handleAction('MODIFY_CARD', { cardId: card.instanceId, modification: { type: 'ability_grant', value: 'Double strike' }, untilEndOfTurn: false })} />
                  <MenuItem label="Vigilance" onClick={() => handleAction('MODIFY_CARD', { cardId: card.instanceId, modification: { type: 'ability_grant', value: 'Vigilance' }, untilEndOfTurn: false })} />
                  <MenuItem label="Menace" onClick={() => handleAction('MODIFY_CARD', { cardId: card.instanceId, modification: { type: 'ability_grant', value: 'Menace' }, untilEndOfTurn: false })} />
                  <MenuItem label="Reach" onClick={() => handleAction('MODIFY_CARD', { cardId: card.instanceId, modification: { type: 'ability_grant', value: 'Reach' }, untilEndOfTurn: false })} />
                </div>
              </div>
            </div>

            {/* Modify Card Submenu */}
            <div className="relative group">
              <MenuItem label="Modify Card" hasSubmenu />
              <div className="absolute left-full top-0 pl-1 hidden group-hover:block z-50 w-56">
                <div className="bg-slate-900 border border-slate-700 rounded shadow-lg max-h-96 overflow-y-auto">
                  <div className="px-3 py-1 font-bold text-xs text-purple-400 uppercase tracking-widest border-b border-slate-800 mb-1">
                    Type Changes
                  </div>
                  <MenuItem
                    label="Become Creature (0/0)"
                    onClick={() => handleAction('MODIFY_CARD', {
                      cardId: card.instanceId,
                      modification: { type: 'type_change', value: { addTypes: ['Creature'], basePT: { power: 0, toughness: 0 } } },
                      untilEndOfTurn: true
                    })}
                  />
                  <MenuItem
                    label="Become Artifact Creature"
                    onClick={() => handleAction('MODIFY_CARD', {
                      cardId: card.instanceId,
                      modification: { type: 'type_change', value: { addTypes: ['Artifact', 'Creature'], basePT: { power: 0, toughness: 0 } } },
                      untilEndOfTurn: true
                    })}
                  />

                  <div className="px-3 py-1 font-bold text-xs text-purple-400 uppercase tracking-widest border-b border-slate-800 mt-2 mb-1">
                    P/T Boosts (until EOT)
                  </div>
                  <MenuItem label="+1/+1" onClick={() => handleAction('MODIFY_CARD', { cardId: card.instanceId, modification: { type: 'pt_boost', value: { power: 1, toughness: 1 } }, untilEndOfTurn: true })} />
                  <MenuItem label="+2/+2" onClick={() => handleAction('MODIFY_CARD', { cardId: card.instanceId, modification: { type: 'pt_boost', value: { power: 2, toughness: 2 } }, untilEndOfTurn: true })} />
                  <MenuItem label="+3/+3" onClick={() => handleAction('MODIFY_CARD', { cardId: card.instanceId, modification: { type: 'pt_boost', value: { power: 3, toughness: 3 } }, untilEndOfTurn: true })} />
                  <MenuItem label="-1/-1" onClick={() => handleAction('MODIFY_CARD', { cardId: card.instanceId, modification: { type: 'pt_boost', value: { power: -1, toughness: -1 } }, untilEndOfTurn: true })} />
                  <MenuItem label="-2/-2" onClick={() => handleAction('MODIFY_CARD', { cardId: card.instanceId, modification: { type: 'pt_boost', value: { power: -2, toughness: -2 } }, untilEndOfTurn: true })} />
                  <MenuItem label="+X/+0 (power only)" onClick={() => handleAction('MODIFY_CARD', { cardId: card.instanceId, modification: { type: 'pt_boost', value: { power: 1, toughness: 0 } }, untilEndOfTurn: true })} />

                  <div className="px-3 py-1 font-bold text-xs text-purple-400 uppercase tracking-widest border-b border-slate-800 mt-2 mb-1">
                    Grant Abilities (until EOT)
                  </div>
                  <MenuItem label="Flying" onClick={() => handleAction('MODIFY_CARD', { cardId: card.instanceId, modification: { type: 'ability_grant', value: 'Flying' }, untilEndOfTurn: true })} />
                  <MenuItem label="Haste" onClick={() => handleAction('MODIFY_CARD', { cardId: card.instanceId, modification: { type: 'ability_grant', value: 'Haste' }, untilEndOfTurn: true })} />
                  <MenuItem label="Trample" onClick={() => handleAction('MODIFY_CARD', { cardId: card.instanceId, modification: { type: 'ability_grant', value: 'Trample' }, untilEndOfTurn: true })} />
                  <MenuItem label="Lifelink" onClick={() => handleAction('MODIFY_CARD', { cardId: card.instanceId, modification: { type: 'ability_grant', value: 'Lifelink' }, untilEndOfTurn: true })} />
                  <MenuItem label="Deathtouch" onClick={() => handleAction('MODIFY_CARD', { cardId: card.instanceId, modification: { type: 'ability_grant', value: 'Deathtouch' }, untilEndOfTurn: true })} />
                  <MenuItem label="Indestructible" onClick={() => handleAction('MODIFY_CARD', { cardId: card.instanceId, modification: { type: 'ability_grant', value: 'Indestructible' }, untilEndOfTurn: true })} />
                  <MenuItem label="Hexproof" onClick={() => handleAction('MODIFY_CARD', { cardId: card.instanceId, modification: { type: 'ability_grant', value: 'Hexproof' }, untilEndOfTurn: true })} />
                  <MenuItem label="First Strike" onClick={() => handleAction('MODIFY_CARD', { cardId: card.instanceId, modification: { type: 'ability_grant', value: 'First strike' }, untilEndOfTurn: true })} />
                  <MenuItem label="Double Strike" onClick={() => handleAction('MODIFY_CARD', { cardId: card.instanceId, modification: { type: 'ability_grant', value: 'Double strike' }, untilEndOfTurn: true })} />
                  <MenuItem label="Vigilance" onClick={() => handleAction('MODIFY_CARD', { cardId: card.instanceId, modification: { type: 'ability_grant', value: 'Vigilance' }, untilEndOfTurn: true })} />
                  <MenuItem label="Menace" onClick={() => handleAction('MODIFY_CARD', { cardId: card.instanceId, modification: { type: 'ability_grant', value: 'Menace' }, untilEndOfTurn: true })} />
                  <MenuItem label="Reach" onClick={() => handleAction('MODIFY_CARD', { cardId: card.instanceId, modification: { type: 'ability_grant', value: 'Reach' }, untilEndOfTurn: true })} />

                  <div className="h-px bg-slate-800 my-1 mx-2"></div>
                  <MenuItem
                    label="Clear All Modifications"
                    className="text-red-400 hover:bg-red-900/30 hover:text-red-300"
                    onClick={() => handleAction('MODIFY_CARD', { cardId: card.instanceId, modification: { type: 'clear_all' } })}
                  />
                </div>
              </div>
            </div>

            {/* Remove Creature Type - only show if card became creature via modifier */}
            {card.modifiers?.some((m: any) => m.type === 'type_change' && m.value?.addTypes?.includes('Creature')) && (
              <MenuItem
                label="Remove Creature Type"
                className="text-amber-400 hover:bg-amber-900/30 hover:text-amber-300"
                onClick={() => handleAction('MODIFY_CARD', { cardId: card.instanceId, modification: { type: 'remove_type_change' } })}
              />
            )}

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
            <MenuItem label="Return to Hand" onClick={() => handleAction('MOVE_CARD', { cardId: card.instanceId, toZone: 'hand' })} />
            <MenuItem label="Return to Battlefield" onClick={() => handleAction('MOVE_CARD', { cardId: card.instanceId, toZone: 'battlefield' })} />
            <MenuItem label="Exile" onClick={() => handleAction('MOVE_CARD', { cardId: card.instanceId, toZone: 'exile' })} />
            <div className="h-px bg-slate-800 my-1 mx-2"></div>
            <MenuItem label="To Library (Top)" onClick={() => handleAction('MOVE_CARD', { cardId: card.instanceId, toZone: 'library', position: 'top' })} />
            <MenuItem label="To Library (Bottom)" onClick={() => handleAction('MOVE_CARD', { cardId: card.instanceId, toZone: 'library', position: 'bottom' })} />
          </>
        )}

        {/* Exile Menu */}
        {zone === 'exile' && (
          <>
            <MenuItem label="Return to Hand" onClick={() => handleAction('MOVE_CARD', { cardId: card.instanceId, toZone: 'hand' })} />
            <MenuItem label="Return to Battlefield" onClick={() => handleAction('MOVE_CARD', { cardId: card.instanceId, toZone: 'battlefield' })} />
            <MenuItem label="Return to Graveyard" onClick={() => handleAction('MOVE_CARD', { cardId: card.instanceId, toZone: 'graveyard' })} />
            <div className="h-px bg-slate-800 my-1 mx-2"></div>
            <MenuItem label="To Library (Top)" onClick={() => handleAction('MOVE_CARD', { cardId: card.instanceId, toZone: 'library', position: 'top' })} />
            <MenuItem label="To Library (Bottom)" onClick={() => handleAction('MOVE_CARD', { cardId: card.instanceId, toZone: 'library', position: 'bottom' })} />
          </>
        )}

        {/* Library Menu */}
        {zone === 'library' && (
          <>
            <MenuItem label="Draw (To Hand)" onClick={() => handleAction('MOVE_CARD', { cardId: card.instanceId, toZone: 'hand' })} />
            <MenuItem label="Play (Battlefield)" onClick={() => handleAction('MOVE_CARD', { cardId: card.instanceId, toZone: 'battlefield' })} />
            <MenuItem label="Put in Graveyard" onClick={() => handleAction('MOVE_CARD', { cardId: card.instanceId, toZone: 'graveyard' })} />
            <MenuItem label="Exile" onClick={() => handleAction('MOVE_CARD', { cardId: card.instanceId, toZone: 'exile' })} />
          </>
        )}

        {/* Delete option only for tokens */}
        {card.isToken && (
          <>
            <div className="h-px bg-slate-800 my-1 mx-2"></div>
            <MenuItem
              label="Delete Token"
              className="text-red-500 hover:bg-red-900/30 hover:text-red-400"
              onClick={() => handleAction('DELETE_CARD', { cardId: card.instanceId })}
            />
          </>
        )}
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

          {/* Token Submenu */}
          <div className="relative group">
            <MenuItem label="Create Token" hasSubmenu />
            {/* Wrapper for hover bridge */}
            <div className="absolute left-full top-0 pl-1 hidden group-hover:block z-50 w-56">
              <div className="bg-slate-900 border border-slate-700 rounded shadow-lg p-1">
                <div className="px-3 py-1 font-bold text-xs text-slate-500 uppercase tracking-widest border-b border-slate-800 mb-1">
                  Game Tokens
                </div>

                <MenuItem
                  label="Set Tokens..."
                  onClick={() => handleAction('OPEN_TOKEN_PICKER')}
                  className="text-emerald-400 font-bold"
                />

                <div className="h-px bg-slate-800 my-1 mx-2"></div>

                <MenuItem
                  label="Custom Token..."
                  onClick={() => handleAction('OPEN_CUSTOM_TOKEN_MODAL')}
                  className="text-slate-400"
                />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

const MenuItem: React.FC<{ label: string; onClick?: () => void; className?: string; onMouseEnter?: () => void; hasSubmenu?: boolean }> = ({ label, onClick, className = '', onMouseEnter, hasSubmenu }) => (
  <div
    className={`px-4 py-2 hover:bg-emerald-600/20 hover:text-emerald-300 cursor-pointer transition-colors flex justify-between items-center ${className}`}
    onClick={onClick}
    onMouseEnter={onMouseEnter}
  >
    <span>{label}</span>
    {hasSubmenu && <ChevronRight size={14} className="text-slate-500" />}
  </div>
);
