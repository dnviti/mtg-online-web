import React, { useState } from 'react';
import { Layers, Box, Trophy, Users } from 'lucide-react';
import { CubeManager } from './modules/cube/CubeManager';
import { LobbyManager } from './modules/lobby/LobbyManager';

import { Pack } from './services/PackGeneratorService';
import { ToastProvider } from './components/Toast';
import { GlobalContextMenu } from './components/GlobalContextMenu';
import { ConfirmDialogProvider } from './components/ConfirmDialog';

import { PWAInstallPrompt } from './components/PWAInstallPrompt';
import { UserProvider, useUser } from './contexts/UserContext';
import { GameSocketProvider } from './contexts/GameSocketContext';
import { AuthModule } from './modules/auth/AuthModule';
import { ProfileModule } from './modules/profile/ProfileModule';

const MainLayout: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'draft' | 'bracket' | 'lobby' | 'profile'>(() => {
    const saved = localStorage.getItem('activeTab');
    return (saved as 'draft' | 'bracket' | 'lobby' | 'profile') || 'draft';
  });

  const { user } = useUser();

  const [generatedPacks, setGeneratedPacks] = useState<Pack[]>(() => {
    try {
      const saved = localStorage.getItem('generatedPacks');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      console.error("Failed to load packs from storage", e);
      return [];
    }
  });

  const [availableLands, setAvailableLands] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem('availableLands');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      console.error("Failed to load lands from storage", e);
      return [];
    }
  });

  React.useEffect(() => {
    localStorage.setItem('activeTab', activeTab);
  }, [activeTab]);

  React.useEffect(() => {
    try {
      // Optimiziation: Strip 'definition' (ScryfallCard) from cards to save huge amount of space
      // We only need the properties mapped to DraftCard for the UI and Game
      const optimizedPacks = generatedPacks.map(p => ({
        ...p,
        cards: p.cards.map(c => {
          const { definition, ...rest } = c;
          return rest;
        })
      }));
      localStorage.setItem('generatedPacks', JSON.stringify(optimizedPacks));
    } catch (e) {
      console.error("Failed to save packs to storage (Quota likely exceeded)", e);
    }
  }, [generatedPacks]);

  React.useEffect(() => {
    try {
      const optimizedLands = availableLands.map(l => {
        const { definition, ...rest } = l;
        return rest;
      });
      localStorage.setItem('availableLands', JSON.stringify(optimizedLands));
    } catch (e) {
      console.error("Failed to save lands to storage", e);
    }
  }, [availableLands]);

  return (
    <div className="h-screen flex flex-col bg-slate-900 text-slate-100 font-sans overflow-hidden">
      <header className="bg-slate-800 border-b border-slate-700 p-4 shrink-0 z-50 shadow-lg">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-purple-600 p-2 rounded-lg"><Layers className="w-6 h-6 text-white" /></div>
            <div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent flex items-center gap-2">
                MTGate
                <span className="px-1.5 py-0.5 rounded-md bg-purple-500/10 border border-purple-500/20 text-[10px] font-bold text-purple-400 tracking-wider shadow-[0_0_10px_rgba(168,85,247,0.1)]">PRE-ALPHA</span>
              </h1>
              <p className="text-slate-400 text-xs uppercase tracking-wider">Multiplayer Magic: The Gathering Simulator</p>
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
              onClick={() => setActiveTab('profile')}
              className={`px-3 md:px-4 py-2 rounded-md text-sm font-bold flex items-center gap-2 transition-all ${activeTab === 'profile' ? 'bg-pink-600 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              {user ? (
                <><span className="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center text-[10px]">{(user.username || '?').charAt(0).toUpperCase()}</span> <span className="hidden md:inline">{user.username || 'User'}</span></>
              ) : (
                <><Users className="w-4 h-4" /> <span className="hidden md:inline">Login</span></>
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-hidden relative">
        {activeTab === 'draft' && (
          <CubeManager
            packs={generatedPacks}
            setPacks={setGeneratedPacks}
            availableLands={availableLands}
            setAvailableLands={setAvailableLands}
            onGoToLobby={() => setActiveTab('lobby')}
          />
        )}
        {activeTab === 'lobby' && <LobbyManager generatedPacks={generatedPacks} availableLands={availableLands} />}

        {activeTab === 'profile' && (
          user ? <ProfileModule /> : <AuthModule onSuccess={() => { }} />
          // onSuccess could redirect to profile or just stay, state update will handle re-render
        )}
        {activeTab === 'bracket' && (
          <div className="flex flex-col items-center justify-center h-full text-slate-400">
            <Trophy className="w-16 h-16 mb-4 opacity-50" />
            <h2 className="text-xl font-bold">Tournament Manager</h2>
            <p>Tournaments are now managed within the Online Lobby.</p>
          </div>
        )}
      </main>

      <footer className="bg-slate-900 border-t border-slate-800 p-2 text-center text-xs text-slate-500 shrink-0">
        <p>
          Entire code generated by <span className="text-purple-400 font-medium">Antigravity</span>
        </p>
      </footer>
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <ToastProvider>
      <ConfirmDialogProvider>
        <UserProvider>
          <GameSocketProvider>
            <GlobalContextMenu />
            <PWAInstallPrompt />
            <MainLayout />
          </GameSocketProvider>
        </UserProvider>
      </ConfirmDialogProvider>
    </ToastProvider>
  );
};
