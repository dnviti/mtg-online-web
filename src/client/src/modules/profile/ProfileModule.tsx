import React from 'react';
import { useUser } from '../../contexts/UserContext';
import { LogOut, Trash2, Calendar, Layers, Clock } from 'lucide-react';
import { useToast } from '../../components/Toast';
import { DeckEditor } from './DeckEditor';

export const ProfileModule: React.FC = () => {
    const { user, logout, deleteDeck } = useUser();
    const { showToast } = useToast();

    const [editingDeck, setEditingDeck] = React.useState<any>(null);
    const [isCreating, setIsCreating] = React.useState(false);

    if (!user) return null;

    if (editingDeck || isCreating) {
        return (
            <div className="p-6 max-w-4xl mx-auto h-full overflow-y-auto">
                <DeckEditor
                    existingDeck={editingDeck}
                    onSave={() => {
                        setEditingDeck(null);
                        setIsCreating(false);
                    }}
                    onCancel={() => {
                        setEditingDeck(null);
                        setIsCreating(false);
                    }}
                />
            </div>
        );
    }

    const handleDelete = async (id: string) => {
        if (confirm('Are you sure you want to delete this deck?')) {
            try {
                await deleteDeck(id);
                showToast('Deck deleted', 'success');
            } catch (e: any) {
                showToast(e.message, 'error');
            }
        }
    };

    return (
        <div className="p-6 max-w-6xl mx-auto h-full overflow-y-auto">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4 border-b border-slate-700 pb-6">
                <div>
                    <h2 className="text-3xl font-bold text-white mb-2 flex items-center gap-3">
                        <span className="bg-purple-600 rounded-full w-10 h-10 flex items-center justify-center text-lg">
                            {(user.username || '?').charAt(0).toUpperCase()}
                        </span>
                        {user.username || 'User'}
                    </h2>
                    <p className="text-slate-400 flex items-center gap-2 text-sm">
                        <Clock className="w-4 h-4" /> Member since {new Date(user.createdAt).toLocaleDateString()}
                    </p>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={() => setIsCreating(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded transition-colors shadow-lg"
                    >
                        <Layers className="w-4 h-4" /> New Deck
                    </button>
                    <button
                        onClick={logout}
                        className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded transition-colors border border-slate-600"
                    >
                        <LogOut className="w-4 h-4" /> Sign Out
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Saved Decks Section */}
                <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
                    <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                        <Layers className="w-5 h-5 text-purple-400" /> Saved Decks
                    </h3>

                    {(user.decks || []).length === 0 ? (
                        <div className="text-center py-10 text-slate-500 bg-slate-800/30 rounded-lg">
                            <Layers className="w-12 h-12 mx-auto mb-2 opacity-20" />
                            <p>No saved decks yet.</p>
                            <p className="text-sm mt-1">Create a new deck to get started.</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {(user.decks || []).map(deck => (
                                <div key={deck.id} className="bg-slate-900 border border-slate-700 rounded-lg p-4 flex justify-between items-center group hover:border-purple-500/50 transition-colors">
                                    <div className="cursor-pointer flex-1" onClick={() => setEditingDeck(deck)}>
                                        <h4 className="font-bold text-slate-200 group-hover:text-purple-400 transition-colors">{deck.name}</h4>
                                        <p className="text-xs text-slate-500 mt-1 flex items-center gap-2">
                                            <span>{deck.cards.length} Cards</span>
                                            <span>•</span>
                                            <span>{new Date(deck.createdAt).toLocaleDateString()}</span>
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button
                                            onClick={() => handleDelete(deck.id)}
                                            className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-400/10 rounded-full transition-colors"
                                            title="Delete Deck"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Match History Section */}
                <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
                    <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                        <Calendar className="w-5 h-5 text-emerald-400" /> Recent History
                    </h3>

                    {(user.matchHistory || []).length === 0 ? (
                        <div className="text-center py-10 text-slate-500 bg-slate-800/30 rounded-lg">
                            <Calendar className="w-12 h-12 mx-auto mb-2 opacity-20" />
                            <p>No match history yet.</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {/* Not implemented yet in backend fully, simplified placeholder */}
                            <p className="text-slate-500">Coming soon.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
