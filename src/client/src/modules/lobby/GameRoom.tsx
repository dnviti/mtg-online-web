import React, { useState, useEffect, useRef } from 'react';
import { useGameContext } from '../../contexts/GameSocketContext';
import { socketService } from '../../services/SocketService';
import { Users, LogOut, Copy, Check, MessageSquare, Send, Bell, BellOff, X, Layers, Swords, ScrollText, Loader2, Bug } from 'lucide-react';
import { Modal } from '../../components/Modal';
import { useToast } from '../../components/Toast';
import { GameLogProvider, useGameLog } from '../../contexts/GameLogContext';
import { GameView } from '../game/GameView';
import { GameLogPanel } from '../../components/GameLogPanel';
import { DebugPanel } from '../../components/DebugPanel';
import { DebugProvider } from '../../contexts/DebugContext';
import { DraftView } from '../draft/DraftView';
import { TournamentManager as TournamentView } from '../tournament/TournamentManager';
import { DeckBuilderView } from '../draft/DeckBuilderView';
import { DeckSelectionModal } from '../../components/DeckSelectionModal';

interface Player {
  id: string;
  name: string;
  isHost: boolean;
  role: 'player' | 'spectator';
  isOffline?: boolean;
}

interface ChatMessage {
  id: string;
  sender: string;
  text: string;
  timestamp: string;
}

interface Room {
  id: string;
  hostId: string;
  players: Player[];
  basicLands?: any[];
  status: string;
  messages: ChatMessage[];
  format?: string;
  tournament?: any;
  packs?: any[];
}

interface GameRoomProps {
  room?: any; // Kept for partial compatibility but ignored
  currentPlayerId: string;
  onExit: () => void;
  initialGameState?: any; // Deprecated
  initialDraftState?: any; // Deprecated
}

const GameRoomContent: React.FC<GameRoomProps> = ({ currentPlayerId, onExit }) => {
  // Context
  const { activeRoom, gameState, draftState } = useGameContext();

  // Cast activeRoom to Room interface. Fallback should rarely happen if Lobby calls this correctly.
  // Ensure required arrays are always initialized to prevent undefined errors
  const room = (activeRoom as Room) || { players: [], messages: [], id: 'Error', status: 'error', hostId: 'system' } as Room;

  // Defensive: ensure arrays are always defined even if data is corrupted
  if (!Array.isArray(room.players)) room.players = [];
  if (!Array.isArray(room.messages)) room.messages = [];
  if (!Array.isArray(room.packs)) room.packs = [];

  // State
  const [modalOpen, setModalOpen] = useState(false);
  const [modalConfig, setModalConfig] = useState<{
    title: string;
    message: string;
    type: 'info' | 'error' | 'warning' | 'success';
    confirmLabel?: string;
    onConfirm?: () => void;
    cancelLabel?: string;
    onClose?: () => void;
  }>({ title: '', message: '', type: 'info' });

  // Side Panel State
  const [activePanel, setActivePanel] = useState<'lobby' | 'chat' | 'log' | 'debug' | null>(null);

  // Debug mode check (via Vite env)
  const debugEnabled = import.meta.env.VITE_DEV_MODE === 'true';
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => {
    return localStorage.getItem('notifications_enabled') !== 'false';
  });

  // Card preview from game log hover
  const [logHoveredCard, setLogHoveredCard] = useState<{ name: string; imageUrl?: string; imageArtCrop?: string; manaCost?: string; typeLine?: string; oracleText?: string } | null>(null);

  // Services
  const { showToast } = useToast();
  const { addLog, addLogs, syncLogs } = useGameLog();
  // const { confirm } = useConfirm(); // Unused

  // Local Chat / UI State
  const [message, setMessage] = useState('');
  const messages = room.messages || [];
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Tournament State (kept local as it listens to specific events not yet in central hook state, or maybe it is?)
  // Actually, if 'activeRoom.tournament' updates via room_update, we don't need this state either!
  // But let's check: LobbyManager.tsx doesn't seem to update tournament info actively via hook unless room_update sends it.
  // Assuming room_update includes full room with tournament data.
  // const tournamentState = room.tournament || null; // Unused
  // Previously we had 'setTournamentState' and listened to 'tournament_update'.
  // If we remove the listener, we rely on 'room_update'.
  // Does backend send 'room_update' on tournament changes? Likely yes, if room object changes.
  // BUT: 'tournament_update' might be a separate incremental update.
  // To be safe, let's keep a local tournamentState override? 
  // Consolidating: Adding tournament to useGameSocket would be best.
  // For now: I will keep listener but update LOCAL state, initializing from room.
  const [localTournamentState, setLocalTournamentState] = useState<any>(room.tournament || null);

  useEffect(() => {
    if (room.tournament) {
      setLocalTournamentState(room.tournament);
    } else if (room.status === 'tournament' && !localTournamentState) {
      // Fallback: Fetch tournament state explicitly if missing
      socketService.socket.emit('get_tournament_state', { roomId: room.id }, (response: any) => {
        if (response.success && response.tournament) {
          setLocalTournamentState(response.tournament);
        } else {
          console.error("Failed to load tournament state:", response.message);
          showToast("Failed to load tournament. Please try refreshing.", 'error');
        }
      });
    }
  }, [room.tournament, room.status, room.id, localTournamentState, showToast]);

  // Game Start Notification
  useEffect(() => {
    if (gameState && gameState.turnCount === 1 && gameState.step === 'mulligan') {
      // Debounce or check checking logic might be needed if this rerenders often, but toast handles dups usually.
      // Actually, better to limit it. useGameSocket might update gameState multiple times.
      // Let's rely on match_start event if possible, OR just use a ref to track if we showed start toast.
    }
  }, [gameState]);

  const hasShownStartToast = useRef(false);
  useEffect(() => {
    if (gameState && !hasShownStartToast.current) {
      hasShownStartToast.current = true;
      const activePlayerName = gameState.players[gameState.activePlayerId || '']?.name || 'Player';
      showToast(`Game is starting! (${activePlayerName}'s Turn)`, 'game-event', 5000);
    } else if (!gameState) {
      hasShownStartToast.current = false;
    }
  }, [gameState, showToast]);

  const [preparingMatchId, setPreparingMatchId] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<'game' | 'chat'>('game');

  // Deck Selection Modal State
  const [isDeckSelectionOpen, setIsDeckSelectionOpen] = useState(false);
  const [selectedDeckCards, setSelectedDeckCards] = useState<any[]>([]);

  // Open deck selection automatically if constructed and just started
  useEffect(() => {
    // Robust check: It is Limited if format says so OR if there are packs involved
    const isLimited = room.format === 'draft' || (room.packs && room.packs.length > 0);

    if (room.status === 'deck_building' && !isLimited) {
      const me = room.players.find(p => p.id === currentPlayerId);
      // 'ready' might be on player object in room
      const isReady = (me as any)?.ready;
      if (me && !isReady && selectedDeckCards.length === 0) {
        setIsDeckSelectionOpen(true);
      }
    }
  }, [room.status, room.format, room.packs, currentPlayerId, room.players, selectedDeckCards.length]);

  // Derived State
  const host = room.players.find(p => p.isHost);
  const isHostOffline = host?.isOffline;
  const isMeHost = currentPlayerId === host?.id;
  const prevPlayersRef = useRef<Player[]>(room.players); // Initialize with current

  // Persistence
  useEffect(() => {
    localStorage.setItem('notifications_enabled', notificationsEnabled.toString());
  }, [notificationsEnabled]);

  // Player Notification Logic
  useEffect(() => {
    if (!notificationsEnabled) {
      prevPlayersRef.current = room.players;
      return;
    }

    const prev = prevPlayersRef.current;
    const curr = room.players;

    // 1. New Players
    curr.forEach(p => {
      if (!prev.find(old => old.id === p.id)) {
        showToast(`${p.name} (${p.role}) joined the room.`, 'info');
      }
    });

    // 2. Left Players
    prev.forEach(p => {
      if (!curr.find(newP => newP.id === p.id)) {
        showToast(`${p.name} left the room.`, 'warning');
      }
    });

    // 3. Status Changes (Disconnect/Reconnect)
    curr.forEach(p => {
      const old = prev.find(o => o.id === p.id);
      if (old) {
        if (!old.isOffline && p.isOffline) {
          showToast(`${p.name} lost connection.`, 'error');
        }
        if (old.isOffline && !p.isOffline) {
          showToast(`${p.name} reconnected!`, 'success');
        }
      }
    });

    prevPlayersRef.current = curr;
  }, [room.players, notificationsEnabled, showToast]);

  // Handle kicked and room_closed events
  useEffect(() => {
    const socket = socketService.socket;
    const onKicked = () => {
      setModalConfig({
        title: 'Kicked',
        message: 'You have been kicked from the room.',
        type: 'error',
        confirmLabel: 'Back to Lobby',
        onConfirm: () => onExit()
      });
      setModalOpen(true);
    };
    const onRoomClosed = (data: { message: string }) => {
      setModalConfig({
        title: 'Room Closed',
        message: data.message || 'The host has closed this room.',
        type: 'warning',
        confirmLabel: 'Back to Lobby',
        onConfirm: () => onExit()
      });
      setModalOpen(true);
    };
    socket.on('kicked', onKicked);
    socket.on('room_closed', onRoomClosed);
    return () => {
      socket.off('kicked', onKicked);
      socket.off('room_closed', onRoomClosed);
    };
  }, [onExit]);

  // Scroll to bottom of chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Socket Listeners (Exceptions not covered by hook yet)
  useEffect(() => {
    const socket = socketService.socket;

    const handleDraftError = (error: { message: string }) => {
      setModalConfig({
        title: 'Error',
        message: error.message,
        type: 'error'
      });
      setModalOpen(true);
    };

    const handleTournamentUpdate = (data: any) => {
      setLocalTournamentState(data);
    };

    const handleTournamentFinished = (data: any) => {
      showToast(`Tournament Winner: ${data.winner.name}!`, 'success');
    };

    socket.on('draft_error', handleDraftError);
    socket.on('tournament_update', handleTournamentUpdate);
    socket.on('tournament_finished', handleTournamentFinished);

    socket.on('match_start', () => {
      setPreparingMatchId(null);
    });

    return () => {
      socket.off('draft_error', handleDraftError);
      socket.off('tournament_update', handleTournamentUpdate);
      socket.off('tournament_finished', handleTournamentFinished);
      socket.off('match_start');
    };
  }, [showToast]);

  // Game Error Handling (using Context or specialized listener)
  useEffect(() => {
    // If context error changes, show it?
    // But socketError in context is a string. GameToast expects string.
    // However, socketService emits 'game_error' objects sometimes.
    // Let's keep the specific listener for now to get rich error objects.
    const socket = socketService.socket;
    const handleGameError = (data: { message: string, userId?: string }) => {
      if (data.userId && data.userId !== currentPlayerId) return;
      showToast(data.message, 'error');
      addLog(data.message, 'error', 'System');
    };

    const handleGameNotification = (data: { message: string, type?: 'info' | 'success' | 'warning' | 'error' }) => {
      showToast(data.message, data.type || 'info');
      let source = 'System';
      if (data.message.includes('turn')) source = 'Game';
      addLog(data.message, (data.type as any) || 'info', source);
    };

    // Handle game log events from the server (card movements, combat, etc.)
    const handleGameLog = (data: { logs: Array<{
      id: string;
      timestamp: number;
      message: string;
      type: 'info' | 'action' | 'combat' | 'error' | 'success' | 'warning' | 'zone';
      source: string;
      cards?: Array<{ name: string; imageUrl?: string; imageArtCrop?: string; manaCost?: string; typeLine?: string; oracleText?: string }>;
    }> }) => {
      addLogs(data.logs);
    };

    socket.on('game_error', handleGameError);
    socket.on('game_notification', handleGameNotification);
    socket.on('game_log', handleGameLog);
    return () => {
      socket.off('game_error', handleGameError);
      socket.off('game_notification', handleGameNotification);
      socket.off('game_log', handleGameLog);
    };
  }, [currentPlayerId, showToast, addLog, addLogs]);

  // Sync logs from game state on initial load or reconnection
  useEffect(() => {
    if (gameState?.logs && gameState.logs.length > 0) {
      syncLogs(gameState.logs);
    }
  }, [gameState?.id, syncLogs]); // Only sync when game ID changes (new game or reconnect)

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;

    const me = room.players.find(p => p.id === currentPlayerId);
    socketService.socket.emit('send_message', {
      roomId: room.id,
      sender: me?.name || 'Unknown',
      text: message
    });
    setMessage('');
  };

  const copyRoomId = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(room.id).catch(err => {
        console.error('Failed to copy: ', err);
      });
    } else {
      // Fallback
      const textArea = document.createElement("textarea");
      textArea.value = room.id;
      document.body.appendChild(textArea);
      textArea.select();
      try { document.execCommand('copy'); } catch (err) { console.error(err); }
      document.body.removeChild(textArea);
    }
  };

  const handleStartDraft = () => {
    socketService.socket.emit('start_draft', { roomId: room.id });
  };

  const renderContent = () => {
    if (gameState) {
      return <GameView gameState={gameState} currentPlayerId={currentPlayerId} format={room.format} logHoveredCard={logHoveredCard} />;
    }

    // Explicit check for playing status to show loader instead of lobby
    if (room.status === 'playing' && !gameState) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center bg-slate-800 text-slate-400">
          <Loader2 className="w-10 h-10 animate-spin mb-4 text-blue-500" />
          <p>Reconnecting to Game...</p>
        </div>
      );
    }

    if (room.status === 'drafting') {
      if (draftState) {
        return <DraftView draftState={draftState} roomId={room.id} currentPlayerId={currentPlayerId} onExit={onExit} />;
      }
      return (
        <div className="flex-1 flex flex-col items-center justify-center bg-slate-800 text-slate-400">
          <Loader2 className="w-10 h-10 animate-spin mb-4 text-purple-500" />
          <p>Restoring Draft State...</p>
        </div>
      );
    }

    if (room.status === 'deck_building') {
      const me = room.players.find(p => p.id === currentPlayerId) as any;
      if (me?.ready) {
        return (
          <div className="flex-1 bg-slate-800 rounded-xl p-6 border border-slate-700 shadow-xl flex flex-col items-center justify-center">
            <h2 className="text-3xl font-bold text-white mb-4">Deck Submitted</h2>
            <div className="animate-pulse bg-slate-700 w-16 h-16 rounded-full flex items-center justify-center mb-6">
              <Check className="w-8 h-8 text-emerald-500" />
            </div>
            <p className="text-slate-400 text-lg">Waiting for other players to finish deck building...</p>
            <div className="mt-8">
              <h3 className="text-sm font-bold text-slate-500 uppercase mb-4 text-center">Players Ready</h3>
              <div className="flex flex-wrap justify-center gap-4">
                {room.players.filter(p => p.role === 'player').map(p => {
                  const isReady = (p as any).ready;
                  return (
                    <div key={p.id} className={`flex items-center gap-2 px-4 py-2 rounded-lg border ${isReady ? 'bg-emerald-900/30 border-emerald-500/50' : 'bg-slate-700/30 border-slate-700'}`}>
                      <div className={`w-2 h-2 rounded-full ${isReady ? 'bg-emerald-500' : 'bg-slate-600'}`}></div>
                      <span className={isReady ? 'text-emerald-200' : 'text-slate-500'}>{p.name}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      }

      const myPool = draftState?.players[currentPlayerId]?.pool || (room.players.find(p => p.id === currentPlayerId) as any)?.pool || [];
      const isLimited = room.format === 'draft' || (room.packs && room.packs.length > 0);



      return <DeckBuilderView
        roomId={room.id}
        currentPlayerId={currentPlayerId}
        initialPool={myPool}
        availableBasicLands={room.basicLands}
        isConstructed={!isLimited}
        initialDeck={selectedDeckCards.length > 0 ? selectedDeckCards : me?.deck || []}
        format={room.format}
      />;
    }

    if (room.status === 'tournament') {
      if (localTournamentState) {
        if (preparingMatchId) {
          const myTournamentPlayer = localTournamentState.players.find((p: any) => p.id === currentPlayerId);
          const myPool = draftState?.players[currentPlayerId]?.pool || (room.players.find(p => p.id === currentPlayerId) as any)?.pool || [];
          const myDeck = myTournamentPlayer?.deck || [];

          return <DeckBuilderView
            roomId={room.id}
            currentPlayerId={currentPlayerId}
            initialPool={myPool}
            initialDeck={myDeck}
            availableBasicLands={room.basicLands}
            onSubmit={(deck) => {
              socketService.socket.emit('match_ready', { matchId: preparingMatchId, deck });
              setPreparingMatchId(null);
              showToast("Deck ready! Waiting for game to start...", 'success');
            }}
            submitLabel="Ready for Match"
            format={room.format}
          />;
        }
        return <TournamentView tournament={localTournamentState} currentPlayerId={currentPlayerId} onJoinMatch={setPreparingMatchId} />;
      }
      return (
        <div className="flex-1 flex flex-col items-center justify-center bg-slate-800 text-slate-400">
          <Loader2 className="w-10 h-10 animate-spin mb-4 text-yellow-500" />
          <p>Loading Tournament...</p>
        </div>
      );
    }

    return (
      <div className="flex-1 bg-slate-800 rounded-xl p-6 border border-slate-700 shadow-xl flex flex-col items-center justify-center">
        <div className="mb-6 flex flex-col items-center gap-2">
          <h2 className="text-3xl font-bold text-white">Waiting for Players...</h2>
          {isMeHost && room.format !== 'draft' ? (
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Format:</span>
              <select
                value={room.format || 'commander'}
                onChange={(e) => {
                  socketService.socket.emit('update_room_format', { roomId: room.id, format: e.target.value }, (response: any) => {
                    if (!response.success) {
                      showToast(response.message || 'Failed to update format', 'error');
                    }
                  });
                }}
                className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-1 text-sm font-bold text-emerald-400 focus:ring-2 focus:ring-purple-500 outline-none"
              >
                <option value="commander">Commander (EDH)</option>
                <option value="standard">Standard</option>
                <option value="modern">Modern</option>
                <option value="pioneer">Pioneer</option>
                <option value="legacy">Legacy</option>
                <option value="vintage">Vintage</option>
                <option value="pauper">Pauper</option>
              </select>
            </div>
          ) : room.format && (
            <div className="px-3 py-1 bg-slate-700 border border-slate-600 rounded-full text-xs font-bold text-slate-300 uppercase tracking-widest">
              Format: <span className="text-emerald-400">{room.format}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-4 bg-slate-900 px-6 py-3 rounded-xl border border-slate-700">
          <span className="text-slate-400 uppercase text-xs font-bold tracking-wider">Room Code</span>
          <code className="text-2xl font-mono text-emerald-400 font-bold tracking-widest">{room.id}</code>
          <button onClick={copyRoomId} className="p-2 text-slate-400 hover:text-white transition-colors" title="Copy Code">
            <Copy className="w-5 h-5" />
          </button>
        </div>

        <div className="mt-8 text-center text-slate-400">
          <p>Share the code with your friends to join.</p>
          <p className="text-sm mt-2">
            <span className="text-emerald-400 font-bold">{room.players.filter(p => p.role === 'player').length}</span> / 8 Players Joined
          </p>
          <p className="text-xs mt-1 text-slate-500">
            {room.players.length} total connected (including spectators)
          </p>
        </div>

        {isMeHost && (
          <div className="flex flex-col gap-2 mt-8">
            <button
              onClick={handleStartDraft}
              disabled={room.status !== 'waiting'}
              className="px-8 py-3 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-lg flex items-center gap-2 shadow-lg shadow-purple-900/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {room.format === 'draft' ? <Layers className="w-5 h-5" /> : <Swords className="w-5 h-5" />}
              {room.format === 'draft' ? 'Start Draft' : 'Start Game'}
            </button>
            <button
              onClick={() => {
                setModalConfig({
                  title: 'Close Room',
                  message: 'Are you sure you want to permanently close this room? This action cannot be undone and the room will be kept only for history.',
                  type: 'warning',
                  confirmLabel: 'Close Room',
                  cancelLabel: 'Cancel',
                  onConfirm: () => {
                    socketService.socket.emit('close_room', { roomId: room.id, playerId: currentPlayerId }, (response: any) => {
                      if (response.success) {
                        showToast('Room closed successfully', 'success');
                        onExit();
                      } else {
                        showToast(response.message || 'Failed to close room', 'error');
                      }
                    });
                  }
                });
                setModalOpen(true);
              }}
              className="px-8 py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg flex items-center gap-2 shadow-lg shadow-red-900/20 transition-all"
            >
              <X className="w-5 h-5" /> Close Room
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex h-full w-full overflow-hidden relative">
      {/* ... Mobile Layout Omitted for brevity? NO, must include full file ... */}
      {/* Copied from previous view_file output, heavily simplified for brevity in thought, but must write FULL content */}
      {/* --- MOBILE LAYOUT --- */}
      <div className="lg:hidden flex flex-col w-full h-full">
        <div className="shrink-0 flex items-center bg-slate-800 border-b border-slate-700">
          <button onClick={() => setMobileTab('game')} className={`flex-1 p-3 flex items-center justify-center gap-2 text-sm font-bold transition-colors ${mobileTab === 'game' ? 'text-emerald-400 bg-slate-700/50 border-b-2 border-emerald-500' : 'text-slate-400 hover:text-slate-200'}`}>
            <Layers className="w-4 h-4" /> Game
          </button>
          <button onClick={() => setMobileTab('chat')} className={`flex-1 p-3 flex items-center justify-center gap-2 text-sm font-bold transition-colors ${mobileTab === 'chat' ? 'text-purple-400 bg-slate-700/50 border-b-2 border-purple-500' : 'text-slate-400 hover:text-slate-200'}`}>
            <div className="flex items-center gap-1"><Users className="w-4 h-4" /><span className="text-slate-600">/</span><MessageSquare className="w-4 h-4" /></div> Lobby & Chat
          </button>
        </div>
        <div className="flex-1 min-h-0 relative">
          {mobileTab === 'game' ? renderContent() : (
            <div className="absolute inset-0 overflow-y-auto p-4 bg-slate-900">
              <div className="space-y-4">
                <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
                  <h3 className="text-sm font-bold text-slate-400 uppercase mb-3 flex items-center gap-2"><Users className="w-4 h-4" /> Lobby</h3>
                  {room.players.map(p => (
                    <div key={p.id} className="flex items-center justify-between bg-slate-900/50 p-2 rounded mb-2 text-sm">
                      <span className={p.id === currentPlayerId ? 'text-white font-bold' : 'text-slate-300'}>{p.name}</span>
                      <span className="text-[10px] text-slate-500">{p.role}</span>
                    </div>
                  ))}
                </div>
                <div className="bg-slate-800 rounded-xl p-4 border border-slate-700 h-96 flex flex-col">
                  <h3 className="text-sm font-bold text-slate-400 uppercase mb-3"><MessageSquare className="w-4 h-4 inline mr-2" /> Chat</h3>
                  <div className="flex-1 overflow-y-auto mb-2 space-y-2">
                    {messages.map(msg => (
                      <div key={msg.id} className="text-sm"><span className="font-bold text-purple-400">{msg.sender}:</span> <span className="text-slate-300">{msg.text}</span></div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                  <form onSubmit={sendMessage} className="flex gap-2">
                    <input type="text" value={message} onChange={e => setMessage(e.target.value)} className="flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm text-white" placeholder="Type..." />
                    <button type="submit" className="bg-purple-600 rounded px-3 py-1 text-white"><Send className="w-4 h-4" /></button>
                  </form>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* --- DESKTOP LAYOUT --- */}
      <div className="hidden lg:flex flex-1 min-w-0 flex-col h-full relative z-0">
        {renderContent()}
      </div>

      <div className="hidden lg:flex w-14 shrink-0 flex-col items-center gap-4 py-4 bg-slate-900 border-l border-slate-800 z-30 relative">
        {(['lobby', 'chat', 'log'] as const).map(panel => (
          <button key={panel} onClick={() => setActivePanel(activePanel === panel ? null : panel)}
            className={`p-3 rounded-xl transition-all duration-200 group relative ${activePanel === panel ?
              (panel === 'lobby' ? 'bg-purple-600 shadow-purple-900/50' : panel === 'chat' ? 'bg-blue-600 shadow-blue-900/50' : 'bg-emerald-600 shadow-emerald-900/50') + ' text-white shadow-lg'
              : 'text-slate-500 hover:bg-slate-800 hover:text-white'}`}
          >
            {panel === 'lobby' && <Users className="w-6 h-6" />}
            {panel === 'chat' && <MessageSquare className="w-6 h-6" />}
            {panel === 'log' && <ScrollText className="w-6 h-6" />}
          </button>
        ))}

        {/* Debug Panel Button - Only visible in dev mode */}
        {debugEnabled && (
          <button
            onClick={() => setActivePanel(activePanel === 'debug' ? null : 'debug')}
            className={`p-3 rounded-xl transition-all duration-200 group relative ${
              activePanel === 'debug'
                ? 'bg-cyan-600 shadow-cyan-900/50 text-white shadow-lg'
                : 'text-slate-500 hover:bg-slate-800 hover:text-white'
            }`}
            title="Debug Panel"
          >
            <Bug className="w-6 h-6" />
          </button>
        )}
      </div>

      {activePanel && (
        <div className="hidden lg:flex absolute right-16 top-4 bottom-80 w-96 bg-slate-800/95 backdrop-blur-xl border border-slate-700/50 rounded-2xl shadow-2xl z-40 flex-col overflow-hidden">
          <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-900/50">
            <h3 className="text-lg font-bold text-white uppercase">{activePanel}</h3>
            <button onClick={() => setActivePanel(null)}><X className="w-5 h-5 text-slate-400 hover:text-white" /></button>
          </div>

          {activePanel === 'lobby' && (
            <div className="flex-1 flex flex-col min-h-0">
              <div className="p-3 bg-slate-900/30 flex justify-between items-center border-b border-slate-800">
                <span className="text-xs font-bold text-slate-500">{room.players.length} Connected</span>
                <button onClick={() => setNotificationsEnabled(!notificationsEnabled)} className="text-xs font-bold text-slate-400">
                  {notificationsEnabled ? <Bell className="w-3 h-3 inline" /> : <BellOff className="w-3 h-3 inline" />}
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
                {room.players.map(p => (
                  <div key={p.id} className="flex justify-between items-center bg-slate-900/80 p-3 rounded-xl border border-slate-700/50">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center font-bold text-slate-300">
                        {p.name.substring(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-bold text-sm text-white">{p.name}</div>
                        <div className="text-[10px] text-slate-500 uppercase">{p.role}</div>
                      </div>
                    </div>
                    {isMeHost && !p.isHost && (
                      <button onClick={() => socketService.socket.emit('kick_player', { roomId: room.id, targetId: p.id })} className="text-slate-500 hover:text-red-500"><LogOut className="w-4 h-4" /></button>
                    )}
                    {p.id === currentPlayerId && (
                      <button onClick={onExit} className="text-slate-500 hover:text-red-400" title="Leave Room">
                        <LogOut className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {activePanel === 'chat' && (
            <div className="flex-1 flex flex-col min-h-0">
              <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                {messages.map(msg => (
                  <div key={msg.id} className={`flex flex-col ${msg.sender === room.players.find(p => p.id === currentPlayerId)?.name ? 'items-end' : 'items-start'}`}>
                    <div className={`px-3 py-2 rounded-xl text-sm max-w-[85%] ${msg.sender === room.players.find(p => p.id === currentPlayerId)?.name ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-200'}`}>
                      {msg.text}
                    </div>
                    <span className="text-[10px] text-slate-500 mt-1">{msg.sender}</span>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
              <form onSubmit={sendMessage} className="p-3 bg-slate-900/50 border-t border-slate-700 flex gap-2">
                <input type="text" value={message} onChange={e => setMessage(e.target.value)} className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-4 py-2 text-sm text-white" placeholder="Type..." />
                <button type="submit" disabled={!message.trim()} className="bg-blue-600 rounded-xl p-2 text-white"><Send className="w-4 h-4" /></button>
              </form>
            </div>
          )}

          {activePanel === 'log' && (
            <div className="flex-1 flex flex-col min-h-0 bg-slate-950/50">
              <GameLogPanel
                className="h-full border-t-0 bg-transparent"
                maxHeight="100%"
                onCardHover={(card) => setLogHoveredCard(card ? {
                  name: card.name,
                  imageUrl: card.imageUrl,
                  imageArtCrop: card.imageArtCrop,
                  manaCost: card.manaCost,
                  typeLine: card.typeLine,
                  oracleText: card.oracleText
                } : null)}
              />
            </div>
          )}

          {activePanel === 'debug' && debugEnabled && (
            <div className="flex-1 flex flex-col min-h-0 bg-slate-950/50">
              <DebugPanel
                className="h-full border-t-0 bg-transparent"
                maxHeight="100%"
              />
            </div>
          )}
        </div>
      )}

      {isHostOffline && !isMeHost && (
        <div className="absolute inset-0 z-50 bg-black/80 flex items-center justify-center p-8">
          <div className="bg-slate-900 border border-red-500/50 p-8 rounded-2xl text-center">
            <h2 className="text-2xl font-bold text-white mb-2">Game Paused</h2>
            <p className="text-slate-300 mb-6">Host disconnected.</p>
            <button onClick={onExit} className="px-6 py-2 bg-slate-800 text-slate-400 border border-slate-700 rounded-lg">Leave Game</button>
          </div>
        </div>
      )}

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} {...modalConfig} />
      <DeckSelectionModal
        isOpen={isDeckSelectionOpen}
        onClose={() => setIsDeckSelectionOpen(false)}
        format={room.format}
        onSelect={(deck) => {
          setSelectedDeckCards(deck.cards);
          setIsDeckSelectionOpen(false);
          showToast(`Loaded: ${deck.name}`, 'success');
        }}
        onCancel={() => {
          socketService.socket.emit('cancel_game', { roomId: room.id }, (response: any) => {
            if (response?.success) {
              setIsDeckSelectionOpen(false);
              setSelectedDeckCards([]);
              showToast('Game cancelled', 'info');
            } else {
              showToast(response?.message || 'Failed to cancel game', 'error');
            }
          });
        }}
      />
    </div>
  );
};

export const GameRoom: React.FC<GameRoomProps> = (props) => {
  return (
    <GameLogProvider>
      <DebugProvider>
        <GameRoomContent {...props} />
      </DebugProvider>
    </GameLogProvider>
  );
};
