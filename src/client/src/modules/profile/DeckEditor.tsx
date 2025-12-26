import React, { useState, useMemo, useEffect } from 'react';
import { Save, Upload, X, Loader2, AlertCircle } from 'lucide-react';
import { CardParserService } from '../../services/CardParserService';
import { useUser, SavedDeck } from '../../contexts/UserContext';
import { useToast } from '../../components/Toast';

interface DeckEditorProps {
    existingDeck?: SavedDeck;
    onSave: () => void;
    onCancel: () => void;
}

export const DeckEditor: React.FC<DeckEditorProps> = ({ existingDeck, onSave, onCancel }) => {
    const { saveDeck, updateDeck, user } = useUser();
    const { showToast } = useToast();
    const parserService = useMemo(() => new CardParserService(), []);

    const [deckName, setDeckName] = useState(existingDeck?.name || `${user?.username}'s Deck`);
    const [format, setFormat] = useState(existingDeck?.format || 'Standard');
    const [inputText, setInputText] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (existingDeck) {
            // Convert existing deck cards back to text format for editing
            const textLines = existingDeck.cards.map(c => {
                if (c.type === 'id') return `1 [${c.value}]`;
                return `${c.quantity} ${c.value}`;
            });
            setInputText(textLines.join('\n'));
            setFormat(existingDeck.format || 'Standard');
        }
    }, [existingDeck]);

    const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => setInputText(e.target?.result as string || '');
        reader.readAsText(file);
        event.target.value = '';
    };

    const handleSave = async () => {
        if (!deckName.trim()) {
            setError('Please enter a deck name');
            return;
        }

        // Only validate input text in Edit mode (when existingDeck is present)
        // In Creation mode, we allow empty list (it serves as "Next" step effectively)
        if (existingDeck && !inputText.trim()) {
            // Optional: could allow saving empty even in edit mode, but usually you edit to add cards
        }

        setLoading(true);
        setError('');

        try {
            // Parse only if we have text, otherwise empty array
            const identifiers = inputText.trim() ? parserService.parse(inputText) : [];

            if (existingDeck) {
                await updateDeck(existingDeck.id, {
                    name: deckName,
                    cards: identifiers
                }, format);
                showToast('Deck updated!', 'success');
            } else {
                await saveDeck({
                    name: deckName,
                    cards: identifiers
                }, format);
                showToast('Deck created!', 'success');
            }
            onSave();
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    const formats = ['Standard', 'Pauper', 'Commander', 'Modern', 'Legacy', 'Draft', 'Sealed', 'Other'];

    return (
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 shadow-xl">
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                    <Save className="w-5 h-5 text-purple-400" />
                    {existingDeck ? 'Edit Deck' : 'Create New Deck'}
                </h3>
                <button onClick={onCancel} className="text-slate-400 hover:text-white transition-colors">
                    <X className="w-6 h-6" />
                </button>
            </div>

            {error && (
                <div className="bg-red-900/50 border border-red-500 text-red-200 p-4 rounded-xl mb-6 flex items-center gap-3">
                    <AlertCircle className="w-5 h-5" />
                    {error}
                </div>
            )}

            <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-bold text-slate-300 mb-2">Deck Name</label>
                        <input
                            type="text"
                            value={deckName}
                            onChange={(e) => setDeckName(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white focus:ring-2 focus:ring-purple-500 outline-none"
                            placeholder="My Awesome Deck"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-slate-300 mb-2">Game Format</label>
                        <select
                            value={format}
                            onChange={(e) => setFormat(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white focus:ring-2 focus:ring-purple-500 outline-none appearance-none"
                        >
                            {formats.map(f => <option key={f} value={f}>{f}</option>)}
                        </select>
                    </div>
                </div>

                {existingDeck ? (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
                        <div className="flex justify-between items-center mb-2">
                            <label className="text-sm font-bold text-slate-300">Deck List</label>
                        </div>

                        <div className="mb-2">
                            <label className="cursor-pointer w-full flex items-center justify-center gap-2 px-4 py-3 bg-slate-700 hover:bg-slate-600 border-2 border-dashed border-slate-500 rounded-lg text-slate-300 hover:text-white transition-colors">
                                <Upload className="w-4 h-4" />
                                <span>Import from Archidekt (.txt / .csv)</span>
                                <input type="file" className="hidden" accept=".txt,.csv" onChange={handleFileUpload} />
                            </label>
                        </div>

                        <textarea
                            className="w-full h-64 bg-slate-900 border border-slate-700 rounded-xl p-4 font-mono text-sm text-slate-300 focus:ring-2 focus:ring-purple-500 outline-none resize-none placeholder:text-slate-600"
                            placeholder={"4 Lightning Bolt\n4 Mountain\n..."}
                            value={inputText}
                            onChange={(e) => setInputText(e.target.value)}
                            disabled={loading}
                        />
                    </div>
                ) : (
                    <div className="bg-slate-900/50 p-6 rounded-xl border border-slate-800 text-center text-slate-400 text-sm">
                        <p>Create the deck first to start adding cards.</p>
                    </div>
                )}

                <div className="flex justify-end gap-3 pt-4">
                    <button
                        onClick={onCancel}
                        disabled={loading}
                        className="px-6 py-3 rounded-xl font-bold text-slate-300 hover:bg-slate-700 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={loading}
                        className="px-6 py-3 rounded-xl font-bold bg-purple-600 hover:bg-purple-500 text-white shadow-lg transition-transform hover:scale-[1.02] flex items-center gap-2"
                    >
                        {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                        {existingDeck ? 'Update Deck' : 'Create Deck'}
                    </button>
                </div>
            </div>
        </div>
    );
};
