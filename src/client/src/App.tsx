import React, { useState } from 'react';
import { Layers, Box, Trophy } from 'lucide-react';
import { CubeManager } from './modules/cube/CubeManager';
import { TournamentManager } from './modules/tournament/TournamentManager';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'draft' | 'bracket'>('draft');

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 font-sans pb-20">
      <header className="bg-slate-800 border-b border-slate-700 p-4 sticky top-0 z-50 shadow-lg">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-purple-600 p-2 rounded-lg"><Layers className="w-6 h-6 text-white" /></div>
            <div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">MTG Peasant Drafter</h1>
              <p className="text-slate-400 text-xs uppercase tracking-wider">Pack Generator & Tournament Manager</p>
            </div>
          </div>

          <div className="flex bg-slate-900 rounded-lg p-1 border border-slate-700">
            <button
              onClick={() => setActiveTab('draft')}
              className={`px-4 py-2 rounded-md text-sm font-bold flex items-center gap-2 transition-all ${activeTab === 'draft' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              <Box className="w-4 h-4" /> Draft Management
            </button>
            <button
              onClick={() => setActiveTab('bracket')}
              className={`px-4 py-2 rounded-md text-sm font-bold flex items-center gap-2 transition-all ${activeTab === 'bracket' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              <Trophy className="w-4 h-4" /> Tournament / Bracket
            </button>
          </div>
        </div>
      </header>

      <main>
        {activeTab === 'draft' && <CubeManager />}
        {activeTab === 'bracket' && <TournamentManager />}
      </main>
    </div>
  );
};
