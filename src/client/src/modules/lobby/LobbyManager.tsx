
import React, { useState, useEffect } from 'react';
import { useGameContext } from '../../contexts/GameSocketContext';
import { GameRoom } from './GameRoom';
import { Pack } from '../../services/PackGeneratorService';
import { Users, PlusCircle, LogIn, AlertCircle, Loader2, Package, Check } from 'lucide-react';
import { useUser } from '../../contexts/UserContext';
import { Modal } from '../../components/Modal';
import { ApiService } from '../../services/ApiService';

interface LobbyManagerProps {
  generatedPacks: Pack[];
  availableLands: any[]; // DraftCard[]
}

export const LobbyManager: React.FC<LobbyManagerProps> = ({ generatedPacks, availableLands = [] }) => {
  const { user } = useUser();
  const {
    activeRoom,
    gameState,
    isConnected,
    error: socketError,
    connect,
    createRoom,
    joinRoom,
    rejoinRoom,
    leaveRoom,
    setActiveRoom, // We might need to clear it manually on loading
    setGameState,
    draftState
  } = useGameContext();

  const [playerName, setPlayerName] = useState(() => {
    if (user && user.username) return user.username;
    return localStorage.getItem('player_name') || '';
  });
  const [selectedFormat, setSelectedFormat] = useState('commander');
  const [joinRoomId, setJoinRoomId] = useState('');
  const [localError, setLocalError] = useState('');
  const [loading, setLoading] = useState(false);

  const [playerId] = useState(() => {
    const saved = localStorage.getItem('player_id');
    if (saved) return saved;
    const newId = Math.random().toString(36).substring(2) + Date.now().toString(36);
    localStorage.setItem('player_id', newId);
    return newId;
  });

  // Persist player name
  useEffect(() => {
    if (user?.username) {
      setPlayerName(user.username);
    } else {
      localStorage.setItem('player_name', playerName);
    }
  }, [playerName, user]);

  const [showBoxSelection, setShowBoxSelection] = useState(false);
  const [availableBoxes, setAvailableBoxes] = useState<{ id: string, title: string, packs: Pack[], setCode: string, packCount: number }[]>([]);
  const [showExistingRoomsDialog, setShowExistingRoomsDialog] = useState(false);
  const [existingRooms, setExistingRooms] = useState<any[]>([]);
  const [pendingRoomCreation, setPendingRoomCreation] = useState<Pack[] | null>(null);

  // Sync socket error to local error
  useEffect(() => {
    if (socketError) setLocalError(socketError);
  }, [socketError]);

  const executeCreateRoom = async (packsToUse: Pack[], forceNew: boolean = false) => {
    setLoading(true);
    setLocalError('');

    // CRITICAL: Signal that we're intentionally creating a new room
    // This prevents auto-reconnect logic from interfering
    setIsCreatingNewRoom(true);

    // Clear old room reference BEFORE creating a new room
    localStorage.removeItem('active_room_id');

    connect();

    try {
      // Collect all cards for caching (packs + basic lands)
      const allCards = packsToUse.flatMap(p => p.cards);
      const allCardsAndLands = [...allCards, ...availableLands];
      const uniqueCards = Array.from(new Map(allCardsAndLands.map(c => [c.scryfallId, c])).values());

      const cardsToCache = uniqueCards.map(c => ({
        id: c.scryfallId,
        set: c.setCode,
        image_uris: { normal: c.image }
      }));

      // Cache images on server (API call)
      await ApiService.post('/api/cards/cache', { cards: cardsToCache });

      const response = await createRoom({
        hostId: playerId,
        hostName: playerName,
        packs: packsToUse,
        basicLands: availableLands,
        format: selectedFormat,
        forceNew
      });

      if (!response.success) {
        // Check if the response indicates existing rooms
        if (response.hasExistingRooms && response.existingRooms) {
          setExistingRooms(response.existingRooms);
          setPendingRoomCreation(packsToUse);
          setShowExistingRoomsDialog(true);
          setLoading(false);
          setShowBoxSelection(false);
          return;
        }
        setLocalError(response.message || 'Failed to create room');
      }
      // Hook updates activeRoom automatically on success via state update or listener
      if (response.room) setActiveRoom(response.room);

    } catch (err: any) {
      console.error(err);
      setLocalError(err.message || 'Connection error');
    } finally {
      setLoading(false);
      setShowBoxSelection(false);
      setIsCreatingNewRoom(false);
    }
  };

  const handleCreateRoom = async () => {
    if (!playerName) {
      setLocalError('Please enter your name');
      return;
    }
    if (selectedFormat === 'draft' && generatedPacks.length === 0) {
      setLocalError('No packs generated! Please go to Draft Management and generate packs first.');
      return;
    }

    const packsBySet: Record<string, Pack[]> = {};
    generatedPacks.forEach(p => {
      const key = p.setName;
      if (!packsBySet[key]) packsBySet[key] = [];
      packsBySet[key].push(p);
    });

    const boxes: { id: string, title: string, packs: Pack[], setCode: string, packCount: number }[] = [];
    Object.keys(packsBySet).sort().forEach(setName => {
      const setPacks = packsBySet[setName];
      const BOX_SIZE = 36;
      for (let i = 0; i < setPacks.length; i += BOX_SIZE) {
        const chunk = setPacks.slice(i, i + BOX_SIZE);
        const boxNum = Math.floor(i / BOX_SIZE) + 1;
        const setCode = (chunk[0].cards[0]?.setCode || 'unk').toLowerCase();
        boxes.push({
          id: `${setCode}-${boxNum}-${Date.now()}`,
          title: `${setName} - Box ${boxNum}`,
          packs: chunk,
          setCode: setCode,
          packCount: chunk.length
        });
      }
    });

    if (boxes.length > 1) {
      setAvailableBoxes(boxes);
      setShowBoxSelection(true);
      return;
    }

    executeCreateRoom(generatedPacks);
  };

  const handleJoinRoom = async () => {
    if (!playerName) {
      setLocalError('Please enter your name');
      return;
    }
    if (!joinRoomId) {
      setLocalError('Please enter a Room ID');
      return;
    }

    setLoading(true);
    setLocalError('');
    connect();

    try {
      const response = await joinRoom({
        roomId: joinRoomId.toUpperCase(),
        playerId,
        playerName
      });

      if (response.success) {
        // gameState and room are set by hook
        if (response.draftState) {
          // handled by event
        }
        // Explicitly set active room with tournament data if provided to avoid race conditions
        if (response.room) {
          const roomToSet = { ...response.room };
          if (response.tournament) {
            roomToSet.tournament = response.tournament;
          }
          setActiveRoom(roomToSet);
        }
      } else {
        setLocalError(response.message || 'Failed to join room');
      }
    } catch (err: any) {
      setLocalError(err.message || 'Connection error');
    } finally {
      setLoading(false);
    }
  };

  // Track if user is intentionally creating a new room (to skip auto-reconnect)
  const [isCreatingNewRoom, setIsCreatingNewRoom] = useState(false);

  // Reconnection Logic using Hook
  useEffect(() => {
    // Skip auto-reconnect if user is intentionally creating a new room
    if (isCreatingNewRoom) {
      console.log(`[LobbyManager] Skipping auto-reconnect - user is creating a new room`);
      return;
    }

    const savedRoomId = localStorage.getItem('active_room_id');
    if (savedRoomId && !activeRoom && playerId && isConnected) {
      console.log(`[LobbyManager] Found saved session ${savedRoomId}. Rejoining...`);
      setLoading(true);
      rejoinRoom({ roomId: savedRoomId, playerId })
        .then(response => {
          if (response.success) {
            // Server emits 'draft_update' manually to this socket on rejoin.
            // Context listener should pick it up.
            // Ensure we update activeRoom if response returns it, and MERGE tournament data if present
            if (response.room) {
              const roomToSet = { ...response.room };
              if (response.tournament) {
                roomToSet.tournament = response.tournament;
              }
              setActiveRoom(roomToSet);
            }
          } else {
            // Clear invalid room reference to prevent future auto-reconnect attempts
            console.log(`[LobbyManager] Rejoin failed: ${response.message}. Clearing saved room.`);
            localStorage.removeItem('active_room_id');
          }
        })
        .catch((err) => {
          console.warn('[LobbyManager] Rejoin error:', err);
          // On error, also clear to prevent stuck state
          localStorage.removeItem('active_room_id');
        })
        .finally(() => setLoading(false));
    } else if (savedRoomId && !isConnected) {
      connect();
      // Effect will re-run when isConnected becomes true
    }
  }, [isConnected, playerId, activeRoom, rejoinRoom, connect, isCreatingNewRoom]);

  // Persist session
  useEffect(() => {
    if (activeRoom) {
      localStorage.setItem('active_room_id', activeRoom.id);
    }
  }, [activeRoom]);

  const handleExitRoom = () => {
    if (activeRoom) {
      leaveRoom({ roomId: activeRoom.id, playerId });
    }
    localStorage.removeItem('active_room_id');
    setGameState(null); // Clear game state from hook
    setActiveRoom(null); // Clear room from hook
  };

  const handleRejoinExistingRoom = async (room: any) => {
    setShowExistingRoomsDialog(false);
    setIsCreatingNewRoom(false); // Reset flag since user chose to rejoin instead
    setLoading(true);
    setLocalError('');

    try {
      const response = await rejoinRoom({ roomId: room.id, playerId });
      if (response.success) {
        if (response.room) {
          const roomToSet = { ...response.room };
          if (response.tournament) {
            roomToSet.tournament = response.tournament;
          }
          setActiveRoom(roomToSet);
        }
      } else {
        setLocalError(response.message || 'Failed to rejoin room');
      }
    } catch (err: any) {
      setLocalError(err.message || 'Connection error');
    } finally {
      setLoading(false);
      setPendingRoomCreation(null);
    }
  };

  const handleForceCreateNewRoom = () => {
    setShowExistingRoomsDialog(false);
    if (pendingRoomCreation) {
      executeCreateRoom(pendingRoomCreation, true);
    }
  };

  if (activeRoom) {
    return <GameRoom
      room={activeRoom}
      currentPlayerId={playerId}
      onExit={handleExitRoom}
      initialGameState={gameState} // Pass hook state 
      initialDraftState={draftState}
    />;
  }

  return (
    <div className="h-full overflow-y-auto max-w-4xl mx-auto p-4 md:p-10">
      <div className="bg-slate-800 rounded-2xl p-8 border border-slate-700 shadow-2xl">
        <h2 className="text-3xl font-bold text-white mb-2 flex items-center gap-3">
          <Users className="w-8 h-8 text-purple-500" /> Multiplayer Lobby
        </h2>
        <p className="text-slate-400 mb-8">Create a private room for your draft or join an existing one.</p>

        {localError && (
          <div className="bg-red-900/50 border border-red-500 text-red-200 p-4 rounded-xl mb-6 flex items-center gap-3">
            <AlertCircle className="w-5 h-5" />
            {localError}
          </div>
        )}

        <div className="space-y-6">
          <div>
            <label className="block text-sm font-bold text-slate-300 mb-2">Game Format</label>
            <select
              value={selectedFormat}
              onChange={(e) => setSelectedFormat(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl p-4 text-white focus:ring-2 focus:ring-purple-500 outline-none text-lg mb-4"
            >
              <option value="commander">Commander (EDH)</option>
              <option value="standard">Standard</option>
              <option value="modern">Modern</option>
              <option value="pioneer">Pioneer</option>
              <option value="legacy">Legacy</option>
              <option value="vintage">Vintage</option>
              <option value="pauper">Pauper</option>
            </select>
            <p className="text-xs text-slate-500 mb-4">
              <span className="text-purple-400">Suggerimento:</span> Per avviare un draft, vai su <span className="font-bold">Draft Management</span> e genera i pack.
            </p>

            <label className="block text-sm font-bold text-slate-300 mb-2">Your Name</label>
            {user ? (
              <div className="w-full bg-slate-800 border border-slate-700/50 rounded-xl p-4 text-emerald-400 font-bold text-lg flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                Playing as: {user.username}
              </div>
            ) : (
              <input
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="Enter your nickname..."
                className="w-full bg-slate-900 border border-slate-700 rounded-xl p-4 text-white focus:ring-2 focus:ring-purple-500 outline-none text-lg"
              />
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4 border-t border-slate-700">
            {/* Create Room */}
            <div className="space-y-4">
              <h3 className="text-xl font-bold text-white">Create Room</h3>

              <div className="text-sm text-slate-400">
                Create a lobby for Constructed play. Players will select their decks matching the format.
              </div>

              <button
                onClick={handleCreateRoom}
                disabled={loading}
                className="w-full py-4 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-bold rounded-xl shadow-lg transform transition hover:scale-[1.02] flex justify-center items-center gap-2 disabled:cursor-not-allowed disabled:grayscale"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <PlusCircle className="w-5 h-5" />}
                {loading ? 'Creating...' : 'Create Private Room'}
              </button>
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

      {/* Existing Rooms Dialog */}
      <Modal
        isOpen={showExistingRoomsDialog}
        onClose={() => {
          setShowExistingRoomsDialog(false);
          setPendingRoomCreation(null);
          setIsCreatingNewRoom(false);
        }}
        title="Existing Open Rooms Found"
        message="You have existing open rooms. Would you like to rejoin one of them or create a new room?"
        type="warning"
        maxWidth="max-w-3xl"
      >
        <div className="mt-6 space-y-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 max-h-64 overflow-y-auto custom-scrollbar">
            <h3 className="text-sm font-bold text-slate-300 mb-3">Your Open Rooms:</h3>
            <div className="space-y-2">
              {existingRooms.map((room) => (
                <div
                  key={room.id}
                  className="bg-slate-800 border border-slate-600 rounded-lg p-4 hover:border-purple-500 transition-colors"
                >
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <div className="font-mono text-lg font-bold text-white">{room.id}</div>
                      <div className="text-sm text-slate-400">
                        Status: <span className="capitalize text-slate-300">{room.status}</span>
                      </div>
                      <div className="text-sm text-slate-400">
                        Players: <span className="text-slate-300">{room.players.length}/{room.maxPlayers}</span>
                      </div>
                      {room.format && (
                        <div className="text-sm text-slate-400">
                          Format: <span className="capitalize text-slate-300">{room.format}</span>
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => handleRejoinExistingRoom(room)}
                      disabled={loading}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {loading ? 'Rejoining...' : 'Rejoin'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-between items-center pt-4 border-t border-slate-700">
            <button
              onClick={() => {
                setShowExistingRoomsDialog(false);
                setPendingRoomCreation(null);
                setIsCreatingNewRoom(false);
              }}
              className="px-4 py-2 text-slate-400 hover:text-white transition-colors text-sm font-bold"
            >
              Cancel
            </button>
            <button
              onClick={handleForceCreateNewRoom}
              disabled={loading}
              className="px-6 py-2 bg-purple-600 hover:bg-purple-500 text-white text-sm font-bold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Creating...' : 'Create New Room'}
            </button>
          </div>
        </div>
      </Modal>

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
