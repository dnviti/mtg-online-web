import React from 'react';
import { GameState, CardInstance } from '../../types/game';
import { socketService } from '../../services/SocketService';
import { CardComponent } from './CardComponent';

interface GameViewProps {
  gameState: GameState;
  currentPlayerId: string;
}

export const GameView: React.FC<GameViewProps> = ({ gameState, currentPlayerId }) => {

  const handleDrop = (e: React.DragEvent, zone: CardInstance['zone']) => {
    e.preventDefault();
    const cardId = e.dataTransfer.getData('cardId');
    if (!cardId) return;

    socketService.socket.emit('game_action', {
      roomId: gameState.roomId,
      action: {
        type: 'MOVE_CARD',
        cardId,
        toZone: zone
      }
    });
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const toggleTap = (cardId: string) => {
    socketService.socket.emit('game_action', {
      roomId: gameState.roomId,
      action: {
        type: 'TAP_CARD',
        cardId
      }
    });
  }

  const myPlayer = gameState.players[currentPlayerId];
  // Simple 1v1 assumption for now, or just taking the first other player
  const opponentId = Object.keys(gameState.players).find(id => id !== currentPlayerId);
  const opponent = opponentId ? gameState.players[opponentId] : null;

  // Helper to get cards
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
  const oppHand = getCards(opponentId, 'hand'); // Should be hidden/count only
  const oppLibrary = getCards(opponentId, 'library');

  return (
    <div className="flex flex-col h-full w-full bg-slate-950 text-white overflow-hidden select-none">
      {/* Top Area: Opponent */}
      <div className="flex-[2] bg-slate-900/50 border-b border-slate-800 flex flex-col relative p-4">
        <div className="absolute top-2 left-4 flex flex-col">
          <span className="font-bold text-slate-300">{opponent?.name || 'Waiting...'}</span>
          <span className="text-sm text-slate-500">Life: {opponent?.life}</span>
          <span className="text-xs text-slate-600">Hand: {oppHand.length} | Lib: {oppLibrary.length}</span>
        </div>

        {/* Opponent Battlefield - Just a flex container for now */}
        <div className="flex-1 flex flex-wrap items-center justify-center gap-2 p-8">
          {oppBattlefield.map(card => (
            <CardComponent
              key={card.instanceId}
              card={card}
              onDragStart={(e, id) => e.dataTransfer.setData('cardId', id)}
              onClick={toggleTap}
            />
          ))}
        </div>
      </div>

      {/* Middle Area: My Battlefield */}
      <div
        className="flex-[3] bg-slate-900 p-4 relative border-b border-slate-800"
        onDragOver={handleDragOver}
        onDrop={(e) => handleDrop(e, 'battlefield')}
      >
        <div className="w-full h-full flex flex-wrap content-start gap-2 p-4 overflow-y-auto">
          {myBattlefield.map(card => (
            <CardComponent
              key={card.instanceId}
              card={card}
              onDragStart={(e, id) => e.dataTransfer.setData('cardId', id)}
              onClick={toggleTap}
            />
          ))}
        </div>
      </div>

      {/* Bottom Area: Controls & Hand */}
      <div className="h-64 flex bg-slate-950">
        {/* Left Controls: Library/Grave */}
        <div className="w-48 bg-slate-900 p-2 flex flex-col gap-2 items-center justify-center border-r border-slate-800 z-10">
          <div
            className="w-20 h-28 bg-gradient-to-br from-slate-700 to-slate-800 rounded border border-slate-600 flex items-center justify-center cursor-pointer hover:border-emerald-500 shadow-lg"
            onClick={() => socketService.socket.emit('game_action', { roomId: gameState.roomId, action: { type: 'DRAW_CARD', playerId: currentPlayerId } })}
            title="Click to Draw"
          >
            <div className="text-center">
              <span className="block font-bold text-slate-300">Library</span>
              <span className="text-xs text-slate-500">{myLibrary.length}</span>
            </div>
          </div>
          <div
            className="w-20 h-28 bg-slate-800 rounded border border-slate-700 flex items-center justify-center dashed"
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, 'graveyard')}
          >
            <div className="text-center">
              <span className="block text-slate-400 text-sm">Grave</span>
              <span className="text-xs text-slate-500">{myGraveyard.length}</span>
            </div>
          </div>
        </div>

        {/* Hand Area */}
        <div
          className="flex-1 p-4 bg-black/40 flex items-end justify-center overflow-x-auto pb-8"
          onDragOver={handleDragOver}
          onDrop={(e) => handleDrop(e, 'hand')}
        >
          <div className="flex -space-x-12 hover:space-x-1 transition-all duration-300 items-end h-full pt-4">
            {myHand.map(card => (
              <CardComponent
                key={card.instanceId}
                card={card}
                onDragStart={(e, id) => e.dataTransfer.setData('cardId', id)}
                onClick={toggleTap}
                style={{ transformOrigin: 'bottom center' }}
              />
            ))}
          </div>
        </div>

        {/* Right Controls: Exile / Life */}
        <div className="w-48 bg-slate-900 p-2 flex flex-col gap-4 items-center border-l border-slate-800">
          <div className="text-center mt-4">
            <div className="text-xs text-slate-500 uppercase tracking-wider">Your Life</div>
            <div className="text-4xl font-bold text-emerald-500">{myPlayer?.life}</div>
            <div className="flex gap-2 mt-2">
              <button className="w-8 h-8 bg-slate-800 rounded hover:bg-red-900 border border-slate-700 font-bold" onClick={() => socketService.socket.emit('game_action', { roomId: gameState.roomId, action: { type: 'UPDATE_LIFE', playerId: currentPlayerId, amount: -1 } })}>-</button>
              <button className="w-8 h-8 bg-slate-800 rounded hover:bg-emerald-900 border border-slate-700 font-bold" onClick={() => socketService.socket.emit('game_action', { roomId: gameState.roomId, action: { type: 'UPDATE_LIFE', playerId: currentPlayerId, amount: 1 } })}>+</button>
            </div>
          </div>

          <div
            className="w-20 h-20 bg-slate-800 rounded border border-slate-700 flex items-center justify-center mt-auto mb-2 opacity-50 hover:opacity-100"
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, 'exile')}
          >
            <span className="text-xs text-slate-500">Exile ({myExile.length})</span>
          </div>
        </div>
      </div>
    </div>
  );
};
