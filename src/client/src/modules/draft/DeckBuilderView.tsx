
import React, { useState } from 'react';
import { socketService } from '../../services/SocketService';
import { Save, Layers, Clock } from 'lucide-react';

interface DeckBuilderViewProps {
  roomId: string;
  currentPlayerId: string;
  initialPool: any[];
  availableBasicLands?: any[];
}

export const DeckBuilderView: React.FC<DeckBuilderViewProps> = ({ initialPool, availableBasicLands = [] }) => {
  // Unlimited Timer (Static for now)
  const [timer] = useState<string>("Unlimited");
  const [pool, setPool] = useState<any[]>(initialPool);
  const [deck, setDeck] = useState<any[]>([]);
  const [lands, setLands] = useState({ Plains: 0, Island: 0, Swamp: 0, Mountain: 0, Forest: 0 });
  const [hoveredCard, setHoveredCard] = useState<any>(null);

  /* 
  // Disable timer countdown
  useEffect(() => {
    const interval = setInterval(() => {
      setTimer(t => t > 0 ? t - 1 : 0);
    }, 1000);
    return () => clearInterval(interval);
  }, []); 
  */

  // --- Land Advice Logic ---
  const landSuggestion = React.useMemo(() => {
    const targetLands = 17;
    // Count existing non-basic lands in deck
    const existingLands = deck.filter(c => c.type_line && c.type_line.includes('Land')).length;
    // We want to suggest basics to reach target
    const landsNeeded = Math.max(0, targetLands - existingLands);

    if (landsNeeded === 0) return null;

    // Count pips in spell costs
    const pips = { Plains: 0, Island: 0, Swamp: 0, Mountain: 0, Forest: 0 };
    let totalPips = 0;

    deck.forEach(card => {
      if (card.type_line && card.type_line.includes('Land')) return;
      if (!card.mana_cost) return;

      const cost = card.mana_cost;
      pips.Plains += (cost.match(/{W}/g) || []).length;
      pips.Island += (cost.match(/{U}/g) || []).length;
      pips.Swamp += (cost.match(/{B}/g) || []).length;
      pips.Mountain += (cost.match(/{R}/g) || []).length;
      pips.Forest += (cost.match(/{G}/g) || []).length;
    });

    totalPips = Object.values(pips).reduce((a, b) => a + b, 0);

    // If no colored pips (artifacts only?), suggest even split or just return 0s? 
    // Let's assume proportional to 1 if 0 to avoid div by zero.
    if (totalPips === 0) return null;

    // Distribute
    const suggestion = { Plains: 0, Island: 0, Swamp: 0, Mountain: 0, Forest: 0 };
    let allocated = 0;

    // First pass: floor
    (Object.keys(pips) as Array<keyof typeof pips>).forEach(type => {
      const count = Math.floor((pips[type] / totalPips) * landsNeeded);
      suggestion[type] = count;
      allocated += count;
    });

    // Remainder
    let remainder = landsNeeded - allocated;
    if (remainder > 0) {
      // Add to color with most pips
      const sortedTypes = (Object.keys(pips) as Array<keyof typeof pips>).sort((a, b) => pips[b] - pips[a]);
      for (let i = 0; i < remainder; i++) {
        suggestion[sortedTypes[i % sortedTypes.length]]++;
      }
    }

    return suggestion;
  }, [deck]);

  const applySuggestion = () => {
    if (!landSuggestion) return;

    // Check if we have available basic lands to add as real cards
    if (availableBasicLands && availableBasicLands.length > 0) {
      const newLands: any[] = [];

      Object.entries(landSuggestion).forEach(([type, count]) => {
        if (count <= 0) return;

        // Find matching land in availableBasicLands
        // We look for strict name match first, then potential fallback (e.g. snow lands)
        const landCard = availableBasicLands.find(l => l.name === type) ||
          availableBasicLands.find(l => l.name.includes(type));

        if (landCard) {
          for (let i = 0; i < count; i++) {
            const newLand = {
              ...landCard,
              // Ensure unique ID with index
              id: `land-${landCard.scryfallId}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}-${i}`,
              image_uris: landCard.image_uris || { normal: landCard.image }
            };
            newLands.push(newLand);
          }
        }
      });

      if (newLands.length > 0) {
        setDeck(prev => [...prev, ...newLands]);
      }
    } else {
      // Fallback: If no basic lands loaded (counter mode), use the old counter logic
      setLands(landSuggestion);
    }
  };

  // --- Helper Methods ---
  const formatTime = (seconds: number | string) => {
    return seconds; // Just return "Unlimited"
  };

  const addToDeck = (card: any) => {
    setPool(prev => prev.filter(c => c.id !== card.id));
    setDeck(prev => [...prev, card]);
  };

  const addLandToDeck = (land: any) => {
    // Create a unique instance
    const newLand = {
      ...land,
      id: `land-${land.scryfallId}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      image_uris: land.image_uris || { normal: land.image }
    };
    setDeck(prev => [...prev, newLand]);
  };

  const removeFromDeck = (card: any) => {
    setDeck(prev => prev.filter(c => c.id !== card.id));

    if (card.id.startsWith('land-')) {
      // Just delete 
    } else {
      setPool(prev => [...prev, card]);
    }
  };

  const handleLandChange = (type: string, delta: number) => {
    setLands(prev => ({ ...prev, [type]: Math.max(0, prev[type as keyof typeof lands] + delta) }));
  };

  const submitDeck = () => {
    const genericLandCards = Object.entries(lands).flatMap(([type, count]) => {
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

    const fullDeck = [...deck, ...genericLandCards];
    socketService.socket.emit('player_ready', { deck: fullDeck });
  };

  const sortedLands = React.useMemo(() => {
    return [...(availableBasicLands || [])].sort((a, b) => a.name.localeCompare(b.name));
  }, [availableBasicLands]);

  return (
    <div className="flex-1 w-full flex h-full bg-slate-900 text-white">
      {/* Column 1: Zoom Sidebar */}
      <div className="hidden xl:flex w-80 shrink-0 flex-col items-center justify-start pt-8 border-r border-slate-800 bg-slate-950/50 z-10 p-4">
        {hoveredCard ? (
          <div className="animate-in fade-in slide-in-from-left-4 duration-200 sticky top-4 w-full">
            <img
              src={hoveredCard.image || hoveredCard.image_uris?.normal || hoveredCard.card_faces?.[0]?.image_uris?.normal}
              alt={hoveredCard.name}
              className="w-full rounded-xl shadow-2xl shadow-black ring-1 ring-white/10"
            />
            <div className="mt-4 text-center">
              <h3 className="text-lg font-bold text-slate-200">{hoveredCard.name}</h3>
              <p className="text-xs text-slate-400 uppercase tracking-wider mt-1">{hoveredCard.type_line}</p>
              {hoveredCard.oracle_text && (
                <div className="mt-4 text-sm text-slate-400 text-left bg-slate-900/50 p-3 rounded-lg border border-slate-800">
                  {hoveredCard.oracle_text.split('\n').map((line: string, i: number) => <p key={i} className="mb-1">{line}</p>)}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-slate-600 text-center opacity-50">
            <div className="w-48 h-64 border-2 border-dashed border-slate-700 rounded-xl mb-4 flex items-center justify-center">
              <span className="text-xs uppercase font-bold tracking-widest">Hover Card</span>
            </div>
            <p className="text-sm">Hover over a card to view clear details.</p>
          </div>
        )}
      </div>

      {/* Column 2: Pool */}
      <div className="flex-1 p-4 flex flex-col border-r border-slate-700 min-w-0">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold flex items-center gap-2"><Layers /> Card Pool ({pool.length})</h2>
        </div>
        <div className="flex-1 overflow-y-auto p-2 bg-slate-950/50 rounded-lg custom-scrollbar">
          <div className="flex flex-wrap gap-2 justify-center content-start">
            {pool.map((card) => (
              <img
                key={card.id}
                src={card.image || card.image_uris?.normal || card.card_faces?.[0]?.image_uris?.normal}
                className="w-28 hover:scale-110 transition-transform cursor-pointer rounded shadow-md"
                onClick={() => addToDeck(card)}
                onMouseEnter={() => setHoveredCard(card)}
                onMouseLeave={() => setHoveredCard(null)}
                title={card.name}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Column 3: Deck & Lands */}
      <div className="flex-1 p-4 flex flex-col min-w-0">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">Your Deck ({deck.length + Object.values(lands).reduce((a, b) => a + b, 0)})</h2>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-amber-400 font-mono text-xl font-bold bg-slate-800 px-3 py-1 rounded border border-amber-500/30">
              <Clock className="w-5 h-5" /> {formatTime(timer)}
            </div>
            <button
              onClick={submitDeck}
              className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2 rounded-lg font-bold shadow-lg flex items-center gap-2 transition-transform hover:scale-105"
            >
              <Save className="w-4 h-4" /> Submit Deck
            </button>
          </div>
        </div>

        {/* Deck View */}
        <div className="flex-1 overflow-y-auto p-2 bg-slate-950/50 rounded-lg mb-4 custom-scrollbar">
          <div className="flex flex-wrap gap-2 justify-center content-start">
            {deck.map((card) => (
              <img
                key={card.id}
                src={card.image || card.image_uris?.normal || card.card_faces?.[0]?.image_uris?.normal}
                className="w-28 hover:scale-110 transition-transform cursor-pointer rounded shadow-md"
                onClick={() => removeFromDeck(card)}
                onMouseEnter={() => setHoveredCard(card)}
                onMouseLeave={() => setHoveredCard(null)}
                title={card.name}
              />
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">

          {/* Advice Panel */}
          <div className="bg-slate-800 rounded-lg p-3 border border-slate-700 flex justify-between items-center">
            <div className="flex flex-col">
              <span className="text-xs text-slate-400 font-bold uppercase flex items-center gap-2">
                <Layers className="w-3 h-3 text-emerald-400" /> Land Advisor (Target: 17)
              </span>
              <div className="text-xs text-slate-500 mt-1">
                Based on your deck's mana symbols.
              </div>
            </div>
            {landSuggestion ? (
              <div className="flex items-center gap-4">
                <div className="flex gap-2">
                  {(Object.entries(landSuggestion) as [string, number][]).map(([type, count]) => {
                    if (count === 0) return null;
                    let colorClass = "text-slate-300";
                    if (type === 'Plains') colorClass = "text-amber-200";
                    if (type === 'Island') colorClass = "text-blue-200";
                    if (type === 'Swamp') colorClass = "text-purple-200";
                    if (type === 'Mountain') colorClass = "text-red-200";
                    if (type === 'Forest') colorClass = "text-emerald-200";

                    return (
                      <div key={type} className={`font-bold ${colorClass} text-sm flex items-center gap-1`}>
                        <span>{type.substring(0, 1)}:</span>
                        <span>{count}</span>
                      </div>
                    )
                  })}
                </div>
                <button
                  onClick={applySuggestion}
                  className="bg-emerald-700 hover:bg-emerald-600 text-white text-xs px-3 py-1 rounded shadow transition-colors font-bold"
                >
                  Auto-Fill
                </button>
              </div>
            ) : (
              <span className="text-xs text-slate-500 italic">Add colored spells to get advice.</span>
            )}
          </div>

          {/* Land Station */}
          <div className="h-48 bg-slate-800 rounded-lg p-4 border border-slate-700 flex flex-col">
            <h3 className="text-sm font-bold text-slate-400 uppercase mb-2">Land Station (Unlimited)</h3>

            {availableBasicLands && availableBasicLands.length > 0 ? (
              <div className="flex-1 overflow-x-auto flex items-center gap-3 custom-scrollbar p-2 bg-slate-900/50 rounded-lg">
                {sortedLands.map((land) => (
                  <div
                    key={land.scryfallId}
                    className="flex-shrink-0 relative group cursor-pointer"
                    onClick={() => addLandToDeck(land)}
                    onMouseEnter={() => setHoveredCard(land)}
                    onMouseLeave={() => setHoveredCard(null)}
                  >
                    <img
                      src={land.image || land.image_uris?.normal}
                      className="w-24 rounded shadow-lg group-hover:scale-110 transition-transform"
                      alt={land.name}
                    />
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-black/40 rounded transition-opacity">
                      <span className="text-white font-bold text-xs bg-black/50 px-2 py-1 rounded">+ Add</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex justify-around items-center h-full">
                {Object.keys(lands).map(type => (
                  <div key={type} className="flex flex-col items-center gap-1">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-xs border-2 
                                        ${type === 'Plains' ? 'bg-amber-100 border-amber-300 text-amber-900' : ''}
                                        ${type === 'Island' ? 'bg-blue-100 border-blue-300 text-blue-900' : ''}
                                        ${type === 'Swamp' ? 'bg-purple-100 border-purple-300 text-purple-900' : ''}
                                        ${type === 'Mountain' ? 'bg-red-100 border-red-300 text-red-900' : ''}
                                        ${type === 'Forest' ? 'bg-green-100 border-green-300 text-green-900' : ''}
                                    `}>
                      {type[0]}
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => handleLandChange(type, -1)} className="w-8 h-8 bg-slate-700 rounded hover:bg-slate-600 flex items-center justify-center text-lg font-bold text-slate-300">-</button>
                      <span className="w-8 text-center font-bold text-lg">{lands[type as keyof typeof lands]}</span>
                      <button onClick={() => handleLandChange(type, 1)} className="w-8 h-8 bg-slate-700 rounded hover:bg-slate-600 flex items-center justify-center text-lg font-bold text-slate-300">+</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
