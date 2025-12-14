
import React, { useState, useEffect } from 'react';
import { socketService } from '../../services/SocketService';
import { CardComponent } from '../game/CardComponent';

interface DraftViewProps {
  draftState: any;
  roomId: string; // Passed from parent
  currentPlayerId: string;
}

export const DraftView: React.FC<DraftViewProps> = ({ draftState, roomId, currentPlayerId }) => {
  const [timer, setTimer] = useState(60);

  useEffect(() => {
    const interval = setInterval(() => {
      setTimer(t => t > 0 ? t - 1 : 0);
    }, 1000);
    return () => clearInterval(interval);
  }, []); // Reset timer on new pack? Simplified for now.

  const activePack = draftState.players[currentPlayerId]?.activePack;
  const pickedCards = draftState.players[currentPlayerId]?.pool || [];

  const handlePick = (cardId: string) => {
    socketService.socket.emit('pick_card', { roomId, playerId: currentPlayerId, cardId });
  };

  if (!activePack) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-slate-900 text-white">
        <h2 className="text-2xl font-bold mb-4">Waiting for next pack...</h2>
        <div className="animate-pulse bg-slate-700 w-64 h-8 rounded"></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-950 text-white p-4 gap-4">
      {/* Top Header: Timer & Pack Info */}
      <div className="flex justify-between items-center bg-slate-900 p-4 rounded-lg border border-slate-800">
        <div>
          <h2 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-500">
            Pack {draftState.packNumber}
          </h2>
          <span className="text-sm text-slate-400">Pick {pickedCards.length % 15 + 1}</span>
        </div>
        <div className="text-3xl font-mono text-emerald-400 font-bold">
          00:{timer < 10 ? `0${timer}` : timer}
        </div>
      </div>

      {/* Main Area: Current Pack */}
      <div className="flex-1 bg-slate-900/50 p-6 rounded-xl border border-slate-800 overflow-y-auto">
        <h3 className="text-center text-slate-400 uppercase tracking-widest text-sm font-bold mb-6">Select a Card</h3>
        <div className="flex flex-wrap justify-center gap-4">
          {activePack.cards.map((card: any) => (
            <div
              key={card.id}
              className="group relative transition-all hover:scale-110 hover:z-10 cursor-pointer"
              onClick={() => handlePick(card.id)}
            >
              <img
                src={card.image || card.image_uris?.normal || card.card_faces?.[0]?.image_uris?.normal}
                alt={card.name}
                className="w-48 rounded-lg shadow-xl shadow-black/50 group-hover:shadow-emerald-500/50 group-hover:ring-2 ring-emerald-400"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Bottom Area: Drafted Pool Preview */}
      <div className="h-48 bg-slate-900 p-4 rounded-lg border border-slate-800 flex flex-col">
        <h3 className="text-xs font-bold text-slate-500 uppercase mb-2">Your Pool ({pickedCards.length})</h3>
        <div className="flex-1 overflow-x-auto flex items-center gap-1 pb-2">
          {pickedCards.map((card: any, idx: number) => (
            <img
              key={`${card.id}-${idx}`}
              src={card.image || card.image_uris?.normal || card.card_faces?.[0]?.image_uris?.normal}
              alt={card.name}
              className="h-full rounded shadow-md"
            />
          ))}
        </div>
      </div>
    </div>
  );
};
