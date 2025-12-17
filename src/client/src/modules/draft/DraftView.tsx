
import React, { useState, useEffect } from 'react';
import { socketService } from '../../services/SocketService';
import { LogOut } from 'lucide-react';
import { Modal } from '../../components/Modal';
import { FoilOverlay } from '../../components/CardPreview';

// Helper to normalize card data for visuals
const normalizeCard = (c: any) => ({
  ...c,
  finish: c.finish || 'nonfoil',
  image: c.image || c.image_uris?.normal || c.card_faces?.[0]?.image_uris?.normal
});

interface DraftViewProps {
  draftState: any;
  roomId: string; // Passed from parent
  currentPlayerId: string;
  onExit?: () => void;
}

export const DraftView: React.FC<DraftViewProps> = ({ draftState, currentPlayerId, onExit }) => {
  const [timer, setTimer] = useState(60);
  const [confirmExitOpen, setConfirmExitOpen] = useState(false);

  const myPlayer = draftState.players[currentPlayerId];
  const pickExpiresAt = myPlayer?.pickExpiresAt;

  useEffect(() => {
    if (!pickExpiresAt) {
      setTimer(0);
      return;
    }

    const updateTimer = () => {
      const remainingMs = pickExpiresAt - Date.now();
      setTimer(Math.max(0, Math.ceil(remainingMs / 1000)));
    };

    updateTimer();
    const interval = setInterval(updateTimer, 500); // Check twice a second for smoother updates
    return () => clearInterval(interval);
  }, [pickExpiresAt]);

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
      document.addEventListener('mousemove', resize);
      document.addEventListener('mouseup', stopResizing);
    }
    return () => {
      document.removeEventListener('mousemove', resize);
      document.removeEventListener('mouseup', stopResizing);
    };
  }, [isResizing]);

  const [hoveredCard, setHoveredCard] = useState<any>(null);
  const [displayCard, setDisplayCard] = useState<any>(null);

  useEffect(() => {
    if (hoveredCard) {
      setDisplayCard(normalizeCard(hoveredCard));
    }
  }, [hoveredCard]);

  const activePack = draftState.players[currentPlayerId]?.activePack;
  const pickedCards = draftState.players[currentPlayerId]?.pool || [];

  const handlePick = (cardId: string) => {
    // roomId and playerId are now inferred by the server from socket session
    socketService.socket.emit('pick_card', { cardId });
  };

  // ... inside DraftView return ...

  return (
    <div className="flex-1 w-full flex flex-col h-full bg-slate-950 text-white overflow-hidden relative select-none" onContextMenu={(e) => e.preventDefault()}>
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
            <div className="flex flex-col gap-1 w-24 md:w-32">
              <label className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Card Size</label>
              <input
                type="range"
                min="0.5"
                max="1.5"
                step="0.01"
                value={cardScale}
                onChange={(e) => setCardScale(parseFloat(e.target.value))}
                className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
              />
            </div>
          </div>

          <div className="flex items-center gap-6">
            {!activePack ? (
              <div className="text-sm font-bold text-amber-500 animate-pulse uppercase tracking-wider">Waiting...</div>
            ) : (
              <div className="text-4xl font-mono text-emerald-400 font-bold drop-shadow-[0_0_10px_rgba(52,211,153,0.5)]">
                00:{timer < 10 ? `0${timer}` : timer}
              </div>
            )}
            {onExit && (
              <button
                onClick={() => setConfirmExitOpen(true)}
                className="p-3 bg-slate-800 hover:bg-red-500/20 text-slate-400 hover:text-red-500 border border-slate-700 hover:border-red-500/50 rounded-xl transition-all shadow-lg group"
                title="Exit to Lobby"
              >
                <LogOut className="w-5 h-5 group-hover:scale-110 transition-transform" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Middle Content: Zoom Sidebar + Pack Grid */}
      <div className="flex-1 flex overflow-hidden">

        {/* Dedicated Zoom Zone (Left Sidebar) */}
        <div className="hidden lg:flex w-80 shrink-0 flex-col items-center justify-start pt-8 border-r border-slate-800/50 bg-slate-900/20 backdrop-blur-sm z-10 transition-all" style={{ perspective: '1000px' }}>
          <div className="w-full relative sticky top-8 px-6">
            <div
              className="relative w-full aspect-[2.5/3.5] transition-all duration-300 ease-in-out"
              style={{
                transformStyle: 'preserve-3d',
                transform: hoveredCard ? 'rotateY(0deg)' : 'rotateY(180deg)'
              }}
            >
              {/* Front Face (Hovered Card) */}
              <div
                className="absolute inset-0 w-full h-full bg-slate-900 rounded-xl"
                style={{ backfaceVisibility: 'hidden' }}
              >
                {(hoveredCard || displayCard) && (
                  <div className="w-full h-full flex flex-col bg-slate-900 rounded-xl relative overflow-hidden">
                    <img
                      src={(hoveredCard || displayCard).image || (hoveredCard || displayCard).image_uris?.normal || (hoveredCard || displayCard).card_faces?.[0]?.image_uris?.normal}
                      alt={(hoveredCard || displayCard).name}
                      className="w-full h-full object-cover rounded-xl shadow-2xl shadow-black ring-1 ring-white/10"
                    />
                    {/* Foil Overlay for Preview */}
                    {((hoveredCard || displayCard).finish === 'foil') && <FoilOverlay />}

                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent p-4 text-center z-20">
                      <h3 className="text-lg font-bold text-slate-200">{(hoveredCard || displayCard).name}</h3>
                      <p className="text-xs text-slate-300 uppercase tracking-wider mt-1">{(hoveredCard || displayCard).type_line}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Back Face (Card Back) */}
              <div
                className="absolute inset-0 w-full h-full rounded-xl shadow-2xl overflow-hidden bg-slate-900"
                style={{
                  backfaceVisibility: 'hidden',
                  transform: 'rotateY(180deg)'
                }}
              >
                <img
                  src="/images/back.jpg"
                  alt="Card Back"
                  className="w-full h-full object-cover"
                />
              </div>
            </div>

            {/* Oracle Text Box Below Card */}
            {(hoveredCard || displayCard)?.oracle_text && (
              <div className={`mt-6 text-xs text-slate-300 text-left bg-slate-900/80 backdrop-blur p-4 rounded-lg border border-slate-700 leading-relaxed transition-opacity duration-300 ${hoveredCard ? 'opacity-100' : 'opacity-0'}`}>
                {(hoveredCard || displayCard).oracle_text.split('\n').map((line: string, i: number) => <p key={i} className="mb-2 last:mb-0">{line}</p>)}
              </div>
            )}
          </div>
        </div>

        {/* Main Area: Current Pack OR Waiting State */}
        <div className="flex-1 overflow-y-auto p-4 z-0 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
          {!activePack ? (
            <div className="flex flex-col items-center justify-center min-h-full pb-10 fade-in animate-in duration-500">
              <div className="w-24 h-24 mb-6 relative">
                <div className="absolute inset-0 rounded-full border-4 border-slate-800"></div>
                <div className="absolute inset-0 rounded-full border-4 border-t-emerald-500 animate-spin"></div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <LogOut className="w-8 h-8 text-emerald-500 rotate-180" /> {/* Just a placeholder icon or similar */}
                </div>
              </div>
              <h2 className="text-3xl font-bold text-white mb-2">Waiting for next pack...</h2>
              <p className="text-slate-400">Your neighbor is selecting a card.</p>
              <div className="mt-8 flex gap-2">
                <div className="w-3 h-3 bg-emerald-500 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                <div className="w-3 h-3 bg-emerald-500 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                <div className="w-3 h-3 bg-emerald-500 rounded-full animate-bounce"></div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center min-h-full pb-10">
              <h3 className="text-center text-slate-500 uppercase tracking-[0.2em] text-xs font-bold mb-8">Select a Card</h3>
              <div className="flex flex-wrap justify-center gap-6 [perspective:1000px]">
                {activePack.cards.map((rawCard: any) => {
                  const card = normalizeCard(rawCard);
                  const isFoil = card.finish === 'foil';

                  return (
                    <div
                      key={card.id}
                      className="group relative transition-all duration-300 hover:scale-110 hover:-translate-y-4 hover:z-50 cursor-pointer"
                      style={{ width: `${14 * cardScale}rem` }}
                      onClick={() => handlePick(card.id)}
                      onMouseEnter={() => setHoveredCard(card)}
                      onMouseLeave={() => setHoveredCard(null)}
                    >
                      {/* Foil Glow Effect */}
                      {isFoil && <div className="absolute inset-0 -m-1 rounded-xl bg-purple-500 blur-md opacity-20 group-hover:opacity-60 transition-opacity duration-300 animate-pulse"></div>}

                      <div className={`relative w-full rounded-xl shadow-2xl shadow-black overflow-hidden bg-slate-900 ${isFoil ? 'ring-2 ring-purple-400/50' : 'group-hover:ring-2 ring-emerald-400/50'}`}>
                        <img
                          src={card.image}
                          alt={card.name}
                          className="w-full h-full object-cover relative z-10"
                        />
                        {isFoil && <FoilOverlay />}
                        {isFoil && <div className="absolute top-2 right-2 z-30 text-[10px] font-bold text-white bg-purple-600/80 px-1.5 rounded backdrop-blur-sm border border-white/20">FOIL</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
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
              className="relative group shrink-0 transition-all h-full flex items-center"
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
      <Modal
        isOpen={confirmExitOpen}
        onClose={() => setConfirmExitOpen(false)}
        title="Exit Draft?"
        message="Are you sure you want to exit the draft? You can rejoin later."
        type="warning"
        confirmLabel="Exit Draft"
        cancelLabel="Stay"
        onConfirm={onExit}
      />
    </div>
  );
};
