import React, { useState } from 'react';
import { Users } from 'lucide-react';

interface Match {
  id: number;
  p1: string;
  p2: string;
}

interface Bracket {
  round1: Match[];
  totalPlayers: number;
}

export const TournamentManager: React.FC = () => {
  const [playerInput, setPlayerInput] = useState('');
  const [bracket, setBracket] = useState<Bracket | null>(null);

  const shuffleArray = (array: any[]) => {
    let currentIndex = array.length, randomIndex;
    const newArray = [...array];
    while (currentIndex !== 0) {
      randomIndex = Math.floor(Math.random() * currentIndex);
      currentIndex--;
      [newArray[currentIndex], newArray[randomIndex]] = [newArray[randomIndex], newArray[currentIndex]];
    }
    return newArray;
  };

  const generateBracket = () => {
    if (!playerInput.trim()) return;
    const names = playerInput.split('\n').filter(n => n.trim() !== '').map(n => n.trim());
    if (names.length < 2) { alert("Enter at least 2 players."); return; }

    const shuffled = shuffleArray(names);
    const nextPowerOf2 = Math.pow(2, Math.ceil(Math.log2(shuffled.length)));
    const byesNeeded = nextPowerOf2 - shuffled.length;

    const fullRoster = [...shuffled];
    for (let i = 0; i < byesNeeded; i++) fullRoster.push("BYE");

    const pairings: Match[] = [];
    for (let i = 0; i < fullRoster.length; i += 2) {
      pairings.push({ id: i, p1: fullRoster[i], p2: fullRoster[i + 1] });
    }

    setBracket({ round1: pairings, totalPlayers: names.length });
  };

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6">
      <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 shadow-xl mb-8">
        <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <Users className="w-5 h-5 text-blue-400" /> Players
        </h2>
        <p className="text-sm text-slate-400 mb-2">Enter one name per line</p>
        <textarea
          className="w-full h-32 bg-slate-900 border border-slate-700 rounded-lg p-3 text-sm text-slate-300 focus:ring-2 focus:ring-blue-500 outline-none resize-none mb-4"
          placeholder={`Player 1\nPlayer 2...`}
          value={playerInput}
          onChange={(e) => setPlayerInput(e.target.value)}
        />
        <button
          onClick={generateBracket}
          className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-lg font-bold w-full md:w-auto transition-colors"
        >
          Generate Bracket
        </button>
      </div>

      {bracket && (
        <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 shadow-xl overflow-x-auto">
          <h3 className="text-lg font-bold text-white mb-6 border-b border-slate-700 pb-2">Round 1 (Single Elimination)</h3>
          <div className="flex flex-col gap-4 min-w-[300px]">
            {bracket.round1.map((match, i) => (
              <div key={i} className="bg-slate-900 border border-slate-700 rounded-lg p-4 flex flex-col gap-2 relative">
                <div className="absolute -left-3 top-1/2 w-3 h-px bg-slate-600"></div>
                <div className="flex justify-between items-center bg-slate-800/50 p-2 rounded border border-slate-700/50">
                  <span className={match.p1 === 'BYE' ? 'text-slate-500 italic' : 'font-bold text-white'}>{match.p1}</span>
                </div>
                <div className="text-xs text-center text-slate-500">VS</div>
                <div className="flex justify-between items-center bg-slate-800/50 p-2 rounded border border-slate-700/50">
                  <span className={match.p2 === 'BYE' ? 'text-slate-500 italic' : 'font-bold text-white'}>{match.p2}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
