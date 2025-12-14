
import React, { useState, useEffect } from 'react';
import { socketService } from '../../services/SocketService';
import { Save, Layers, Clock } from 'lucide-react';

interface DeckBuilderViewProps {
  roomId: string;
  currentPlayerId: string;
  initialPool: any[];
}

export const DeckBuilderView: React.FC<DeckBuilderViewProps> = ({ roomId, currentPlayerId, initialPool }) => {
  const [timer, setTimer] = useState(45 * 60); // 45 minutes
  const [pool, setPool] = useState<any[]>(initialPool);
  const [deck, setDeck] = useState<any[]>([]);
  const [lands, setLands] = useState({ Plains: 0, Island: 0, Swamp: 0, Mountain: 0, Forest: 0 });

  useEffect(() => {
    const interval = setInterval(() => {
      setTimer(t => t > 0 ? t - 1 : 0);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const addToDeck = (card: any) => {
    setPool(prev => prev.filter(c => c !== card));
    setDeck(prev => [...prev, card]);
  };

  const removeFromDeck = (card: any) => {
    setDeck(prev => prev.filter(c => c !== card));
    setPool(prev => [...prev, card]);
  };

  const handleLandChange = (type: string, delta: number) => {
    setLands(prev => ({ ...prev, [type]: Math.max(0, prev[type as keyof typeof lands] + delta) }));
  };

  const submitDeck = () => {
    // Construct final deck list including lands
    const landCards = Object.entries(lands).flatMap(([type, count]) => {
      // Placeholder images for basic lands for now or just generic objects
      const landUrlMap: any = {
        Plains: "https://cards.scryfall.io/normal/front/d/1/d1ea1858-ad25-4d13-9860-25c898b02c42.jpg",
        Island: "https://cards.scryfall.io/normal/front/2/f/2f3069b3-c15c-4399-ab99-c88c0379435b.jpg",
        Swamp: "https://cards.scryfall.io/normal/front/1/7/17d0571f-df6c-4b53-912f-9cb4d5a9d224.jpg",
        Mountain: "https://cards.scryfall.io/normal/front/f/5/f5383569-42b7-4c07-b67f-2736bc88bd37.jpg",
        Forest: "https://cards.scryfall.io/normal/front/1/f/1fa688da-901d-4876-be11-884d6b677271.jpg"
      };

      return Array(count).fill(null).map((_, i) => ({
        id: `basic-${type}-${i}`,
        name: type,
        image_uris: { normal: landUrlMap[type] },
        type_line: "Basic Land"
      }));
    });

    const fullDeck = [...deck, ...landCards];

    // Need a way to submit single deck to server to hold until everyone ready
    // For now we reuse start_game but modifying it to separate per player?
    // No, GameRoom/Server expects 'decks' map in start_game. 
    // We need a 'submit_deck' event.
    // But for prototype, assume host clicks start with all decks?
    // Better: Client emits 'submit_deck', server stores it in Room. When all submitted, Server emits 'all_ready' or Host can start.
    // For simplicity: We will just emit 'start_game' with OUR deck for solo test or wait for update.

    // Hack for MVP: Just trigger start game and pass our deck as if it's for everyone (testing) or 
    // Real way: Send deck to server.
    // We'll implement a 'submit_deck' on server later? 
    // Let's rely on the updated start_game which takes decks.
    // Host will gather decks? No, that's P2P.
    // Let's emit 'submit_deck' payload.

    const payload = {
      [currentPlayerId]: fullDeck
    };
    // We need a way to accumulate decks on server.
    // Let's assume we just log it for now and Host starts game with dummy decks or we add logic.
    // Actually, user rules say "Host ... guided ... configuring packs ... multiplayer".

    // I'll emit 'submit_deck' event (need to handle in server)
    socketService.socket.emit('player_ready', { roomId, playerId: currentPlayerId, deck: fullDeck });
  };

  return (
    <div className="flex h-full bg-slate-900 text-white">
      {/* Left: Pool */}
      <div className="w-1/2 p-4 flex flex-col border-r border-slate-700">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold flex items-center gap-2"><Layers /> Card Pool ({pool.length})</h2>
          <div className="flex gap-2">
            {/* Filter buttons could go here */}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2 bg-slate-950/50 rounded-lg">
          <div className="flex flex-wrap gap-2 justify-center">
            {pool.map((card, i) => (
              <img
                key={card.id + i}
                src={card.image || card.image_uris?.normal || card.card_faces?.[0]?.image_uris?.normal}
                className="w-32 hover:scale-105 transition-transform cursor-pointer rounded"
                onClick={() => addToDeck(card)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Right: Deck & Lands */}
      <div className="w-1/2 p-4 flex flex-col">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">Your Deck ({deck.length + Object.values(lands).reduce((a, b) => a + b, 0)})</h2>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-amber-400 font-mono text-xl font-bold bg-slate-800 px-3 py-1 rounded border border-amber-500/30">
              <Clock className="w-5 h-5" /> {formatTime(timer)}
            </div>
            <button
              onClick={submitDeck}
              className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2 rounded-lg font-bold shadow-lg flex items-center gap-2"
            >
              <Save className="w-4 h-4" /> Submit Deck
            </button>
          </div>
        </div>

        {/* Deck View */}
        <div className="flex-1 overflow-y-auto p-2 bg-slate-950/50 rounded-lg mb-4">
          <div className="flex flex-wrap gap-2 justify-center">
            {deck.map((card, i) => (
              <img
                key={card.id + i}
                src={card.image || card.image_uris?.normal || card.card_faces?.[0]?.image_uris?.normal}
                className="w-32 hover:scale-105 transition-transform cursor-pointer rounded"
                onClick={() => removeFromDeck(card)}
              />
            ))}
            {/* Visual representation of lands? Maybe just count for now */}
          </div>
        </div>

        {/* Land Station */}
        <div className="h-32 bg-slate-800 rounded-lg p-4 border border-slate-700">
          <h3 className="text-sm font-bold text-slate-400 uppercase mb-2">Basic Lands</h3>
          <div className="flex justify-around items-center">
            {Object.keys(lands).map(type => (
              <div key={type} className="flex flex-col items-center gap-1">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs border-2 
                                ${type === 'Plains' ? 'bg-amber-100 border-amber-300 text-amber-900' : ''}
                                ${type === 'Island' ? 'bg-blue-100 border-blue-300 text-blue-900' : ''}
                                ${type === 'Swamp' ? 'bg-purple-100 border-purple-300 text-purple-900' : ''}
                                ${type === 'Mountain' ? 'bg-red-100 border-red-300 text-red-900' : ''}
                                ${type === 'Forest' ? 'bg-green-100 border-green-300 text-green-900' : ''}
                             `}>
                  {type[0]}
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => handleLandChange(type, -1)} className="w-6 h-6 bg-slate-700 rounded hover:bg-slate-600">-</button>
                  <span className="w-6 text-center text-sm font-bold">{lands[type as keyof typeof lands]}</span>
                  <button onClick={() => handleLandChange(type, 1)} className="w-6 h-6 bg-slate-700 rounded hover:bg-slate-600">+</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
