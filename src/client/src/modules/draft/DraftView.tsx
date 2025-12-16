
import React, { useState, useEffect } from 'react';
import { socketService } from '../../services/SocketService';

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

  // --- UI State & Persistence ---
  const [poolHeight, setPoolHeight] = useState<number>(() => {
    const saved = localStorage.getItem('draft_poolHeight');
    return saved ? parseInt(saved, 10) : 220;
  });

  const [cardScale, setCardScale] = useState<number>(() => {
    const saved = localStorage.getItem('draft_cardScale');
    return saved ? parseFloat(saved) : 0.7;
  });

  const [isResizing, setIsResizing] = useState(false);

  // Persist settings
  useEffect(() => {
    localStorage.setItem('draft_poolHeight', poolHeight.toString());
  }, [poolHeight]);

  useEffect(() => {
    localStorage.setItem('draft_cardScale', cardScale.toString());
  }, [cardScale]);

  // Resize Handlers
  const startResizing = (e: React.MouseEvent) => {
    setIsResizing(true);
    e.preventDefault();
  };

  useEffect(() => {
    const stopResizing = () => setIsResizing(false);
    const resize = (e: MouseEvent) => {
      if (isResizing) {
        const newHeight = window.innerHeight - e.clientY;
        // Limits: Min 100px, Max 60% of screen
        const maxHeight = window.innerHeight * 0.6;
        if (newHeight >= 100 && newHeight <= maxHeight) {
          setPoolHeight(newHeight);
        }
      }
    };

    if (isResizing) {
      window.addEventListener('mousemove', resize);
      window.addEventListener('mouseup', stopResizing);
    }
    return () => {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
    };
  }, [isResizing]);

  const [hoveredCard, setHoveredCard] = useState<any>(null);

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
    <div className="flex flex-col h-full bg-slate-950 text-white overflow-hidden relative select-none" onContextMenu={(e) => e.preventDefault()}>
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-black opacity-50 pointer-events-none"></div>

      {/* Top Header: Timer & Pack Info */}
      <div className="shrink-0 p-4 z-10">
        <div className="flex justify-between items-center bg-slate-900/80 backdrop-blur border border-slate-800 p-4 rounded-lg shadow-lg">
          <div className="flex items-center gap-8">
            <div>
              <h2 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-500 shadow-amber-500/20 drop-shadow-sm">
                Pack {draftState.packNumber}
              </h2>
              <span className="text-sm text-slate-400 font-medium">Pick {pickedCards.length % 15 + 1}</span>
            </div>

            {/* Card Scalar */}
            <div className="hidden md:flex flex-col gap-1 w-32">
              <label className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Card Size</label>
              <input
                type="range"
                min="0.5"
                max="1.5"
                step="0.1"
                value={cardScale}
                onChange={(e) => setCardScale(parseFloat(e.target.value))}
                className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
              />
            </div>
          </div>

          <div className="text-4xl font-mono text-emerald-400 font-bold drop-shadow-[0_0_10px_rgba(52,211,153,0.5)]">
            00:{timer < 10 ? `0${timer}` : timer}
          </div>
        </div>
      </div>

      {/* Middle Content: Zoom Sidebar + Pack Grid */}
      <div className="flex-1 flex overflow-hidden">

        {/* Dedicated Zoom Zone (Left Sidebar) */}
        <div className="hidden lg:flex w-80 shrink-0 flex-col items-center justify-start pt-8 border-r border-slate-800/50 bg-slate-900/20 backdrop-blur-sm z-10">
          {hoveredCard ? (
            <div className="animate-in fade-in slide-in-from-left-4 duration-300 p-4 sticky top-4">
              <img
                src={hoveredCard.image || hoveredCard.image_uris?.normal || hoveredCard.card_faces?.[0]?.image_uris?.normal}
                alt={hoveredCard.name}
                className="w-full rounded-xl shadow-2xl shadow-black ring-1 ring-white/10"
              />
              <div className="mt-4 text-center">
                <h3 className="text-lg font-bold text-slate-200">{hoveredCard.name}</h3>
                <p className="text-xs text-slate-400 uppercase tracking-wider mt-1">{hoveredCard.type_line}</p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-slate-600 p-8 text-center opacity-50">
              <div className="w-48 h-64 border-2 border-dashed border-slate-700 rounded-xl mb-4 flex items-center justify-center">
                <span className="text-xs uppercase font-bold tracking-widest">Hover Card</span>
              </div>
              <p className="text-sm">Hover over a card to view clear details.</p>
            </div>
          )}
        </div>

        {/* Main Area: Current Pack */}
        <div className="flex-1 overflow-y-auto p-4 z-0 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
          <div className="flex flex-col items-center justify-center min-h-full pb-10">
            <h3 className="text-center text-slate-500 uppercase tracking-[0.2em] text-xs font-bold mb-8">Select a Card</h3>
            <div className="flex flex-wrap justify-center gap-6 [perspective:1000px]">
              {activePack.cards.map((card: any) => (
                <div
                  key={card.id}
                  className="group relative transition-all duration-300 hover:scale-110 hover:-translate-y-4 hover:z-50 cursor-pointer"
                  style={{ width: `${14 * cardScale}rem` }}
                  onClick={() => handlePick(card.id)}
                  onMouseEnter={() => setHoveredCard(card)}
                  onMouseLeave={() => setHoveredCard(null)}
                >
                  <div className="absolute inset-0 rounded-xl bg-emerald-500 blur-xl opacity-0 group-hover:opacity-40 transition-opacity duration-300"></div>
                  <img
                    src={card.image || card.image_uris?.normal || card.card_faces?.[0]?.image_uris?.normal}
                    alt={card.name}
                    className="w-full rounded-xl shadow-2xl shadow-black group-hover:ring-2 ring-emerald-400/50 relative z-10"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>

      {/* Resize Handle */}
      <div
        className="h-1 bg-slate-800 hover:bg-emerald-500 cursor-row-resize z-30 transition-colors w-full flex items-center justify-center shrink-0"
        onMouseDown={startResizing}
      >
        <div className="w-16 h-1 bg-slate-600 rounded-full"></div>
      </div>

      {/* Bottom Area: Drafted Pool Preview */}
      <div
        className="shrink-0 bg-gradient-to-t from-slate-950 to-slate-900/90 backdrop-blur-md flex flex-col z-20 shadow-[0_-10px_40px_rgba(0,0,0,0.5)] transition-all ease-out duration-75"
        style={{ height: `${poolHeight}px` }}
      >
        <div className="px-6 py-2 flex items-center justify-between shrink-0">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            Your Pool ({pickedCards.length})
          </h3>
        </div>
        <div className="flex-1 overflow-x-auto flex items-center gap-2 px-6 pb-4 custom-scrollbar">
          {pickedCards.map((card: any, idx: number) => (
            <div
              key={`${card.id}-${idx}`}
              className="relative group shrink-0 transition-all hover:-translate-y-10 h-full flex items-center"
              onMouseEnter={() => setHoveredCard(card)}
              onMouseLeave={() => setHoveredCard(null)}
            >
              <img
                src={card.image || card.image_uris?.normal || card.card_faces?.[0]?.image_uris?.normal}
                alt={card.name}
                className="h-[90%] w-auto rounded-lg shadow-lg border border-slate-700/50 group-hover:border-emerald-500/50 group-hover:shadow-emerald-500/20 transition-all object-contain"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
