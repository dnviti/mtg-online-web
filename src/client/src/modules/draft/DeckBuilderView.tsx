import React, { useState } from 'react';
import { socketService } from '../../services/SocketService';
import { Save, Layers, Clock, Columns, LayoutTemplate } from 'lucide-react';

interface DeckBuilderViewProps {
  roomId: string;
  currentPlayerId: string;
  initialPool: any[];
  availableBasicLands?: any[];
}

export const DeckBuilderView: React.FC<DeckBuilderViewProps> = ({ initialPool, availableBasicLands = [] }) => {
  // Unlimited Timer (Static for now)
  const [timer] = useState<string>("Unlimited");
  const [layout, setLayout] = useState<'vertical' | 'horizontal'>('vertical');
  const [pool, setPool] = useState<any[]>(initialPool);
  const [deck, setDeck] = useState<any[]>([]);
  const [lands, setLands] = useState({ Plains: 0, Island: 0, Swamp: 0, Mountain: 0, Forest: 0 });
  const [hoveredCard, setHoveredCard] = useState<any>(null);

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

  // --- Sub Actions ---
  const renderAdvisorContent = () => {
    if (!landSuggestion) return <span className="text-xs text-slate-500 italic">Add colored spells to get advice.</span>;

    return (
      <div className="flex items-center gap-4 flex-wrap">
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
              <div key={type} className={`font-bold ${colorClass} text-xs flex items-center gap-1`}>
                <span>{type.substring(0, 1)}:</span>
                <span>{count}</span>
              </div>
            )
          })}
        </div>
        <button
          onClick={applySuggestion}
          className="bg-emerald-700 hover:bg-emerald-600 text-white text-[10px] px-2 py-1 rounded shadow transition-colors font-bold uppercase tracking-wide"
        >
          Auto-Fill
        </button>
      </div>
    );
  }

  // --- Render Sections ---
  const renderLandStation = () => (
    <div className={`bg-slate-800 rounded-lg border border-slate-700 flex flex-col ${layout === 'horizontal' ? 'h-full' : 'h-72'} transition-all`}>
      <div className="p-3 border-b border-slate-700 flex flex-col gap-2 shrink-0 bg-slate-900/30">
        <div className="flex justify-between items-center">
          <h3 className="text-sm font-bold text-slate-400 uppercase">Land Station</h3>
        </div>

        {/* Integrated Advisor */}
        <div className="bg-slate-950/50 rounded border border-white/5 p-2 flex flex-col gap-1">
          <span className="text-[10px] text-emerald-400 font-bold uppercase flex items-center gap-1">
            <Layers className="w-3 h-3" /> Land Advisor (Target: 17)
          </span>
          {renderAdvisorContent()}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-2 bg-slate-900/50 rounded-b-lg">
        {availableBasicLands && availableBasicLands.length > 0 ? (
          <div className={`grid ${layout === 'horizontal' ? 'grid-cols-2' : 'grid-flow-col auto-cols-max'} gap-2 content-start`}>
            {/* Note: horizontal layout gets grid-cols-2 for vertical scrolling list feeling, vertical layout gets side-scrolling or wrapped */}
            <div className="flex flex-wrap gap-2 justify-center">
              {sortedLands.map((land) => (
                <div
                  key={land.scryfallId}
                  className="relative group cursor-pointer"
                  onClick={() => addLandToDeck(land)}
                  onMouseEnter={() => setHoveredCard(land)}
                  onMouseLeave={() => setHoveredCard(null)}
                >
                  <img
                    src={land.image || land.image_uris?.normal}
                    className="w-20 hover:scale-105 transition-transform rounded shadow-lg"
                    alt={land.name}
                  />
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-black/40 rounded transition-opacity">
                    <span className="text-white font-bold text-xs bg-black/50 px-1 rounded">+</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          // Fallback counter UI
          <div className="flex flex-col gap-2 p-2">
            {Object.keys(lands).map(type => (
              <div key={type} className="flex items-center justify-between bg-slate-800 p-2 rounded">
                <div className="flex items-center gap-2">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs border
                                       ${type === 'Plains' ? 'bg-amber-900/50 border-amber-500 text-amber-200' : ''}
                                       ${type === 'Island' ? 'bg-blue-900/50 border-blue-500 text-blue-200' : ''}
                                       ${type === 'Swamp' ? 'bg-purple-900/50 border-purple-500 text-purple-200' : ''}
                                       ${type === 'Mountain' ? 'bg-red-900/50 border-red-500 text-red-200' : ''}
                                       ${type === 'Forest' ? 'bg-green-900/50 border-green-500 text-green-200' : ''}
                                   `}>
                    {type[0]}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => handleLandChange(type, -1)} className="w-6 h-6 bg-slate-700 hover:bg-slate-600 rounded text-slate-300 font-bold">-</button>
                  <span className="w-6 text-center text-sm font-bold">{lands[type as keyof typeof lands]}</span>
                  <button onClick={() => handleLandChange(type, 1)} className="w-6 h-6 bg-slate-700 hover:bg-slate-600 rounded text-slate-300 font-bold">+</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  const renderPool = () => (
    <>
      <div className="flex justify-between items-center mb-4 shrink-0">
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
    </>
  );

  const renderDeck = () => (
    <>
      <div className="flex justify-between items-center mb-4 shrink-0">
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

      <div className="flex-1 overflow-y-auto p-2 bg-slate-950/50 rounded-lg custom-scrollbar">
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
    </>
  );

  return (
    <div className="flex-1 w-full flex h-full bg-slate-900 text-white overflow-hidden relative">
      {/* View Switcher - Absolute Positioned */}
      <div className="absolute bottom-4 left-84 z-20 flex bg-slate-800/80 backdrop-blur rounded-lg p-1 border border-slate-700 shadow-xl gap-1" style={{ left: '330px' }}>
        <button
          onClick={() => setLayout('vertical')}
          className={`p-2 rounded flex items-center gap-2 text-xs font-bold transition-colors ${layout === 'vertical' ? 'bg-slate-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
          title="Cards Side-by-Side"
        >
          <Columns className="w-4 h-4" /> Vertical
        </button>
        <button
          onClick={() => setLayout('horizontal')}
          className={`p-2 rounded flex items-center gap-2 text-xs font-bold transition-colors ${layout === 'horizontal' ? 'bg-slate-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
          title="Pool Above Deck"
        >
          <LayoutTemplate className="w-4 h-4" /> Horizontal
        </button>
      </div>

      {/* Column 1: Zoom Sidebar (Always visible) */}
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

      {/* Main Content Area */}
      {layout === 'vertical' ? (
        <>
          {/* Vertical: Column 2 (Pool) */}
          <div className="flex-1 p-4 flex flex-col border-r border-slate-700 min-w-0">
            {renderPool()}
          </div>
          {/* Vertical: Column 3 (Deck & Lands) */}
          <div className="flex-1 p-4 flex flex-col min-w-0">
            {renderDeck()}
            <div className="mt-4">
              {renderLandStation()}
            </div>
          </div>
        </>
      ) : (
        /* Horizontal Layout */
        <div className="flex-1 flex flex-col min-w-0">
          {/* Top Row: Lands + Pool */}
          <div className="flex-1 flex min-h-0 border-b border-slate-700">
            {/* Land Station (Left of Pool) */}
            <div className="w-[300px] p-4 border-r border-slate-700 flex flex-col">
              {renderLandStation()}
            </div>
            {/* Pool */}
            <div className="flex-1 p-4 flex flex-col min-w-0">
              {renderPool()}
            </div>
          </div>
          {/* Bottom Row: Deck */}
          <div className="h-[40%] p-4 flex flex-col bg-slate-900/50">
            {renderDeck()}
          </div>
        </div>
      )}
    </div>
  );
};
