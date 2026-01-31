import React from 'react';
import { Trophy, Skull, RotateCcw, DoorOpen } from 'lucide-react';

interface GameOverScreenProps {
  winnerId?: string;
  winnerName?: string;
  currentPlayerId: string;
  endReason?: 'surrender' | 'life_loss' | 'deck_out' | 'poison' | 'draw';
  players: { id: string; name: string; life: number }[];
  onRematch: () => void;
  onExitToLobby: () => void;
}

export const GameOverScreen: React.FC<GameOverScreenProps> = ({
  winnerId,
  winnerName,
  currentPlayerId,
  endReason,
  players,
  onRematch,
  onExitToLobby
}) => {
  const isWinner = winnerId === currentPlayerId;
  const isDraw = endReason === 'draw' || !winnerId;

  const reasonText: Record<string, string> = {
    surrender: 'by surrender',
    life_loss: 'life reached 0',
    deck_out: 'library empty',
    poison: '10+ poison counters',
    draw: 'mutual agreement'
  };

  return (
    <div className="fixed inset-0 bg-black/90 z-[9999] flex items-center justify-center backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl p-8 max-w-lg w-full mx-4 text-center shadow-2xl">
        {/* Icon */}
        <div className={`w-24 h-24 mx-auto mb-6 rounded-full flex items-center justify-center ${
          isDraw ? 'bg-slate-700' : isWinner ? 'bg-gradient-to-br from-amber-500 to-yellow-600' : 'bg-gradient-to-br from-red-700 to-red-900'
        }`}>
          {isDraw ? (
            <span className="text-4xl">🤝</span>
          ) : isWinner ? (
            <Trophy className="w-12 h-12 text-white" />
          ) : (
            <Skull className="w-12 h-12 text-white" />
          )}
        </div>

        {/* Result */}
        <h1 className={`text-4xl font-black mb-2 ${
          isDraw ? 'text-slate-300' : isWinner ? 'text-amber-400' : 'text-red-400'
        }`}>
          {isDraw ? 'DRAW' : isWinner ? 'VICTORY!' : 'DEFEAT'}
        </h1>

        <p className="text-slate-400 mb-6">
          {isDraw
            ? 'The game ended in a draw'
            : `${winnerName || 'Unknown'} wins ${reasonText[endReason || 'life_loss'] || ''}`
          }
        </p>

        {/* Player Stats */}
        <div className="bg-slate-800/50 rounded-lg p-4 mb-6">
          <h3 className="text-sm text-slate-500 uppercase tracking-wider mb-3">Final Standings</h3>
          <div className="space-y-2">
            {players.map(player => (
              <div key={player.id} className={`flex justify-between items-center p-2 rounded ${
                player.id === winnerId ? 'bg-amber-500/10 border border-amber-500/30' : 'bg-slate-700/30'
              }`}>
                <span className={player.id === winnerId ? 'text-amber-400 font-bold' : 'text-slate-300'}>
                  {player.name}
                  {player.id === winnerId && ' 👑'}
                  {player.id === currentPlayerId && ' (You)'}
                </span>
                <span className={player.life <= 0 ? 'text-red-500' : 'text-emerald-400'}>
                  {player.life} life
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onRematch}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg transition-colors"
          >
            <RotateCcw className="w-5 h-5" />
            Rematch
          </button>
          <button
            onClick={onExitToLobby}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-slate-700 hover:bg-slate-600 text-white font-bold rounded-lg transition-colors"
          >
            <DoorOpen className="w-5 h-5" />
            Exit to Lobby
          </button>
        </div>
      </div>
    </div>
  );
};
