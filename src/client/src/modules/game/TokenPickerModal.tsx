import React, { useState, useEffect } from 'react';
import { X, Search } from 'lucide-react';
import { CardInstance } from '../../types/game';
import { socketService } from '../../services/SocketService';


interface TokenPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (token: any) => void;
  // We might pass the current Set Code if known, or GameView handles fetching
  setCode?: string;
}

export const TokenPickerModal: React.FC<TokenPickerModalProps> = ({ isOpen, onClose, onSelect, setCode }) => {
  const [tokens, setTokens] = useState<any[]>([]);
  const [filteredTokens, setFilteredTokens] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterType, setFilterType] = useState<string>('All');
  const [search, setSearch] = useState('');

  // Fetch tokens when modal opens or setCode changes
  useEffect(() => {
    if (isOpen && setCode) {
      setLoading(true);
      socketService.socket.emit('get_set_tokens', { setCode }, (response: any) => {
        setLoading(false);
        if (response.success && response.tokens) {
          setTokens(response.tokens);
          setFilteredTokens(response.tokens);
        } else {
          console.warn('Failed to fetch tokens or no tokens found', response.message);
          setTokens([]);
        }
      });
    }
  }, [isOpen, setCode]);

  useEffect(() => {
    let result = tokens;

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(t => t.name.toLowerCase().includes(q) || t.oracle_text?.toLowerCase().includes(q));
    }

    if (filterType !== 'All') {
      if (filterType === 'Creature') {
        result = result.filter(t => t.type_line.includes('Creature'));
      } else if (filterType === 'Artifact') {
        result = result.filter(t => t.type_line.includes('Artifact') && !t.type_line.includes('Creature'));
      } else if (filterType === 'Emblem') {
        result = result.filter(t => t.type_line.includes('Emblem'));
      }
    }

    setFilteredTokens(result);
  }, [tokens, search, filterType]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-[800px] h-[600px] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-950/50">
          <div>
            <h2 className="text-xl font-bold text-emerald-400">Create Token</h2>
            <p className="text-sm text-slate-400">Drafting Set: <span className="text-white uppercase">{setCode || "Unknown"}</span></p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors text-slate-400 hover:text-white">
            <X size={24} />
          </button>
        </div>

        {/* Filters */}
        <div className="p-4 bg-slate-900/80 border-b border-slate-700 flex gap-4 items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
            <input
              type="text"
              placeholder="Search tokens..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-full pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
            />
          </div>
          <div className="flex bg-slate-800 p-1 rounded-lg">
            {['All', 'Creature', 'Artifact', 'Emblem'].map(type => (
              <button
                key={type}
                onClick={() => setFilterType(type)}
                className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all ${filterType === type ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-slate-950/30">
          {loading ? (
            <div className="flex items-center justify-center h-full text-emerald-400">
              <span className="animate-pulse">Loading Tokens...</span>
            </div>
          ) : filteredTokens.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-500">
              <p>No tokens found for this set.</p>
              <button
                onClick={() => onClose()} // Or trigger Custom Token Modal? 
                className="mt-4 px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded text-sm text-white transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-4">
              {filteredTokens.map(token => {
                // Mock CardInstance for display
                const cardDisplay: Partial<CardInstance> = {
                  instanceId: 'preview',
                  name: token.name,
                  // Prefer Crop for preview if available? Or normal?
                  // CardComponent uses normal usually.
                  imageUrl: token.local_path_full || token.image_uris?.normal || token.card_faces?.[0]?.image_uris?.normal || "",
                  // Fallback logic handled in CardComponent now
                  typeLine: token.type_line,
                  power: token.power || token.card_faces?.[0]?.power,
                  toughness: token.toughness || token.card_faces?.[0]?.toughness,
                  scryfallId: token.id
                };

                return (
                  <div
                    key={token.id}
                    className="group relative aspect-[5/7] cursor-pointer transition-transform hover:scale-105"
                    onClick={() => onSelect(token)}
                  >
                    <img
                      src={cardDisplay.imageUrl || '/images/token.jpg'} // Explicit fallback here just in case, but CardComponent handles it too
                      alt={token.name}
                      className="w-full h-full object-cover rounded-xl shadow-lg border border-transparent group-hover:border-emerald-400/50"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = '/images/token.jpg'; // Path fallback
                      }}
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors rounded-xl flex items-center justify-center opacity-0 group-hover:opacity-100">
                      <span className="bg-emerald-600 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-xl transform translate-y-4 group-hover:translate-y-0 transition-all">
                        Create
                      </span>
                    </div>
                    <div className="mt-2 text-center">
                      <p className="text-xs text-slate-300 font-medium truncate px-1">{token.name}</p>
                      <p className="text-[10px] text-slate-500 truncate">{token.type_line}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 bg-slate-900 border-t border-slate-700 text-center text-xs text-slate-500">
          Click to spawn token. Requires set data to be cached.
        </div>
      </div>
    </div>
  );
};
