
import React, { useState } from 'react';
import { socketService } from '../../services/SocketService';
import { GameRoom } from './GameRoom';
import { Pack } from '../../services/PackGeneratorService';
import { Users, PlusCircle, LogIn, AlertCircle, Loader2, Package, Check } from 'lucide-react';
import { Modal } from '../../components/Modal';

interface LobbyManagerProps {
  generatedPacks: Pack[];
  availableLands: any[]; // DraftCard[]
}

export const LobbyManager: React.FC<LobbyManagerProps> = ({ generatedPacks, availableLands = [] }) => {
  const [activeRoom, setActiveRoom] = useState<any>(null);
  const [playerName, setPlayerName] = useState(() => localStorage.getItem('player_name') || '');
  const [joinRoomId, setJoinRoomId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [initialDraftState, setInitialDraftState] = useState<any>(null);

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

  const [showBoxSelection, setShowBoxSelection] = useState(false);
  const [availableBoxes, setAvailableBoxes] = useState<{ id: string, title: string, packs: Pack[], setCode: string, packCount: number }[]>([]);

  const connect = () => {
    if (!socketService.socket.connected) {
      socketService.connect();
    }
  };

  const executeCreateRoom = async (packsToUse: Pack[]) => {
    setLoading(true);
    setError('');
    connect();

    try {
      // Collect all cards for caching (packs + basic lands)
      const allCards = packsToUse.flatMap(p => p.cards);
      const allCardsAndLands = [...allCards, ...availableLands];

      // Deduplicate by Scryfall ID
      const uniqueCards = Array.from(new Map(allCardsAndLands.map(c => [c.scryfallId, c])).values());

      // Prepare payload for server (generic structure expected by CardService)
      const cardsToCache = uniqueCards.map(c => ({
        id: c.scryfallId,
        set: c.setCode, // Required for folder organization
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

      // Transform packs and lands to use local URLs
      // Note: For multiplayer, clients need to access this URL.
      const baseUrl = `${window.location.protocol}//${window.location.host}/cards/images`;

      const updatedPacks = packsToUse.map(pack => ({
        ...pack,
        cards: pack.cards.map(c => ({
          ...c,
          // Update the single image property used by DraftCard
          image: `${baseUrl}/${c.setCode}/${c.scryfallId}.jpg`
        }))
      }));

      const updatedBasicLands = availableLands.map(l => ({
        ...l,
        image: `${baseUrl}/${l.setCode}/${l.scryfallId}.jpg`
      }));

      const response = await socketService.emitPromise('create_room', {
        hostId: playerId,
        hostName: playerName,
        packs: updatedPacks,
        basicLands: updatedBasicLands
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
      setShowBoxSelection(false);
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

    // Logic to detect Multiple Boxes
    // 1. Group by Set Name
    const packsBySet: Record<string, Pack[]> = {};
    generatedPacks.forEach(p => {
      const key = p.setName;
      if (!packsBySet[key]) packsBySet[key] = [];
      packsBySet[key].push(p);
    });

    const boxes: { id: string, title: string, packs: Pack[], setCode: string, packCount: number }[] = [];

    // Sort sets alphabetically
    Object.keys(packsBySet).sort().forEach(setName => {
      const setPacks = packsBySet[setName];
      const BOX_SIZE = 36;

      // Split into chunks of 36
      for (let i = 0; i < setPacks.length; i += BOX_SIZE) {
        const chunk = setPacks.slice(i, i + BOX_SIZE);
        const boxNum = Math.floor(i / BOX_SIZE) + 1;
        const setCode = (chunk[0].cards[0]?.setCode || 'unk').toLowerCase();

        boxes.push({
          id: `${setCode}-${boxNum}-${Date.now()}`, // Unique ID
          title: `${setName} - Box ${boxNum}`,
          packs: chunk,
          setCode: setCode,
          packCount: chunk.length
        });
      }
    });

    // Strategy: If we have multiple boxes, or if we have > 36 packs but maybe not multiple "boxes" (e.g. 50 packs of mixed),
    // we should interpret them.
    // The prompt says: "more than 1 box has been generated".
    // If I generate 2 boxes (72 packs), `boxes` array will have length 2.
    // If I generate 1 box (36 packs), `boxes` array will have length 1.

    if (boxes.length > 1) {
      setAvailableBoxes(boxes);
      setShowBoxSelection(true);
      return;
    }

    // If only 1 box (or partial), just use all packs
    executeCreateRoom(generatedPacks);
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
        setInitialDraftState(response.draftState || null);
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
      socketService.emitPromise('rejoin_room', { roomId: savedRoomId, playerId })
        .then((response: any) => {
          if (response.success) {
            console.log("Rejoined session successfully");
            setActiveRoom(response.room);
            if (response.draftState) {
              setInitialDraftState(response.draftState);
            }
          } else {
            console.warn("Rejoin failed by server: ", response.message);
            localStorage.removeItem('active_room_id');
            setLoading(false);
          }
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


  const handleExitRoom = () => {
    if (activeRoom) {
      socketService.socket.emit('leave_room', { roomId: activeRoom.id, playerId });
    }
    setActiveRoom(null);
    setInitialDraftState(null);
    localStorage.removeItem('active_room_id');
  };

  if (activeRoom) {
    return <GameRoom room={activeRoom} currentPlayerId={playerId} onExit={handleExitRoom} initialDraftState={initialDraftState} />;
  }

  return (
    <div className="h-full overflow-y-auto max-w-4xl mx-auto p-4 md:p-10">
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
              <div className="flex justify-between items-start">
                <h3 className="text-xl font-bold text-white">Create Room</h3>
                <div className="group relative">
                  <AlertCircle className="w-5 h-5 text-slate-500 cursor-help hover:text-white transition-colors" />
                  <div className="absolute w-64 right-0 bottom-full mb-2 bg-slate-900 border border-slate-700 p-3 rounded-lg shadow-xl text-xs text-slate-300 hidden group-hover:block z-50">
                    <strong className="block text-white mb-2 pb-1 border-b border-slate-700">Draft Rules (3 packs/player)</strong>
                    <ul className="space-y-1">
                      <li className={generatedPacks.length < 12 ? 'text-red-400' : 'text-slate-500'}>
                        • &lt; 12 Packs: Not enough for draft
                      </li>
                      <li className={(generatedPacks.length >= 12 && generatedPacks.length < 18) ? 'text-emerald-400 font-bold' : 'text-slate-500'}>
                        • 12-17 Packs: 4 Players
                      </li>
                      <li className={(generatedPacks.length >= 18 && generatedPacks.length < 24) ? 'text-emerald-400 font-bold' : 'text-slate-500'}>
                        • 18-23 Packs: 4 or 6 Players
                      </li>
                      <li className={generatedPacks.length >= 24 ? 'text-emerald-400 font-bold' : 'text-slate-500'}>
                        • 24+ Packs: 4, 6 or 8 Players
                      </li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="text-sm text-slate-400">
                Start a new draft with your <span className="text-white font-bold">{generatedPacks.length}</span> generated packs.
                <div className="mt-1 text-xs">
                  Supported Players: {' '}
                  {generatedPacks.length < 12 && <span className="text-red-400 font-bold">None (Generate more packs)</span>}
                  {generatedPacks.length >= 12 && generatedPacks.length < 18 && <span className="text-emerald-400 font-bold">4 Only</span>}
                  {generatedPacks.length >= 18 && generatedPacks.length < 24 && <span className="text-emerald-400 font-bold">4 or 6</span>}
                  {generatedPacks.length >= 24 && <span className="text-emerald-400 font-bold">4, 6 or 8</span>}
                </div>
              </div>

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
      {/* Box Selection Modal */}
      <Modal
        isOpen={showBoxSelection}
        onClose={() => setShowBoxSelection(false)}
        title="Select Sealed Box"
        message="Multiple boxes available. Please select a sealed box to open for this draft."
        type="info"
        maxWidth="max-w-3xl"
      >
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-[60vh] overflow-y-auto custom-scrollbar p-1">
          {availableBoxes.map(box => (
            <button
              key={box.id}
              onClick={() => executeCreateRoom(box.packs)}
              className="group relative flex flex-col items-center p-6 bg-slate-900 border border-slate-700 rounded-xl hover:border-purple-500 hover:bg-slate-800 transition-all shadow-xl hover:shadow-purple-900/20"
            >
              <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="bg-purple-600 rounded-full p-1 shadow-lg shadow-purple-500/50">
                  <Check className="w-4 h-4 text-white" />
                </div>
              </div>

              {/* Box Graphic simulation */}
              <div className="w-24 h-32 mb-4 relative perspective-1000 group-hover:scale-105 transition-transform duration-300">
                <div className="absolute inset-0 bg-slate-800 rounded border border-slate-600 transform rotate-y-12 translate-z-4 shadow-2xl flex items-center justify-center overflow-hidden">
                  {/* Set Icon as Box art */}
                  <img
                    src={`https://svgs.scryfall.io/sets/${box.setCode}.svg?1734307200`}
                    alt={box.setCode}
                    className="w-16 h-16 opacity-20 group-hover:opacity-50 transition-opacity invert"
                  />
                  <Package className="absolute bottom-2 right-2 w-6 h-6 text-slate-500" />
                </div>
                <div className="absolute inset-0 bg-gradient-to-br from-transparent to-black/50 pointer-events-none rounded"></div>
              </div>

              <h3 className="font-bold text-white text-center text-lg leading-tight mb-1 group-hover:text-purple-400 transition-colors">
                {box.title}
              </h3>
              <div className="flex items-center gap-2 text-xs text-slate-500 font-mono uppercase tracking-wider">
                <span className="bg-slate-800 px-2 py-0.5 rounded border border-slate-700">{box.setCode.toUpperCase()}</span>
                <span>•</span>
                <span>{box.packCount} Packs</span>
              </div>
            </button>
          ))}
        </div>
        <div className="mt-6 flex justify-end">
          <button
            onClick={() => setShowBoxSelection(false)}
            className="px-4 py-2 text-slate-400 hover:text-white transition-colors text-sm font-bold"
          >
            Cancel
          </button>
        </div>
      </Modal>
    </div>
  );
};
