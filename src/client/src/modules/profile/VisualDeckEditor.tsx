import React, { useState } from 'react';
import { DeckBuilderView } from '../draft/DeckBuilderView';
import { useUser, SavedDeck } from '../../contexts/UserContext';
import { useToast } from '../../components/Toast';
import { GameLogProvider } from '../../contexts/GameLogContext';
import { ApiService } from '../../services/ApiService';

interface VisualDeckEditorProps {
  existingDeck?: SavedDeck;
  initialName?: string;
  initialFormat?: string;
  onSave: () => void;
  onCancel: () => void;
}

import { DeckMetadataModal } from '../draft/DeckMetadataModal';
import { Pencil } from 'lucide-react';

export const VisualDeckEditor: React.FC<VisualDeckEditorProps> = ({ existingDeck, initialName, initialFormat, onSave: _onSave, onCancel }) => {
  const { saveDeck, updateDeck, user } = useUser();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [basicLands, setBasicLands] = useState<any[]>([]);

  // Track the current deck ID (for new decks, this gets set after first save)
  const [currentDeckId, setCurrentDeckId] = useState<string | undefined>(existingDeck?.id);

  // Metadata State
  const [deckName, setDeckName] = useState(existingDeck?.name || initialName || 'New Deck');
  const [deckFormat, setDeckFormat] = useState(existingDeck?.format || initialFormat || 'Standard');
  const [isMetadataModalOpen, setIsMetadataModalOpen] = useState(false);

  React.useEffect(() => {
    // Fetch fallback lands (J25) for constructed mode
    const fetchLands = async () => {
      try {
        const data = await ApiService.get<any[]>('/api/lands/fallback');
        setBasicLands(data);
      } catch (e) {
        console.error("Failed to fetch fallback lands", e);
      }
    };
    fetchLands();
  }, []);

  // Initial parsing of deck cards
  const initialDeck = React.useMemo(() => {
    if (!existingDeck) return [];
    return existingDeck.cards.map(c => ({
      ...c,
      id: c.id || `card-${Math.random().toString(36)}`,
    }));
  }, [existingDeck]);

  const handleDeckSubmit = async (deckCards: any[]) => {
    if (!user) return;
    setLoading(true);

    try {
      // Use currentDeckId if available (either from existingDeck or from previous save)
      if (currentDeckId) {
        await updateDeck(currentDeckId, {
          name: deckName,
          cards: deckCards
        }, deckFormat);
        showToast('Deck salvato', 'success');
      } else {
        // Create new deck and store its ID for subsequent saves
        const newDeck = await saveDeck({
          name: deckName,
          cards: deckCards
        }, deckFormat);
        setCurrentDeckId(newDeck.id);
        showToast('Deck creato', 'success');
      }
      // Don't call onSave() - stay in the editor
    } catch (e: any) {
      console.error(e);
      showToast(e.message || 'Failed to save deck', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <GameLogProvider>
      <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col">
        {/* Header Overlay for Cancel/Context */}
        <div className="bg-slate-900 border-b border-slate-800 p-2 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-2 ml-4">
            <button
              onClick={() => setIsMetadataModalOpen(true)}
              className="flex items-center gap-2 hover:bg-slate-800 px-3 py-1.5 rounded-lg transition-colors group"
              title="Edit Deck Name & Format"
            >
              <div className="flex flex-col items-start">
                <h2 className="text-white font-bold text-lg group-hover:text-emerald-400 transition-colors flex items-center gap-2">
                  {deckName}
                  <Pencil className="w-4 h-4 text-slate-500 group-hover:text-emerald-500 opacity-0 group-hover:opacity-100 transition-all" />
                </h2>
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">{deckFormat}</span>
              </div>
            </button>
          </div>
          <button onClick={onCancel} className="text-slate-400 hover:text-white px-4 py-2">
            Close
          </button>
        </div>

        <div className="flex-1 overflow-hidden relative">
          <DeckBuilderView
            roomId="builder"
            currentPlayerId={user?.id || 'offline'}
            initialPool={[]}
            initialDeck={initialDeck}
            availableBasicLands={basicLands}
            isConstructed={true}
            format={deckFormat}
            deckName={deckName}
            onSubmit={handleDeckSubmit}
            submitLabel={loading ? "Saving..." : "Save Changes"}
          />
        </div>

        <DeckMetadataModal
          isOpen={isMetadataModalOpen}
          onClose={() => setIsMetadataModalOpen(false)}
          initialName={deckName}
          initialFormat={deckFormat}
          isConstructed={true}
          onSave={(name, fmt) => {
            setDeckName(name);
            setDeckFormat(fmt);
          }}
        />
      </div>
    </GameLogProvider>
  );
};
