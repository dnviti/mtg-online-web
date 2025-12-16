import React, { useState } from 'react';
import { Layers, Box, Trophy, Users, Play } from 'lucide-react';
import { CubeManager } from './modules/cube/CubeManager';
import { TournamentManager } from './modules/tournament/TournamentManager';
import { LobbyManager } from './modules/lobby/LobbyManager';
import { DeckTester } from './modules/tester/DeckTester';
import { Pack } from './services/PackGeneratorService';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'draft' | 'bracket' | 'lobby' | 'tester'>(() => {
    const saved = localStorage.getItem('activeTab');
    return (saved as 'draft' | 'bracket' | 'lobby' | 'tester') || 'draft';
  });

  const [generatedPacks, setGeneratedPacks] = useState<Pack[]>(() => {
    try {
      const saved = localStorage.getItem('generatedPacks');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      console.error("Failed to load packs from storage", e);
      return [];
    }
  });

  React.useEffect(() => {
    localStorage.setItem('activeTab', activeTab);
  }, [activeTab]);

  React.useEffect(() => {
    try {
      localStorage.setItem('generatedPacks', JSON.stringify(generatedPacks));
    } catch (e) {
      console.error("Failed to save packs to storage", e);
    }
  }, [generatedPacks]);

  return (
    <div className="h-screen flex flex-col bg-slate-900 text-slate-100 font-sans overflow-hidden">
      <header className="bg-slate-800 border-b border-slate-700 p-4 shrink-0 z-50 shadow-lg">
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
              className={`px-3 md:px-4 py-2 rounded-md text-sm font-bold flex items-center gap-2 transition-all ${activeTab === 'draft' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              <Box className="w-4 h-4" /> <span className="hidden md:inline">Draft Management</span>
            </button>
            <button
              onClick={() => setActiveTab('lobby')}
              className={`px-3 md:px-4 py-2 rounded-md text-sm font-bold flex items-center gap-2 transition-all ${activeTab === 'lobby' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              <Users className="w-4 h-4" /> <span className="hidden md:inline">Online Lobby</span>
            </button>
            <button
              onClick={() => setActiveTab('tester')}
              className={`px-3 md:px-4 py-2 rounded-md text-sm font-bold flex items-center gap-2 transition-all ${activeTab === 'tester' ? 'bg-teal-600 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              <Play className="w-4 h-4" /> <span className="hidden md:inline">Deck Tester</span>
            </button>
            <button
              onClick={() => setActiveTab('bracket')}
              className={`px-3 md:px-4 py-2 rounded-md text-sm font-bold flex items-center gap-2 transition-all ${activeTab === 'bracket' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              <Trophy className="w-4 h-4" /> <span className="hidden md:inline">Tournament</span>
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-hidden relative">
        {activeTab === 'draft' && (
          <CubeManager
            packs={generatedPacks}
            setPacks={setGeneratedPacks}
            onGoToLobby={() => setActiveTab('lobby')}
          />
        )}
        {activeTab === 'lobby' && <LobbyManager generatedPacks={generatedPacks} />}
        {activeTab === 'tester' && <DeckTester />}
        {activeTab === 'bracket' && <TournamentManager />}
      </main>
    </div>
  );
};
