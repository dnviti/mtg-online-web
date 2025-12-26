import React, { useState, useMemo } from 'react';
import { Play, Upload, Loader2, AlertCircle, Save } from 'lucide-react';
import { CardParserService } from '../../services/CardParserService';
import { ScryfallService, ScryfallCard } from '../../services/ScryfallService';
import { socketService } from '../../services/SocketService';
import { GameRoom } from '../lobby/GameRoom';
import { useUser } from '../../contexts/UserContext';
import { useToast } from '../../components/Toast';

export const DeckTester: React.FC = () => {
  const parserService = useMemo(() => new CardParserService(), []);
  const scryfallService = useMemo(() => new ScryfallService(), []);
  const { user, saveDeck } = useUser();
  const { showToast } = useToast();

  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [activeRoom, setActiveRoom] = useState<any>(null);
  const [initialGame, setInitialGame] = useState<any>(null);
  const [playerId] = useState(() => Math.random().toString(36).substring(2) + Date.now().toString(36));
  const [playerName, setPlayerName] = useState('Tester');

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => setInputText(e.target?.result as string || '');
    reader.readAsText(file);
    event.target.value = '';
  };

  const handleTestDeck = async () => {
    if (!inputText.trim()) {
      setError('Please enter a deck list');
      return;
    }

    setLoading(true);
    setError('');
    setProgress('Parsing deck list...');

    try {
      // 1. Parse
      const identifiers = parserService.parse(inputText);
      const fetchList = identifiers.map(id => id.type === 'id' ? { id: id.value } : { name: id.value });

      // 2. Fetch from Scryfall
      const expandedCards: ScryfallCard[] = [];
      await scryfallService.fetchCollection(fetchList, (current, total) => {
        setProgress(`Fetching cards... (${current}/${total})`);
      });

      // 3. Expand Quantities
      identifiers.forEach(id => {
        const card = scryfallService.getCachedCard(id.type === 'id' ? { id: id.value } : { name: id.value });
        if (card) {
          for (let i = 0; i < id.quantity; i++) expandedCards.push(card);
        } else {
          console.warn("Card not found:", id.value);
        }
      });

      if (expandedCards.length === 0) {
        throw new Error("No valid cards found in list.");
      }

      // 4. Cache Images on Server
      setProgress('Caching images...');
      const uniqueCards = Array.from(new Map(expandedCards.map(c => [c.id, c])).values());
      const cardsToCache = uniqueCards.map(c => ({
        id: c.id,
        image_uris: { normal: c.image_uris?.normal || c.card_faces?.[0]?.image_uris?.normal || "" }
      }));

      const cacheResponse = await fetch('/api/cards/cache', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cards: cardsToCache })
      });

      if (!cacheResponse.ok) {
        console.warn("Failed to cache images, proceeding anyway...");
      }

      // 5. Update cards with local image paths
      const baseUrl = `${window.location.protocol}//${window.location.host}/cards`;
      const deckToSend = expandedCards.map(c => ({
        ...c,
        image: `${baseUrl}/${c.id}.jpg`
      }));

      // 6. Connect & Start Solo Game
      setProgress('Starting game...');
      if (!socketService.socket.connected) {
        socketService.connect();
      }

      const response = await socketService.emitPromise('start_solo_test', {
        playerId,
        playerName,
        deck: deckToSend
      });

      if (response.success) {
        setInitialGame(response.game);
        setActiveRoom(response.room);
      } else {
        throw new Error(response.message || "Failed to start game");
      }

    } catch (err: any) {
      console.error(err);
      setError(err.message || "An error occurred");
    } finally {
      setLoading(false);
      setProgress('');
    }
  };

  const handleSaveDeck = async () => {
  if (!inputText.trim()) {
    setError('Please enter a deck list');
    return;
  }

  if (!user) {
    setError('You must be logged in to save decks.');
    return;
  }

  try {
    setLoading(true);
    // Basic parse to check validity
    const identifiers = parserService.parse(inputText);
    if (identifiers.length === 0) throw new Error("Deck list is empty");

    await saveDeck({
      name: `${playerName}'s Deck ${new Date().toLocaleDateString()}`,
      cards: identifiers // Saving identifier list to reconstruct later
    });

    showToast('Deck saved to profile!', 'success');
  } catch (e: any) {
    setError(e.message);
  } finally {
    setLoading(false);
  }
};

const handleExitTester = () => {
  setActiveRoom(null);
  setInitialGame(null);
};

if (activeRoom) {
  return <GameRoom room={activeRoom} currentPlayerId={playerId} initialGameState={initialGame} onExit={handleExitTester} />;
}

return (
  <div className="h-full overflow-y-auto max-w-4xl mx-auto p-4 md:p-8">
    <div className="bg-slate-800 rounded-2xl p-8 border border-slate-700 shadow-2xl">
      <h2 className="text-3xl font-bold text-white mb-2 flex items-center gap-3">
        <Play className="w-8 h-8 text-emerald-500" /> Deck Tester
      </h2>
      <p className="text-slate-400 mb-8">Paste your deck list below to instantly test it on the battlefield.</p>

      {error && (
        <div className="bg-red-900/50 border border-red-500 text-red-200 p-4 rounded-xl mb-6 flex items-center gap-3">
          <AlertCircle className="w-5 h-5" />
          {error}
        </div>
      )}

      <div className="space-y-6">
        <div>
          <label className="block text-sm font-bold text-slate-300 mb-2">Player Name</label>
          <input
            type="text"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none"
          />
        </div>

        <div>
          <div className="flex justify-between items-center mb-2">
            <label className="text-sm font-bold text-slate-300">Deck List</label>
            <label className="cursor-pointer text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 hover:underline">
              <Upload className="w-3 h-3" /> Upload .txt
              <input type="file" className="hidden" accept=".txt,.csv" onChange={handleFileUpload} />
            </label>
          </div>
          <textarea
            className="w-full h-64 bg-slate-900 border border-slate-700 rounded-xl p-4 font-mono text-sm text-slate-300 focus:ring-2 focus:ring-emerald-500 outline-none resize-none placeholder:text-slate-600"
            placeholder={"4 Lightning Bolt\n4 Mountain\n..."}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            disabled={loading}
          />
        </div>

        <div className="flex gap-4">
          <button
            onClick={handleSaveDeck}
            disabled={loading || !inputText || !user}
            className={`flex-1 py-4 rounded-xl font-bold text-lg shadow-lg flex justify-center items-center gap-2 transition-all ${loading || !inputText || !user
              ? 'bg-slate-700 cursor-not-allowed text-slate-500'
              : 'bg-purple-600 hover:bg-purple-500 text-white transform hover:scale-[1.01]'
              }`}
            title={!user ? "Login to save decks" : "Save Deck"}
          >
            <Save className="w-6 h-6" /> Save Deck
          </button>

          <button
            onClick={handleTestDeck}
            disabled={loading || !inputText}
            className={`flex-[2] py-4 rounded-xl font-bold text-lg shadow-lg flex justify-center items-center gap-2 transition-all ${loading
              ? 'bg-slate-700 cursor-not-allowed text-slate-500'
              : 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white transform hover:scale-[1.01]'
              }`}
          >
            {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : <Play className="w-6 h-6 fill-current" />}
            {loading ? progress : 'Start Test Game'}
          </button>
        </div>
      </div>
    </div>
  </div>
);
};
