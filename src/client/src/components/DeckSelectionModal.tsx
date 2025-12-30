
import React, { useState } from 'react';
import { useUser, SavedDeck } from '../contexts/UserContext';

import { Layers, Search, Clock, Hash, Check } from 'lucide-react';

interface DeckSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (deck: SavedDeck) => void;
  format?: string;
}

export const DeckSelectionModal: React.FC<DeckSelectionModalProps> = ({
  isOpen,
  onClose,
  onSelect,
  format
}) => {
  const { user } = useUser();
  const [search, setSearch] = useState('');
  const [selectedDeckId, setSelectedDeckId] = useState<string | null>(null);

  if (!isOpen) return null;

  const filteredDecks = (user?.decks || []).filter(deck => {
    // Filter by name
    if (search && !deck.name.toLowerCase().includes(search.toLowerCase())) return false;

    // Filter by format if strictly required? 
    // Usually we just warn, or maybe just show badge.
    // For now, let's show all but maybe sort by format match?
    return true;
  }).sort((a, b) => {
    // Sort by format match
    const aMatch = a.format?.toLowerCase() === format?.toLowerCase();
    const bMatch = b.format?.toLowerCase() === format?.toLowerCase();
    if (aMatch && !bMatch) return -1;
    if (!aMatch && bMatch) return 1;
    // Then by date
    return b.createdAt - a.createdAt;
  });

  const selectedDeck = user?.decks.find(d => d.id === selectedDeckId);

  const handleConfirm = () => {
    if (selectedDeck) {
      onSelect(selectedDeck);
    }
  };

  const getDeckColors = (deck: SavedDeck) => {
    // Heuristic: Count colors in cards
    // Since cards might be raw JSON or parsed objects, handle carefully
    // But in UserContext/UserManager we parse them.
    const cards = deck.cards || [];
    const colors = new Set<string>();
    cards.forEach((c: any) => {
      if (c.colors) c.colors.forEach((col: string) => colors.add(col));
      // fallback for mana_cost string scraping if valid colors not present?
    });
    return Array.from(colors).sort();
  };

  const ManaIcon = ({ color }: { color: string }) => {
    const colorMap: Record<string, string> = {
      'W': 'bg-yellow-100 text-yellow-800 border-yellow-300',
      'U': 'bg-blue-100 text-blue-800 border-blue-300',
      'B': 'bg-slate-300 text-slate-800 border-slate-400',
      'R': 'bg-red-100 text-red-800 border-red-300',
      'G': 'bg-green-100 text-green-800 border-green-300',
      'C': 'bg-slate-200 text-slate-600 border-slate-300'
    };
    return (
      <span className={`w - 4 h - 4 rounded - full flex items - center justify - center text - [10px] font - bold border ${colorMap[color] || 'bg-slate-200'} `}>
        {color}
      </span>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-4xl max-h-[80vh] flex flex-col">

        {/* Header */}
        <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-950/50 rounded-t-xl">
          <div>
            <h2 className="text-2xl font-bold text-white flex items-center gap-2">
              <Layers className="w-6 h-6 text-purple-500" />
              Select a Deck
            </h2>
            <p className="text-slate-400 text-sm mt-1">
              Choose a saved deck for this
              {format ? <span className="text-emerald-400 font-bold ml-1">{format}</span> : ''} game.
            </p>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              placeholder="Search decks..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-4 py-2 text-sm text-white focus:ring-2 focus:ring-purple-500 outline-none w-64"
            />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-900/50 custom-scrollbar">
          {filteredDecks.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-slate-500 opacity-50">
              <Layers className="w-16 h-16 mb-4" />
              <p>No decks found. Try building a new one!</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredDecks.map(deck => {
                const isSelected = selectedDeckId === deck.id;
                const isFormatMatch = !format || deck.format?.toLowerCase() === format.toLowerCase();
                const colors = getDeckColors(deck);
                const coverCard = deck.cards.find((c: any) => c.image_uris?.art_crop || c.image);
                const bgImage = coverCard?.image_uris?.art_crop || coverCard?.image || '';

                return (
                  <div
                    key={deck.id}
                    onClick={() => setSelectedDeckId(deck.id)}
                    className={`
                      relative group cursor - pointer overflow - hidden rounded - xl border - 2 transition - all duration - 200
                      ${isSelected ? 'border-purple-500 ring-2 ring-purple-500/30' : 'border-slate-700 hover:border-slate-500'}
                      ${!isFormatMatch ? 'opacity-70 grayscale-[0.5] hover:opacity-100 hover:grayscale-0' : ''}
`}
                  >
                    {/* Background Art */}
                    <div className="absolute inset-0 z-0 bg-slate-800">
                      {bgImage && <img src={bgImage} alt="" className="w-full h-full object-cover opacity-40 group-hover:opacity-60 transition-opacity" />}
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/80 to-transparent" />
                    </div>

                    {/* Content */}
                    <div className="relative z-10 p-4 h-full flex flex-col justify-end min-h-[140px]">
                      <div className="absolute top-3 right-3 flex gap-1">
                        {isSelected && <div className="bg-purple-600 text-white p-1 rounded-full"><Check className="w-4 h-4" /></div>}
                      </div>

                      <div className="absolute top-3 left-3">
                        {deck.format && (
                          <span className={`text - [10px] font - bold px - 2 py - 0.5 rounded uppercase tracking - wider border ${isFormatMatch ? 'bg-emerald-900/50 border-emerald-500 text-emerald-400' : 'bg-slate-800/80 border-slate-600 text-slate-400'} `}>
                            {deck.format}
                          </span>
                        )}
                      </div>

                      <h3 className="text-lg font-bold text-white group-hover:text-purple-300 transition-colors truncate mb-1 shadow-black drop-shadow-md">
                        {deck.name}
                      </h3>

                      <div className="flex items-center justify-between text-xs text-slate-400">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(deck.createdAt).toLocaleDateString()}
                        </span>
                        <div className="flex gap-0.5">
                          {colors.map(c => <ManaIcon key={c} color={c} />)}
                        </div>
                        <span className="flex items-center gap-1 bg-slate-900/80 px-1.5 py-0.5 rounded border border-slate-800">
                          <Hash className="w-3 h-3" />
                          {deck.cards.length}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950 flex justify-end gap-3 rounded-b-xl">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            Create New Deck
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selectedDeck}
            className="px-6 py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-lg shadow-lg shadow-purple-900/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
          >
            Select Deck <Check className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
