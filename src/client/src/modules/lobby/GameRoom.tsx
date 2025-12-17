
import React, { useState, useEffect, useRef } from 'react';
import { socketService } from '../../services/SocketService';
import { Users, MessageSquare, Send, Copy, Check, Layers, LogOut } from 'lucide-react';
import { Modal } from '../../components/Modal';
import { GameView } from '../game/GameView';
import { DraftView } from '../draft/DraftView';
import { DeckBuilderView } from '../draft/DeckBuilderView';

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
}

interface GameRoomProps {
  room: Room;
  currentPlayerId: string;
  initialGameState?: any;
  initialDraftState?: any;
  onExit: () => void;
}

export const GameRoom: React.FC<GameRoomProps> = ({ room: initialRoom, currentPlayerId, initialGameState, initialDraftState, onExit }) => {
  // State
  const [room, setRoom] = useState<Room>(initialRoom);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalConfig, setModalConfig] = useState({ title: '', message: '', type: 'info' as 'info' | 'error' | 'warning' | 'success' });

  // Restored States
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>(initialRoom.messages || []);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [gameState, setGameState] = useState<any>(initialGameState || null);
  const [draftState, setDraftState] = useState<any>(initialDraftState || null);
  const [mobileTab, setMobileTab] = useState<'game' | 'chat'>('game');

  // Derived State
  const host = room.players.find(p => p.isHost);
  const isHostOffline = host?.isOffline;
  const isMeHost = currentPlayerId === host?.id;

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
      alert("You have been kicked from the room.");
      onExit();
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

    socket.on('draft_update', handleDraftUpdate);
    socket.on('draft_error', handleDraftError);
    socket.on('game_update', handleGameUpdate);

    return () => {
      socket.off('draft_update', handleDraftUpdate);
      socket.off('draft_error', handleDraftError);
      socket.off('game_update', handleGameUpdate);
    };
  }, []);

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

      const myPool = draftState.players[currentPlayerId]?.pool || [];
      return <DeckBuilderView roomId={room.id} currentPlayerId={currentPlayerId} initialPool={myPool} availableBasicLands={room.basicLands} />;
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

          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex h-full flex-col lg:flex-row gap-4 overflow-hidden">
      {/* Mobile Tab Bar */}
      <div className="lg:hidden shrink-0 flex items-center bg-slate-800 border-b border-slate-700">
        <button
          onClick={() => setMobileTab('game')}
          className={`flex-1 p-3 flex items-center justify-center gap-2 text-sm font-bold transition-colors ${mobileTab === 'game' ? 'text-emerald-400 bg-slate-700/50 border-b-2 border-emerald-500' : 'text-slate-400 hover:text-slate-200'}`}
        >
          <Layers className="w-4 h-4" /> Game
        </button>
        <button
          onClick={() => setMobileTab('chat')}
          className={`flex-1 p-3 flex items-center justify-center gap-2 text-sm font-bold transition-colors ${mobileTab === 'chat' ? 'text-purple-400 bg-slate-700/50 border-b-2 border-purple-500' : 'text-slate-400 hover:text-slate-200'}`}
        >
          <div className="flex items-center gap-1">
            <Users className="w-4 h-4" />
            <span className="text-slate-600">/</span>
            <MessageSquare className="w-4 h-4" />
          </div>
          Lobby & Chat
        </button>
      </div>

      <div className={`flex-1 min-h-0 flex flex-col ${mobileTab === 'game' ? 'flex' : 'hidden lg:flex'}`}>
        {renderContent()}
      </div>

      <div className={`w-full lg:w-80 shrink-0 flex flex-col gap-4 min-h-0 ${mobileTab === 'chat' ? 'flex' : 'hidden lg:flex'}`}>
        <div className="flex-1 bg-slate-800 rounded-xl p-4 border border-slate-700 shadow-xl overflow-hidden flex flex-col">
          <h3 className="text-sm font-bold text-slate-400 uppercase mb-3 flex items-center gap-2">
            <Users className="w-4 h-4" /> Lobby
          </h3>


          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {room.players.map(p => {
              const isReady = (p as any).ready;
              const isMe = p.id === currentPlayerId;
              const isSolo = room.players.length === 1 && room.status === 'playing';

              return (
                <div key={p.id} className="flex items-center justify-between bg-slate-900/50 p-2 rounded-lg border border-slate-700/50 group">
                  <div className="flex items-center gap-2">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${p.role === 'spectator' ? 'bg-slate-700 text-slate-300' : 'bg-gradient-to-br from-purple-500 to-blue-500 text-white'}`}>
                      {p.name.substring(0, 2).toUpperCase()}
                    </div>
                    <div className="flex flex-col">
                      <span className={`text-sm font-medium ${isMe ? 'text-white' : 'text-slate-300'}`}>
                        {p.name} {isMe && '(You)'}
                      </span>
                      <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">
                        {p.role} {p.isHost && <span className="text-amber-500 ml-1">• Host</span>}
                        {isReady && room.status === 'deck_building' && <span className="text-emerald-500 ml-1">• Ready</span>}
                        {p.isOffline && <span className="text-red-500 ml-1">• Offline</span>}
                      </span>
                    </div>
                  </div>

                  <div className={`flex gap-2 ${isSolo ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}>
                    {isMe && (
                      <button
                        onClick={onExit}
                        className={`p-1 rounded flex items-center gap-2 transition-colors ${isSolo
                          ? 'bg-red-900/40 text-red-200 hover:bg-red-900/60 px-3 py-1.5'
                          : 'hover:bg-slate-700 text-slate-400 hover:text-red-400'
                          }`}
                        title={isSolo ? "End Solo Session" : "Leave Room"}
                      >
                        <LogOut className="w-4 h-4" />
                        {isSolo && <span className="text-xs font-bold">End Test</span>}
                      </button>
                    )}
                    {isMeHost && !isMe && (
                      <button
                        onClick={() => {
                          if (confirm(`Kick ${p.name}?`)) {
                            socketService.socket.emit('kick_player', { roomId: room.id, targetId: p.id });
                          }
                        }}
                        className="p-1 hover:bg-red-900/50 rounded text-slate-500 hover:text-red-500"
                        title="Kick Player"
                      >
                        <LogOut className="w-4 h-4 rotate-180" />
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="h-1/2 bg-slate-800 rounded-xl p-4 border border-slate-700 shadow-xl flex flex-col">
          <h3 className="text-sm font-bold text-slate-400 uppercase mb-3 flex items-center gap-2">
            <MessageSquare className="w-4 h-4" /> Chat
          </h3>
          <div className="flex-1 overflow-y-auto space-y-2 mb-3 pr-1 custom-scrollbar">
            {messages.map(msg => (
              <div key={msg.id} className="text-sm">
                <span className="font-bold text-purple-400 text-xs">{msg.sender}: </span>
                <span className="text-slate-300">{msg.text}</span>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
          <form onSubmit={sendMessage} className="flex gap-2">
            <input
              type="text"
              value={message}
              onChange={e => setMessage(e.target.value)}
              className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
              placeholder="Type..."
            />
            <button type="submit" className="p-2 bg-purple-600 hover:bg-purple-500 rounded-lg text-white transition-colors">
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>

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
                onClick={() => {
                  if (window.confirm("Are you sure you want to leave the game?")) {
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
