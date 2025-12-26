import React, { useState } from 'react';
import { DeckBuilderView } from '../draft/DeckBuilderView';
import { useUser, SavedDeck } from '../../contexts/UserContext';
import { useToast } from '../../components/Toast';
import { GameLogProvider } from '../../contexts/GameLogContext';

interface VisualDeckEditorProps {
    existingDeck?: SavedDeck;
    onSave: () => void;
    onCancel: () => void;
}

export const VisualDeckEditor: React.FC<VisualDeckEditorProps> = ({ existingDeck, onSave, onCancel }) => {
    const { saveDeck, updateDeck, user } = useUser();
    const { showToast } = useToast();
    const [loading, setLoading] = useState(false);
    const [basicLands, setBasicLands] = useState<any[]>([]);

    React.useEffect(() => {
        // Fetch fallback lands (J25) for constructed mode
        const fetchLands = async () => {
            try {
                const res = await fetch('/api/lands/fallback');
                if (res.ok) {
                    const data = await res.json();
                    setBasicLands(data);
                }
            } catch (e) {
                console.error("Failed to fetch fallback lands", e);
            }
        };
        fetchLands();
    }, []);

    // Initial parsing of deck cards
    const initialDeck = React.useMemo(() => {
        if (!existingDeck) return [];
        // Transform SavedDeck cards (which might be minimal) to full objects if possible
        // The SavedDeck stores `cards` as parsed JSON.
        // Assuming the structure matches loosely what DeckBuilderView expects or we map it.
        // DeckBuilderView expects DraftCard-like structure.
        return existingDeck.cards.map(c => ({
            ...c,
            // Ensure ID is unique enough for the view
            id: c.id || `card-${Math.random().toString(36)}`,
            // Ensure Image properties exist. If they are missing in DB, we handled it?
            // Usually DB stores full object or at least necessary parts.
            // If they are just scryfallIds, we might have issue displaying them without fetching.
            // But checking UserManager.ts, it stores "JSON.stringify(cards)".
            // If "cards" comes from DeckBuilderView submit, it has everything.
            // If it comes from Text Import, it has parsed data.
        }));
    }, [existingDeck]);

    const handleDeckSubmit = async (deckCards: any[]) => {
        if (!user) return;
        setLoading(true);

        try {
            const deckName = existingDeck?.name || `${user.username}'s Deck`;
            const format = existingDeck?.format || 'Standard';

            // Clean up cards for saving (remove temporary specific view IDs if needed, but for now exact state is fine)
            // Actually DeckBuilderView assigns ephemeral IDs like `land-Island-...`.
            // We can keep them to preserve exact instances.

            if (existingDeck) {
                await updateDeck(existingDeck.id, {
                    name: deckName,
                    cards: deckCards
                }, format);
                showToast('Deck updated successfully', 'success');
            } else {
                await saveDeck({
                    name: deckName,
                    cards: deckCards
                }, format);
                showToast('Deck saved successfully', 'success');
            }
            onSave();
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
                    <h2 className="text-white font-bold ml-4">{existingDeck?.name || 'New Deck'}</h2>
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
                        format={existingDeck?.format || 'Standard'}
                        onSubmit={handleDeckSubmit}
                        submitLabel={loading ? "Saving..." : "Save Changes"}
                    />
                </div>
            </div>
        </GameLogProvider>
    );
};
