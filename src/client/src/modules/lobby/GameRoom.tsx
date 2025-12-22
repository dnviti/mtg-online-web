import React, { useState, useEffect, useRef } from 'react';
import { socketService } from '../../services/SocketService';
import { Users, LogOut, Copy, Check, MessageSquare, Send, Bell, BellOff, X, Bot, Layers } from 'lucide-react';
import { useConfirm } from '../../components/ConfirmDialog';
import { Modal } from '../../components/Modal';
import { useGameToast, GameToastProvider } from '../../components/GameToast';
import { GameView } from '../game/GameView';
import { DraftView } from '../draft/DraftView';
import { TournamentManager as TournamentView } from '../tournament/TournamentManager';
import { DeckBuilderView } from '../draft/DeckBuilderView';

interface Player {
  id: string;
  name: string;
  isHost: boolean;
  role: 'player' | 'spectator';
  isOffline?: boolean;
  isBot?: boolean;
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
}

interface GameRoomProps {
  room: Room;
  currentPlayerId: string;
  initialGameState?: any;
  initialDraftState?: any;
  onExit: () => void;
}

const GameRoomContent: React.FC<GameRoomProps> = ({ room: initialRoom, currentPlayerId, initialGameState, initialDraftState, onExit }) => {
  // State
  const [room, setRoom] = useState<Room>(initialRoom);
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
  const [activePanel, setActivePanel] = useState<'lobby' | 'chat' | null>(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => {
    return localStorage.getItem('notifications_enabled') !== 'false';
  });

  // Services
  const { showGameToast } = useGameToast();
  const { confirm } = useConfirm();

  // Restored States
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>(initialRoom.messages || []);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [gameState, setGameState] = useState<any>(initialGameState || null);
  const [draftState, setDraftState] = useState<any>(initialDraftState || null);
  const [tournamentState, setTournamentState] = useState<any>((initialRoom as any).tournament || null);
  const [preparingMatchId, setPreparingMatchId] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<'game' | 'chat'>('game'); // Keep for mobile

  // Derived State
  const host = room.players.find(p => p.isHost);
  const isHostOffline = host?.isOffline;
  const isMeHost = currentPlayerId === host?.id;
  const prevPlayersRef = useRef<Player[]>(initialRoom.players);

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
        showGameToast(`${p.name} (${p.role}) joined the room.`, 'info');
      }
    });

    // 2. Left Players
    prev.forEach(p => {
      if (!curr.find(newP => newP.id === p.id)) {
        showGameToast(`${p.name} left the room.`, 'warning');
      }
    });

    // 3. Status Changes (Disconnect/Reconnect)
    curr.forEach(p => {
      const old = prev.find(o => o.id === p.id);
      if (old) {
        if (!old.isOffline && p.isOffline) {
          showGameToast(`${p.name} lost connection.`, 'error');
        }
        if (old.isOffline && !p.isOffline) {
          showGameToast(`${p.name} reconnected!`, 'success');
        }
      }
    });

    prevPlayersRef.current = curr;
  }, [room.players, notificationsEnabled, showGameToast]);

  // Effects
  useEffect(() => {
    setRoom(initialRoom);
    setMessages(initialRoom.messages || []);
  }, [initialRoom]);

  // React to prop updates for draft state (Crucial for resume)
  useEffect(() => {
    if (initialDraftState) {
      setDraftState(initialDraftState);
    }
  }, [initialDraftState]);

  // Handle kicked event
  useEffect(() => {
    const socket = socketService.socket;
    const onKicked = () => {
      // alert("You have been kicked from the room.");
      // onExit();
      setModalConfig({
        title: 'Kicked',
        message: 'You have been kicked from the room.',
        type: 'error',
        confirmLabel: 'Back to Lobby',
        onConfirm: () => onExit()
      });
      setModalOpen(true);
    };
    socket.on('kicked', onKicked);
    return () => { socket.off('kicked', onKicked); };
  }, [onExit]);

  // Scroll to bottom of chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const socket = socketService.socket;
    const handleDraftUpdate = (data: any) => {
      setDraftState(data);
    };

    const handleDraftError = (error: { message: string }) => {
      setModalConfig({
        title: 'Error',
        message: error.message,
        type: 'error'
      });
      setModalOpen(true);
    };

    const handleGameUpdate = (data: any) => {
      setGameState(data);
    };

    const handleTournamentUpdate = (data: any) => {
      setTournamentState(data);
    };

    // Also handle finish
    const handleTournamentFinished = (data: any) => {
      showGameToast(`Tournament Winner: ${data.winner.name}!`, 'success');
    };

    socket.on('draft_update', handleDraftUpdate);
    socket.on('draft_error', handleDraftError);
    socket.on('game_update', handleGameUpdate);
    socket.on('tournament_update', handleTournamentUpdate);
    socket.on('tournament_finished', handleTournamentFinished);

    socket.on('match_start', () => {
      setPreparingMatchId(null);
    });

    return () => {
      socket.off('draft_update', handleDraftUpdate);
      socket.off('draft_error', handleDraftError);
      socket.off('game_update', handleGameUpdate);
      socket.off('tournament_update', handleTournamentUpdate);
      socket.off('tournament_finished', handleTournamentFinished);
      socket.off('tournament_finished', handleTournamentFinished);
      socket.off('match_start');
      socket.off('game_error');
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Add a specific effect for game_error if avoiding the big dependency array is desired, 
  // or just append to the existing effect content.
  useEffect(() => {
    const socket = socketService.socket;
    const handleGameError = (data: { message: string, userId?: string }) => {
      // Only show error if it's for me, or maybe generic "Action Failed"
      if (data.userId && data.userId !== currentPlayerId) return; // Don't spam others errors?

      if (data.userId && data.userId !== currentPlayerId) return; // Don't spam others errors?

      showGameToast(data.message, 'error');
    };

    const handleGameNotification = (data: { message: string, type?: 'info' | 'success' | 'warning' | 'error' }) => {
      showGameToast(data.message, data.type || 'info');
    };

    socket.on('game_error', handleGameError);
    socket.on('game_notification', handleGameNotification);
    return () => {
      socket.off('game_error', handleGameError);
      socket.off('game_notification', handleGameNotification);
    };
  }, [currentPlayerId, showGameToast]);

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
      console.warn('Clipboard API not available');
      const textArea = document.createElement("textarea");
      textArea.value = room.id;
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
      } catch (err) {
        console.error('Fallback: Oops, unable to copy', err);
      }
      document.body.removeChild(textArea);
    }
  };



  const handleStartDraft = () => {
    socketService.socket.emit('start_draft', { roomId: room.id });
  };

  const renderContent = () => {
    if (gameState) {
      return <GameView gameState={gameState} currentPlayerId={currentPlayerId} />;
    }

    if (room.status === 'drafting' && draftState) {
      return <DraftView draftState={draftState} roomId={room.id} currentPlayerId={currentPlayerId} onExit={onExit} />;
    }

    if (room.status === 'deck_building' && draftState) {
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
                    <div key={p.id} className={`flex items - center gap - 2 px - 4 py - 2 rounded - lg border ${isReady ? 'bg-emerald-900/30 border-emerald-500/50' : 'bg-slate-700/30 border-slate-700'} `}>
                      <div className={`w - 2 h - 2 rounded - full ${isReady ? 'bg-emerald-500' : 'bg-slate-600'} `}></div>
                      <span className={isReady ? 'text-emerald-200' : 'text-slate-500'}>{p.name}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      }

      const myPool = draftState.players[currentPlayerId]?.pool || [];
      return <DeckBuilderView roomId={room.id} currentPlayerId={currentPlayerId} initialPool={myPool} availableBasicLands={room.basicLands} />;
    }

    if (room.status === 'tournament' && tournamentState) {
      if (preparingMatchId) {
        const myTournamentPlayer = tournamentState.players.find((p: any) => p.id === currentPlayerId);
        const myPool = draftState?.players[currentPlayerId]?.pool || [];
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
            showGameToast("Deck ready! Waiting for game to start...", 'success');
          }}
          submitLabel="Ready for Match"
        />;
      }
      return <TournamentView tournament={tournamentState} currentPlayerId={currentPlayerId} onJoinMatch={setPreparingMatchId} />;
    }

    return (
      <div className="flex-1 bg-slate-800 rounded-xl p-6 border border-slate-700 shadow-xl flex flex-col items-center justify-center">
        <h2 className="text-3xl font-bold text-white mb-4">Waiting for Players...</h2>
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

        {room.players.find(p => p.id === currentPlayerId)?.isHost && (
          <div className="flex flex-col gap-2 mt-8">
            <button
              onClick={handleStartDraft}
              disabled={room.status !== 'waiting'}
              className="px-8 py-3 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-lg flex items-center gap-2 shadow-lg shadow-purple-900/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Layers className="w-5 h-5" /> Start Draft
            </button>
            <button
              onClick={() => socketService.socket.emit('add_bot', { roomId: room.id })}
              disabled={room.status !== 'waiting' || room.players.length >= 8}
              className="px-8 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg flex items-center gap-2 shadow-lg shadow-indigo-900/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Bot className="w-5 h-5" /> Add Bot
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex h-full w-full overflow-hidden relative">
      {/* --- MOBILE LAYOUT (Keep simplified tabs for small screens) --- */}
      <div className="lg:hidden flex flex-col w-full h-full">
        {/* Mobile Tab Bar */}
        <div className="shrink-0 flex items-center bg-slate-800 border-b border-slate-700">
          <button
            onClick={() => setMobileTab('game')}
            className={`flex - 1 p - 3 flex items - center justify - center gap - 2 text - sm font - bold transition - colors ${mobileTab === 'game' ? 'text-emerald-400 bg-slate-700/50 border-b-2 border-emerald-500' : 'text-slate-400 hover:text-slate-200'} `}
          >
            <Layers className="w-4 h-4" /> Game
          </button>
          <button
            onClick={() => setMobileTab('chat')}
            className={`flex - 1 p - 3 flex items - center justify - center gap - 2 text - sm font - bold transition - colors ${mobileTab === 'chat' ? 'text-purple-400 bg-slate-700/50 border-b-2 border-purple-500' : 'text-slate-400 hover:text-slate-200'} `}
          >
            <div className="flex items-center gap-1">
              <Users className="w-4 h-4" />
              <span className="text-slate-600">/</span>
              <MessageSquare className="w-4 h-4" />
            </div>
            Lobby & Chat
          </button>
        </div>

        {/* Mobile Content */}
        <div className="flex-1 min-h-0 relative">
          {mobileTab === 'game' ? (
            renderContent()
          ) : (
            <div className="absolute inset-0 overflow-y-auto p-4 bg-slate-900">
              {/* Mobile Chat/Lobby merged view for simplicity, reusing logic if possible or duplicating strictly for mobile structure */}
              {/* Re-implementing simplified mobile view directly here to avoid layout conflicts */}
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
      {/* Main Content Area - Full Width */}
      <div className="hidden lg:flex flex-1 min-w-0 flex-col h-full relative z-0">
        {renderContent()}
      </div>

      {/* Right Collapsible Toolbar */}
      <div className="hidden lg:flex w-14 shrink-0 flex-col items-center gap-4 py-4 bg-slate-900 border-l border-slate-800 z-30 relative">
        <button
          onClick={() => setActivePanel(activePanel === 'lobby' ? null : 'lobby')}
          className={`p - 3 rounded - xl transition - all duration - 200 group relative ${activePanel === 'lobby' ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/50' : 'text-slate-500 hover:text-purple-400 hover:bg-slate-800'} `}
          title="Lobby & Players"
        >
          <Users className="w-6 h-6" />
          <span className="absolute right-full mr-3 top-1/2 -translate-y-1/2 bg-slate-800 text-white text-xs font-bold px-2 py-1 rounded shadow-xl opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none ring-1 ring-white/10">
            Lobby
          </span>
        </button>

        <button
          onClick={() => setActivePanel(activePanel === 'chat' ? null : 'chat')}
          className={`p - 3 rounded - xl transition - all duration - 200 group relative ${activePanel === 'chat' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/50' : 'text-slate-500 hover:text-blue-400 hover:bg-slate-800'} `}
          title="Chat"
        >
          <div className="relative">
            <MessageSquare className="w-6 h-6" />
            {/* Unread indicator could go here */}
          </div>
          <span className="absolute right-full mr-3 top-1/2 -translate-y-1/2 bg-slate-800 text-white text-xs font-bold px-2 py-1 rounded shadow-xl opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none ring-1 ring-white/10">
            Chat
          </span>
        </button>
      </div>

      {/* Floating Panel (Desktop) */}
      {activePanel && (
        <div className="hidden lg:flex absolute right-16 top-4 bottom-4 w-96 bg-slate-800/95 backdrop-blur-xl border border-slate-700/50 rounded-2xl shadow-2xl z-40 flex-col animate-in slide-in-from-right-10 fade-in duration-200 overflow-hidden ring-1 ring-white/10">

          {/* Header */}
          <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-900/50">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              {activePanel === 'lobby' ? <><Users className="w-5 h-5 text-purple-400" /> Lobby</> : <><MessageSquare className="w-5 h-5 text-blue-400" /> Chat</>}
            </h3>
            <button onClick={() => setActivePanel(null)} className="p-1 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Lobby Content */}
          {activePanel === 'lobby' && (
            <div className="flex-1 flex flex-col min-h-0">
              {/* Controls */}
              <div className="p-3 bg-slate-900/30 flex items-center justify-between border-b border-slate-800">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{room.players.length} Connected</span>
                <button
                  onClick={() => setNotificationsEnabled(!notificationsEnabled)}
                  className={`flex items - center gap - 2 text - xs font - bold px - 2 py - 1 rounded - lg transition - colors border ${notificationsEnabled ? 'bg-slate-800 border-slate-600 text-slate-300 hover:text-white' : 'bg-red-900/20 border-red-900/50 text-red-400'} `}
                  title={notificationsEnabled ? "Disable Notifications" : "Enable Notifications"}
                >
                  {notificationsEnabled ? <Bell className="w-3 h-3" /> : <BellOff className="w-3 h-3" />}
                  {notificationsEnabled ? 'On' : 'Off'}
                </button>
              </div>

              {/* Player List */}
              <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
                {room.players.map(p => {
                  const isReady = (p as any).ready;
                  const isMe = p.id === currentPlayerId;
                  const isSolo = room.players.length === 1 && room.status === 'playing';

                  return (
                    <div key={p.id} className="flex items-center justify-between bg-slate-900/80 p-3 rounded-xl border border-slate-700/50 hover:border-slate-600 transition-colors group">
                      <div className="flex items-center gap-3">
                        <div className={`w - 10 h - 10 rounded - full flex items - center justify - center font - bold text - sm shadow - inner ${p.isBot ? 'bg-indigo-900 text-indigo-200 border border-indigo-500' : p.role === 'spectator' ? 'bg-slate-800 text-slate-500' : 'bg-gradient-to-br from-purple-600 to-blue-600 text-white shadow-purple-900/30'} `}>
                          {p.isBot ? <Bot className="w-5 h-5" /> : p.name.substring(0, 2).toUpperCase()}
                        </div>
                        <div className="flex flex-col">
                          <span className={`text - sm font - bold ${isMe ? 'text-white' : 'text-slate-200'} `}>
                            {p.name} {isMe && <span className="text-slate-500 font-normal">(You)</span>}
                          </span>
                          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 flex items-center gap-1">
                            {p.role}
                            {p.isHost && <span className="text-amber-500 flex items-center">• Host</span>}
                            {p.isBot && <span className="text-indigo-400 flex items-center">• Bot</span>}
                            {isReady && room.status === 'deck_building' && <span className="text-emerald-500 flex items-center">• Ready</span>}
                            {p.isOffline && <span className="text-red-500 flex items-center">• Offline</span>}
                          </span>
                        </div>
                      </div>

                      <div className={`flex gap - 1 ${isSolo ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition - opacity`}>
                        {isMeHost && !isMe && (
                          <button
                            onClick={async () => {
                              if (await confirm({
                                title: 'Kick Player?',
                                message: `Are you sure you want to kick ${p.name}?`,
                                confirmLabel: 'Kick',
                                type: 'error'
                              })) {
                                socketService.socket.emit('kick_player', { roomId: room.id, targetId: p.id });
                              }
                            }}
                            className="p-1.5 hover:bg-red-500/10 rounded-lg text-slate-500 hover:text-red-500 transition-colors"
                            title="Kick Player"
                          >
                            <LogOut className="w-4 h-4 rotate-180" />
                          </button>
                        )}
                        {isMeHost && p.isBot && (
                          <button
                            onClick={() => {
                              socketService.socket.emit('remove_bot', { roomId: room.id, botId: p.id });
                            }}
                            className="p-1.5 hover:bg-red-500/10 rounded-lg text-slate-500 hover:text-red-500 transition-colors"
                            title="Remove Bot"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                        {isMe && (
                          <button onClick={onExit} className="p-1.5 hover:bg-red-500/10 rounded-lg text-slate-400 hover:text-red-400 transition-colors" title="Accions">
                            <LogOut className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Chat Content */}
          {activePanel === 'chat' && (
            <div className="flex-1 flex flex-col min-h-0">
              <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                {messages.length === 0 && (
                  <div className="text-center text-slate-600 mt-10 text-sm italic">
                    No messages yet. Say hello!
                  </div>
                )}
                {messages.map(msg => (
                  <div key={msg.id} className={`flex flex - col ${msg.sender === (room.players.find(p => p.id === currentPlayerId)?.name) ? 'items-end' : 'items-start'} `}>
                    <div className={`max - w - [85 %] px - 3 py - 2 rounded - xl text - sm ${msg.sender === (room.players.find(p => p.id === currentPlayerId)?.name) ? 'bg-blue-600 text-white rounded-br-none shadow-blue-900/20' : 'bg-slate-700 text-slate-200 rounded-bl-none'} `}>
                      {msg.text}
                    </div>
                    <span className="text-[10px] text-slate-500 mt-1 font-medium">{msg.sender}</span>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
              <div className="p-3 bg-slate-900/50 border-t border-slate-700">
                <form onSubmit={sendMessage} className="flex gap-2">
                  <input
                    type="text"
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    placeholder="Type a message..."
                  />
                  <button type="submit" className="p-2.5 bg-blue-600 hover:bg-blue-500 rounded-xl text-white transition-all shadow-lg shadow-blue-900/20 disabled:opacity-50" disabled={!message.trim()}>
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              </div>
            </div>
          )}

        </div>
      )}



      {/* Host Disconnected Overlay */}
      {isHostOffline && !isMeHost && (
        <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-md flex flex-col items-center justify-center p-8 animate-in fade-in duration-500">
          <div className="bg-slate-900 border border-red-500/50 p-8 rounded-2xl shadow-2xl max-w-lg text-center">
            <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
              <Users className="w-8 h-8 text-red-500" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Game Paused</h2>
            <p className="text-slate-300 mb-6">
              The host <span className="text-white font-bold">{host?.name}</span> has disconnected.
              The game is paused until they reconnect.
            </p>
            <div className="flex flex-col gap-6 items-center">
              <div className="flex items-center justify-center gap-2 text-xs text-slate-500 uppercase tracking-wider font-bold animate-pulse">
                <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                Waiting for host...
              </div>

              <button
                onClick={async () => {
                  if (await confirm({
                    title: 'Leave Game?',
                    message: "Are you sure you want to leave the game? You can rejoin later.",
                    confirmLabel: 'Leave',
                    type: 'warning'
                  })) {
                    onExit();
                  }
                }}
                className="px-6 py-2 bg-slate-800 hover:bg-red-900/30 text-slate-400 hover:text-red-400 border border-slate-700 hover:border-red-500/50 rounded-lg flex items-center gap-2 transition-all"
              >
                <LogOut className="w-4 h-4" /> Leave Game
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Global Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={modalConfig.title}
        message={modalConfig.message}
        type={modalConfig.type}
      />
    </div>
  );
};

export const GameRoom: React.FC<GameRoomProps> = (props) => {
  return (
    <GameToastProvider>
      <GameRoomContent {...props} />
    </GameToastProvider>
  );
};
