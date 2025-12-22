import React from 'react';
import { Trophy, Play } from 'lucide-react';
import { socketService } from '../../services/SocketService';

interface TournamentPlayer {
  id: string;
  name: string;
  isBot: boolean;
}

interface Match {
  id: string;
  round: number;
  matchIndex: number;
  player1: TournamentPlayer | null;
  player2: TournamentPlayer | null;
  winnerId?: string;
  status: 'pending' | 'ready' | 'in_progress' | 'finished';
}

interface Tournament {
  id: string;
  players: TournamentPlayer[];
  rounds: Match[][];
  currentRound: number;
  status: 'setup' | 'active' | 'finished';
  winner?: TournamentPlayer;
}

interface TournamentManagerProps {
  tournament: Tournament;
  currentPlayerId: string;
  onJoinMatch: (matchId: string) => void;
}

export const TournamentManager: React.FC<TournamentManagerProps> = ({ tournament, currentPlayerId, onJoinMatch }) => {
  const { rounds, winner } = tournament;

  const handleJoinMatch = (matchId: string) => {
    socketService.socket.emit('join_match', { matchId }, (response: any) => {
      if (!response.success) {
        console.error(response.message);
        // Ideally show toast
        alert(response.message); // Fallback
      } else {
        onJoinMatch(matchId);
      }
    });
  };

  return (
    <div className="h-full overflow-y-auto max-w-6xl mx-auto p-4 md:p-6 text-slate-100">

      {/* Header */}
      <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 shadow-xl mb-8 flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <Trophy className="w-6 h-6 text-yellow-500" /> Tournament Bracket
          </h2>
          <p className="text-slate-400 text-sm mt-1">Round {tournament.currentRound}</p>
        </div>
        {winner && (
          <div className="bg-yellow-500/20 border border-yellow-500 text-yellow-200 px-6 py-3 rounded-xl flex items-center gap-3 animate-pulse">
            <Trophy className="w-8 h-8" />
            <div>
              <div className="text-xs uppercase font-bold tracking-wider">Winner</div>
              <div className="text-xl font-bold">{winner.name}</div>
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-8 overflow-x-auto pb-8 snap-x">
        {rounds.map((roundMatches, roundIndex) => (
          <div key={roundIndex} className="flex flex-col justify-center gap-16 min-w-[280px] snap-center">
            <h3 className="text-center font-bold text-slate-500 uppercase tracking-widest text-sm mb-4">
              {roundIndex === rounds.length - 1 ? "Finals" : `Round ${roundIndex + 1}`}
            </h3>
            <div className="flex flex-col gap-8 justify-center flex-1">
              {roundMatches.map((match) => {
                const isMyMatch = (match.player1?.id === currentPlayerId || match.player2?.id === currentPlayerId);
                const isPlayable = isMyMatch && match.status === 'ready' && !match.winnerId;

                return (
                  <div key={match.id} className={`bg-slate-900 border ${isMyMatch ? 'border-blue-500 ring-1 ring-blue-500/50' : 'border-slate-700'} rounded-lg p-0 overflow-hidden relative shadow-lg`}>
                    {/* Status Indicator */}
                    {match.status === 'in_progress' && <div className="absolute top-0 right-0 bg-green-500 text-xs text-black font-bold px-2 py-0.5">LIVE</div>}

                    <div className={`p-3 border-b border-slate-800 flex justify-between items-center ${match.winnerId === match.player1?.id ? 'bg-emerald-900/30' : ''}`}>
                      <span className={match.player1 ? 'font-bold' : 'text-slate-600 italic'}>
                        {match.player1 ? match.player1.name : 'Waiting...'}
                      </span>
                      {match.winnerId === match.player1?.id && <Trophy className="w-4 h-4 text-emerald-500" />}
                    </div>
                    <div className={`p-3 flex justify-between items-center ${match.winnerId === match.player2?.id ? 'bg-emerald-900/30' : ''}`}>
                      <span className={match.player2 ? 'font-bold' : 'text-slate-600 italic'}>
                        {match.player2 ? match.player2.name : 'Waiting...'}
                      </span>
                      {match.winnerId === match.player2?.id && <Trophy className="w-4 h-4 text-emerald-500" />}
                    </div>

                    {isPlayable && (
                      <button
                        onClick={() => handleJoinMatch(match.id)}
                        className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 flex items-center justify-center gap-2 transition-colors"
                      >
                        <Play className="w-4 h-4" /> Play Match
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
