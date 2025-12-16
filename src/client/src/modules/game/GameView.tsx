import React, { useRef, useState, useEffect } from 'react';
import { GameState, CardInstance } from '../../types/game';
import { socketService } from '../../services/SocketService';
import { CardComponent } from './CardComponent';
import { GameContextMenu, ContextMenuRequest } from './GameContextMenu';
import { ZoneOverlay } from './ZoneOverlay';

interface GameViewProps {
  gameState: GameState;
  currentPlayerId: string;
}

export const GameView: React.FC<GameViewProps> = ({ gameState, currentPlayerId }) => {
  const battlefieldRef = useRef<HTMLDivElement>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuRequest | null>(null);
  const [viewingZone, setViewingZone] = useState<string | null>(null);

  useEffect(() => {
    // Disable default context menu
    const handleContext = (e: MouseEvent) => e.preventDefault();
    document.addEventListener('contextmenu', handleContext);
    return () => document.removeEventListener('contextmenu', handleContext);
  }, []);

  const handleContextMenu = (e: React.MouseEvent, type: 'background' | 'card' | 'zone', targetId?: string, zoneName?: string) => {
    e.preventDefault();
    e.stopPropagation();

    const card = (type === 'card' && targetId) ? gameState.cards[targetId] : undefined;

    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      type,
      targetId,
      card,
      zone: zoneName
    });
  };

  const handleMenuAction = (actionType: string, payload: any) => {

    if (actionType === 'VIEW_ZONE') {
      setViewingZone(payload.zone);
      return;
    }

    // Default payload to object if undefined
    const safePayload = payload || {};

    // Inject currentPlayerId if not present (acts as actor)
    if (!safePayload.playerId) {
      safePayload.playerId = currentPlayerId;
    }
    // Inject ownerId if not present (useful for token creation etc)
    if (!safePayload.ownerId) {
      safePayload.ownerId = currentPlayerId;
    }

    socketService.socket.emit('game_action', {
      action: {
        type: actionType,
        ...safePayload
      }
    });
  };

  const handleDrop = (e: React.DragEvent, zone: CardInstance['zone']) => {
    e.preventDefault();
    const cardId = e.dataTransfer.getData('cardId');
    if (!cardId) return;

    const action: any = {
      type: 'MOVE_CARD',
      cardId,
      toZone: zone
    };

    // Calculate position if dropped on battlefield
    if (zone === 'battlefield' && battlefieldRef.current) {
      const rect = battlefieldRef.current.getBoundingClientRect();
      // Calculate relative position (0-100%)
      // We clamp values to keep cards somewhat within bounds (0-90 to account for card width)
      const rawX = ((e.clientX - rect.left) / rect.width) * 100;
      const rawY = ((e.clientY - rect.top) / rect.height) * 100;

      const x = Math.max(0, Math.min(90, rawX));
      const y = Math.max(0, Math.min(85, rawY)); // 85 to ensure bottom of card isn't cut off too much

      action.position = { x, y };
    }

    socketService.socket.emit('game_action', {
      action
    });
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const toggleTap = (cardId: string) => {
    socketService.socket.emit('game_action', {
      action: {
        type: 'TAP_CARD',
        cardId
      }
    });
  }

  // const toggleFlip = (cardId: string) => {
  //   socketService.socket.emit('game_action', {
  //     roomId: gameState.roomId,
  //     action: {
  //       type: 'FLIP_CARD',
  //       cardId
  //     }
  //   });
  // }

  const myPlayer = gameState.players[currentPlayerId];
  const opponentId = Object.keys(gameState.players).find(id => id !== currentPlayerId);
  const opponent = opponentId ? gameState.players[opponentId] : null;

  const getCards = (ownerId: string | undefined, zone: string) => {
    if (!ownerId) return [];
    return Object.values(gameState.cards).filter(c => c.zone === zone && (c.controllerId === ownerId || c.ownerId === ownerId));
  };

  const myHand = getCards(currentPlayerId, 'hand');
  const myBattlefield = getCards(currentPlayerId, 'battlefield');
  const myGraveyard = getCards(currentPlayerId, 'graveyard');
  const myLibrary = getCards(currentPlayerId, 'library');
  const myExile = getCards(currentPlayerId, 'exile');

  const oppBattlefield = getCards(opponentId, 'battlefield');
  const oppHand = getCards(opponentId, 'hand');
  const oppLibrary = getCards(opponentId, 'library');
  const oppGraveyard = getCards(opponentId, 'graveyard');
  const oppExile = getCards(opponentId, 'exile');

  return (
    <div
      className="flex flex-col h-full w-full bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-900 to-black text-white overflow-hidden select-none font-sans"
      onContextMenu={(e) => handleContextMenu(e, 'background')}
    >
      <GameContextMenu
        request={contextMenu}
        onClose={() => setContextMenu(null)}
        onAction={handleMenuAction}
      />

      {viewingZone && (
        <ZoneOverlay
          zoneName={viewingZone}
          cards={getCards(currentPlayerId, viewingZone)}
          onClose={() => setViewingZone(null)}
          onCardContextMenu={(e, cardId) => handleContextMenu(e, 'card', cardId)}
        />
      )}

      {/* Top Area: Opponent */}
      <div className="flex-[2] relative flex flex-col pointer-events-none">
        {/* Opponent Hand (Visual) */}
        <div className="absolute top-[-40px] left-0 right-0 flex justify-center -space-x-4 opacity-70">
          {oppHand.map((_, i) => (
            <div key={i} className="w-16 h-24 bg-slate-800 border border-slate-600 rounded shadow-lg transform rotate-180"></div>
          ))}
        </div>

        {/* Opponent Info Bar */}
        <div className="absolute top-4 left-4 z-10 flex items-center space-x-4 pointer-events-auto bg-black/50 p-2 rounded-lg backdrop-blur-sm border border-slate-700">
          <div className="flex flex-col">
            <span className="font-bold text-lg text-red-400">{opponent?.name || 'Waiting...'}</span>
            <div className="flex gap-2 text-xs text-slate-400">
              <span>Hand: {oppHand.length}</span>
              <span>Lib: {oppLibrary.length}</span>
              <span>Grave: {oppGraveyard.length}</span>
              <span>Exile: {oppExile.length}</span>
            </div>
          </div>
          <div className="text-3xl font-bold text-white">{opponent?.life}</div>
        </div>

        {/* Opponent Battlefield (Perspective Reversed or specific layout) */}
        {/* For now, we place it "at the back" of the table. */}
        <div className="flex-1 w-full relative perspective-1000">
          <div
            className="w-full h-full relative"
            style={{
              transform: 'rotateX(-20deg) scale(0.9)',
              transformOrigin: 'center bottom',
            }}
          >
            {oppBattlefield.map(card => (
              <div
                key={card.instanceId}
                className="absolute transition-all duration-300 ease-out"
                style={{
                  left: `${card.position?.x || 50}%`,
                  top: `${card.position?.y || 50}%`,
                  zIndex: Math.floor((card.position?.y || 0)), // Simple z-index based on vertical pos
                }}
              >
                <CardComponent
                  card={card}
                  // Opponent cards shouldn't necessarily be draggable by me, but depends on game rules. 
                  // Usually not.
                  onDragStart={() => { }}
                  onClick={() => { }} // Maybe inspect?
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Middle Area: My Battlefield (The Table) */}
      <div
        className="flex-[4] relative perspective-1000 z-10"
        ref={battlefieldRef}
        onDragOver={handleDragOver}
        onDrop={(e) => handleDrop(e, 'battlefield')}
      >
        <div
          className="w-full h-full relative bg-slate-900/20 border-y border-white/5 shadow-inner"
          style={{
            transform: 'rotateX(25deg)',
            transformOrigin: 'center 40%', /* Pivot point */
            boxShadow: 'inset 0 0 100px rgba(0,0,0,0.8)'
          }}
        >
          {/* Battlefield Texture/Grid (Optional) */}
          <div className="absolute inset-0 opacity-10 bg-[linear-gradient(rgba(255,255,255,0.1)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.1)_1px,transparent_1px)] bg-[size:50px_50px]"></div>

          {myBattlefield.map(card => (
            <div
              key={card.instanceId}
              className="absolute transition-all duration-200"
              style={{
                left: `${card.position?.x || Math.random() * 80}%`,
                top: `${card.position?.y || Math.random() * 80}%`,
                zIndex: card.position?.z ?? (Math.floor((card.position?.y || 0)) + 10),
              }}
            >
              <CardComponent
                card={card}
                onDragStart={(e, id) => e.dataTransfer.setData('cardId', id)}
                onClick={toggleTap}
                onContextMenu={(id, e) => {
                  handleContextMenu(e, 'card', id);
                }}
              />
            </div>
          ))}

          {myBattlefield.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span className="text-white/10 text-4xl font-bold uppercase tracking-widest">Battlefield</span>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Area: Controls & Hand */}
      <div className="h-48 relative z-20 flex bg-gradient-to-t from-black to-slate-900/80 backdrop-blur-md shadow-[0_-5px_20px_rgba(0,0,0,0.5)]">

        {/* Left Controls: Library/Grave */}
        <div className="w-40 p-2 flex flex-col gap-2 items-center justify-center border-r border-white/10">
          <div
            className="group relative w-16 h-24 bg-slate-800 rounded border border-slate-600 cursor-pointer shadow-lg transition-transform hover:-translate-y-1 hover:shadow-cyan-500/20"
            onClick={() => socketService.socket.emit('game_action', { action: { type: 'DRAW_CARD' } })}
            onContextMenu={(e) => handleContextMenu(e, 'zone', undefined, 'library')}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-slate-700 to-slate-800 rounded"></div>
            {/* Deck look */}
            <div className="absolute top-[-2px] left-[-2px] right-[-2px] bottom-[2px] bg-slate-700 rounded z-[-1]"></div>
            <div className="absolute top-[-4px] left-[-4px] right-[-4px] bottom-[4px] bg-slate-800 rounded z-[-2]"></div>

            <div className="absolute inset-0 flex items-center justify-center flex-col">
              <span className="text-xs font-bold text-slate-300 shadow-black drop-shadow-md">Library</span>
              <span className="text-lg font-bold text-white shadow-black drop-shadow-md">{myLibrary.length}</span>
            </div>
          </div>

          <div
            className="w-16 h-24 border-2 border-dashed border-slate-600 rounded flex items-center justify-center mt-2 transition-colors hover:border-slate-400 hover:bg-white/5"
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, 'graveyard')}
            onContextMenu={(e) => handleContextMenu(e, 'zone', undefined, 'graveyard')}
          >
            <div className="text-center">
              <span className="block text-slate-500 text-[10px] uppercase">Graveyard</span>
              <span className="text-sm font-bold text-slate-400">{myGraveyard.length}</span>
            </div>
          </div>
        </div>

        {/* Hand Area */}
        <div
          className="flex-1 relative flex items-end justify-center px-4 pb-2"
          onDragOver={handleDragOver}
          onDrop={(e) => handleDrop(e, 'hand')}
        >
          <div className="flex justify-center -space-x-12 w-full h-full items-end pb-4 perspective-500">
            {myHand.map((card, index) => (
              <div
                key={card.instanceId}
                className="transition-all duration-300 hover:-translate-y-12 hover:scale-110 hover:z-50 hover:rotate-0 origin-bottom"
                style={{
                  transform: `rotate(${(index - (myHand.length - 1) / 2) * 5}deg) translateY(${Math.abs(index - (myHand.length - 1) / 2) * 5}px)`,
                  zIndex: index
                }}
              >
                <CardComponent
                  card={card}
                  onDragStart={(e, id) => e.dataTransfer.setData('cardId', id)}
                  onClick={toggleTap}
                  onContextMenu={(id, e) => handleContextMenu(e, 'card', id)}
                  style={{ transformOrigin: 'bottom center' }}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Right Controls: Exile / Life */}
        <div className="w-40 p-2 flex flex-col gap-4 items-center justify-between border-l border-white/10 py-4">
          <div className="text-center">
            <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">Your Life</div>
            <div className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-b from-emerald-400 to-emerald-700 drop-shadow-[0_2px_10px_rgba(16,185,129,0.3)]">
              {myPlayer?.life}
            </div>
            <div className="flex gap-1 mt-2 justify-center">
              <button
                className="w-8 h-8 rounded-full bg-slate-800 hover:bg-red-500/20 text-red-500 border border-slate-700 hover:border-red-500 transition-colors flex items-center justify-center font-bold"
                onClick={() => socketService.socket.emit('game_action', { action: { type: 'UPDATE_LIFE', amount: -1 } })}
              >
                -
              </button>
              <button
                className="w-8 h-8 rounded-full bg-slate-800 hover:bg-emerald-500/20 text-emerald-500 border border-slate-700 hover:border-emerald-500 transition-colors flex items-center justify-center font-bold"
                onClick={() => socketService.socket.emit('game_action', { action: { type: 'UPDATE_LIFE', amount: 1 } })}
              >
                +
              </button>
            </div>
          </div>

          <div
            className="w-full text-center border-t border-white/5 pt-2 cursor-pointer hover:bg-white/5 rounded p-1"
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, 'exile')}
            onContextMenu={(e) => handleContextMenu(e, 'zone', undefined, 'exile')}
          >
            <span className="text-xs text-slate-500 block">Exile Drop Zone</span>
            <span className="text-lg font-bold text-slate-400">{myExile.length}</span>
          </div>
        </div>

      </div>
    </div>
  );
};
