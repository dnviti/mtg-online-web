
import React, { useState } from 'react';
import { socketService } from '../../services/SocketService';
import { GameRoom } from './GameRoom';
import { Pack } from '../../services/PackGeneratorService';
import { Users, PlusCircle, LogIn, AlertCircle, Loader2 } from 'lucide-react';

interface LobbyManagerProps {
  generatedPacks: Pack[];
}

export const LobbyManager: React.FC<LobbyManagerProps> = ({ generatedPacks }) => {
  const [activeRoom, setActiveRoom] = useState<any>(null);
  const [playerName, setPlayerName] = useState(() => localStorage.getItem('player_name') || '');
  const [joinRoomId, setJoinRoomId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [playerId] = useState(() => {
    const saved = localStorage.getItem('player_id');
    if (saved) return saved;
    const newId = Math.random().toString(36).substring(2) + Date.now().toString(36);
    localStorage.setItem('player_id', newId);
    return newId;
  });

  // Persist player name
  React.useEffect(() => {
    localStorage.setItem('player_name', playerName);
  }, [playerName]);

  const connect = () => {
    if (!socketService.socket.connected) {
      socketService.connect();
    }
  };

  const handleCreateRoom = async () => {
    if (!playerName) {
      setError('Please enter your name');
      return;
    }
    if (generatedPacks.length === 0) {
      setError('No packs generated! Please go to Draft Management and generate packs first.');
      return;
    }

    setLoading(true);
    setError('');
    connect();

    try {
      // Collect all cards
      const allCards = generatedPacks.flatMap(p => p.cards);
      // Deduplicate by Scryfall ID
      const uniqueCards = Array.from(new Map(allCards.map(c => [c.scryfallId, c])).values());

      // Prepare payload for server (generic structure expected by CardService)
      const cardsToCache = uniqueCards.map(c => ({
        id: c.scryfallId,
        image_uris: { normal: c.image }
      }));

      // Cache images on server
      const cacheResponse = await fetch('/api/cards/cache', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cards: cardsToCache })
      });

      if (!cacheResponse.ok) {
        throw new Error('Failed to cache images');
      }

      const cacheResult = await cacheResponse.json();
      console.log('Cached result:', cacheResult);

      // Transform packs to use local URLs
      // Note: For multiplayer, clients need to access this URL.
      const baseUrl = `${window.location.protocol}//${window.location.host}/cards`;

      const updatedPacks = generatedPacks.map(pack => ({
        ...pack,
        cards: pack.cards.map(c => ({
          ...c,
          // Update the single image property used by DraftCard
          image: `${baseUrl}/${c.scryfallId}.jpg`
        }))
      }));

      const response = await socketService.emitPromise('create_room', {
        hostId: playerId,
        hostName: playerName,
        packs: updatedPacks
      });

      if (response.success) {
        setActiveRoom(response.room);
      } else {
        setError(response.message || 'Failed to create room');
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Connection error');
    } finally {
      setLoading(false);
    }
  };

  const handleJoinRoom = async () => {
    if (!playerName) {
      setError('Please enter your name');
      return;
    }
    if (!joinRoomId) {
      setError('Please enter a Room ID');
      return;
    }

    setLoading(true);
    setError('');
    connect();

    try {
      const response = await socketService.emitPromise('join_room', {
        roomId: joinRoomId.toUpperCase(),
        playerId,
        playerName
      });

      if (response.success) {
        setActiveRoom(response.room);
      } else {
        setError(response.message || 'Failed to join room');
      }
    } catch (err: any) {
      setError(err.message || 'Connection error');
    } finally {
      setLoading(false);
    }
  };

  // Persist session logic
  React.useEffect(() => {
    if (activeRoom) {
      localStorage.setItem('active_room_id', activeRoom.id);
    }
  }, [activeRoom]);

  // Reconnection logic
  React.useEffect(() => {
    const savedRoomId = localStorage.getItem('active_room_id');
    if (savedRoomId && !activeRoom && playerId) {
      setLoading(true);
      connect();
      socketService.emitPromise('rejoin_room', { roomId: savedRoomId })
        .then(() => {
          // We don't get the room back directly in this event usually, but let's assume socket events 'room_update' handles it?
          // The backend 'rejoin_room' doesn't return a callback with room data in the current implementation, it emits updates.
          // However, let's try to invoke 'join_room' logic as a fallback or assume room_update catches it.
          // Actually, backend 'rejoin_room' DOES emit 'room_update'.
          // Let's rely on the socket listener in GameRoom... wait, GameRoom is not mounted yet!
          // We need to listen to 'room_update' HERE to switch state.
        })
        .catch(err => {
          console.warn("Reconnection failed", err);
          localStorage.removeItem('active_room_id'); // Clear invalid session
          setLoading(false);
        });
    }
  }, []);

  // Listener for room updates to switch view
  React.useEffect(() => {
    const socket = socketService.socket;
    const onRoomUpdate = (room: any) => {
      if (room && room.players.find((p: any) => p.id === playerId)) {
        setActiveRoom(room);
        setLoading(false);
      }
    };
    socket.on('room_update', onRoomUpdate);
    return () => { socket.off('room_update', onRoomUpdate); };
  }, [playerId]);


  if (activeRoom) {
    return <GameRoom room={activeRoom} currentPlayerId={playerId} />;
  }

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-10">
      <div className="bg-slate-800 rounded-2xl p-8 border border-slate-700 shadow-2xl">
        <h2 className="text-3xl font-bold text-white mb-2 flex items-center gap-3">
          <Users className="w-8 h-8 text-purple-500" /> Multiplayer Lobby
        </h2>
        <p className="text-slate-400 mb-8">Create a private room for your draft or join an existing one.</p>

        {error && (
          <div className="bg-red-900/50 border border-red-500 text-red-200 p-4 rounded-xl mb-6 flex items-center gap-3">
            <AlertCircle className="w-5 h-5" />
            {error}
          </div>
        )}

        <div className="space-y-6">
          <div>
            <label className="block text-sm font-bold text-slate-300 mb-2">Your Name</label>
            <input
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="Enter your nickname..."
              className="w-full bg-slate-900 border border-slate-700 rounded-xl p-4 text-white focus:ring-2 focus:ring-purple-500 outline-none text-lg"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4 border-t border-slate-700">
            {/* Create Room */}
            <div className={`space-y-4 ${generatedPacks.length === 0 ? 'opacity-50' : ''}`}>
              <h3 className="text-xl font-bold text-white">Create Room</h3>
              <p className="text-sm text-slate-400">Start a new draft with your {generatedPacks.length} generated packs.</p>
              <button
                onClick={handleCreateRoom}
                disabled={loading || generatedPacks.length === 0}
                className="w-full py-4 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-bold rounded-xl shadow-lg transform transition hover:scale-[1.02] flex justify-center items-center gap-2 disabled:cursor-not-allowed disabled:grayscale"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <PlusCircle className="w-5 h-5" />}
                {loading ? 'Creating...' : 'Create Private Room'}
              </button>
              {generatedPacks.length === 0 && (
                <p className="text-xs text-amber-500 text-center font-bold">Requires packs from Draft Management tab.</p>
              )}
            </div>

            {/* Join Room */}
            <div className="space-y-4">
              <h3 className="text-xl font-bold text-white">Join Room</h3>
              <p className="text-sm text-slate-400">Enter a code shared by your friend.</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={joinRoomId}
                  onChange={(e) => setJoinRoomId(e.target.value)}
                  placeholder="ROOM CODE"
                  className="flex-1 bg-slate-900 border border-slate-700 rounded-xl p-4 text-white font-mono uppercase text-lg text-center tracking-widest focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <button
                onClick={handleJoinRoom}
                disabled={loading}
                className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl shadow-lg transform transition hover:scale-[1.02] flex justify-center items-center gap-2"
              >
                <LogIn className="w-5 h-5" /> {loading ? 'Joining...' : 'Join Room'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
