
import React, { useState, useEffect, useRef } from 'react';
import { socketService } from '../../services/SocketService';
import { Users, MessageSquare, Send, Play, Copy, Check, Layers } from 'lucide-react';
import { GameView } from '../game/GameView';
import { DraftView } from '../draft/DraftView';
import { DeckBuilderView } from '../draft/DeckBuilderView';

interface Player {
  id: string;
  name: string;
  isHost: boolean;
  role: 'player' | 'spectator';
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
  status: string;
  messages: ChatMessage[];
}

interface GameRoomProps {
  room: Room;
  currentPlayerId: string;
}

export const GameRoom: React.FC<GameRoomProps> = ({ room: initialRoom, currentPlayerId }) => {
  const [room, setRoom] = useState<Room>(initialRoom);
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>(initialRoom.messages || []);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [gameState, setGameState] = useState<any>(null);

  useEffect(() => {
    setRoom(initialRoom);
    setMessages(initialRoom.messages || []);
  }, [initialRoom]);

  useEffect(() => {
    const socket = socketService.socket;

    const handleRoomUpdate = (updatedRoom: Room) => {
      console.log('Room updated:', updatedRoom);
      setRoom(updatedRoom);
    };

    const handleNewMessage = (msg: ChatMessage) => {
      setMessages(prev => [...prev, msg]);
    };

    const handleGameUpdate = (game: any) => {
      setGameState(game);
    };

    socket.on('room_update', handleRoomUpdate);
    socket.on('new_message', handleNewMessage);
    socket.on('game_update', handleGameUpdate);

    return () => {
      socket.off('room_update', handleRoomUpdate);
      socket.off('new_message', handleNewMessage);
      socket.off('game_update', handleGameUpdate);
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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
        // Fallback could go here
      });
    } else {
      // Fallback for non-secure context or older browsers
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

  const handleStartGame = () => {
    // Create a test deck for each player for now
    const testDeck = Array.from({ length: 40 }).map((_, i) => ({
      id: `card-${i}`,
      name: i % 2 === 0 ? "Mountain" : "Lightning Bolt",
      image_uris: {
        normal: i % 2 === 0
          ? "https://cards.scryfall.io/normal/front/1/9/194459f0-2586-444a-be7d-786d5e7e9bc4.jpg" // Mountain
          : "https://cards.scryfall.io/normal/front/f/2/f29ba16f-c8fb-42fe-aabf-87089cb211a7.jpg" // Bolt
      }
    }));

    const decks = room.players.reduce((acc, p) => ({ ...acc, [p.id]: testDeck }), {});

    socketService.socket.emit('start_game', { roomId: room.id, decks });
  };

  const handleStartDraft = () => {
    socketService.socket.emit('start_draft', { roomId: room.id });
  };

  if (gameState) {
    return <GameView gameState={gameState} currentPlayerId={currentPlayerId} />;
  }

  // New States
  const [draftState, setDraftState] = useState<any>(null);

  useEffect(() => {
    const socket = socketService.socket;
    const handleDraftUpdate = (data: any) => {
      setDraftState(data);
    };
    socket.on('draft_update', handleDraftUpdate);
    return () => { socket.off('draft_update', handleDraftUpdate); };
  }, []);

  if (room.status === 'drafting' && draftState) {
    return <DraftView draftState={draftState} roomId={room.id} currentPlayerId={currentPlayerId} />;
  }

  if (room.status === 'deck_building' && draftState) {
    // Get my pool
    const myPool = draftState.players[currentPlayerId]?.pool || [];
    return <DeckBuilderView roomId={room.id} currentPlayerId={currentPlayerId} initialPool={myPool} />;
  }

  return (
    <div className="flex h-[calc(100vh-100px)] gap-4">
      {/* Main Game Area (Placeholder for now) */}
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
              <Layers className="w-5 h-5" /> Start Real Draft
            </button>
            <span className="text-xs text-slate-500 text-center">- OR -</span>
            <button
              onClick={handleStartGame}
              disabled={room.status !== 'waiting'}
              className="px-8 py-3 bg-slate-700 hover:bg-slate-600 text-white font-bold rounded-lg flex items-center gap-2 shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed text-xs uppercase tracking-wider"
            >
              <Play className="w-4 h-4" /> Quick Play (Test Decks)
            </button>
          </div>
        )}
      </div>

      {/* Sidebar: Players & Chat */}
      <div className="w-80 flex flex-col gap-4">
        {/* Players List */}
        <div className="flex-1 bg-slate-800 rounded-xl p-4 border border-slate-700 shadow-xl overflow-hidden flex flex-col">
          <h3 className="text-sm font-bold text-slate-400 uppercase mb-3 flex items-center gap-2">
            <Users className="w-4 h-4" /> Lobby
          </h3>
          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {room.players.map(p => (
              <div key={p.id} className="flex items-center justify-between bg-slate-900/50 p-2 rounded-lg border border-slate-700/50">
                <div className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${p.role === 'spectator' ? 'bg-slate-700 text-slate-300' : 'bg-gradient-to-br from-purple-500 to-blue-500 text-white'}`}>
                    {p.name.substring(0, 2).toUpperCase()}
                  </div>
                  <div className="flex flex-col">
                    <span className={`text-sm font-medium ${p.id === currentPlayerId ? 'text-white' : 'text-slate-300'}`}>
                      {p.name}
                    </span>
                    <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">
                      {p.role} {p.isHost && <span className="text-amber-500 ml-1">• Host</span>}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Chat */}
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
    </div>
  );
};
