import React, { useState, useRef } from 'react';
import { X, Link, FileText, Loader2, ExternalLink, AlertCircle, CheckCircle, Upload } from 'lucide-react';
import { ApiService } from '../../services/ApiService';

interface ImportedCard {
    name: string;
    quantity: number;
    section?: string;
}

interface ImportedDeck {
    name: string;
    format: string;
    cards: ImportedCard[];
    commanders?: ImportedCard[];
    sideboard?: ImportedCard[];
    source: string;
    originalUrl?: string;
    resolvedCards?: any[]; // Full Scryfall card data when resolved
}

interface ImportDeckModalProps {
    isOpen: boolean;
    onClose: () => void;
    onImport: (deck: ImportedDeck) => void;
    /** When true, hides name/format fields (for adding cards to existing deck) */
    mergeMode?: boolean;
}

type TabType = 'url' | 'text';

const FORMATS = [
    'Standard',
    'Commander',
    'Modern',
    'Pioneer',
    'Legacy',
    'Vintage',
    'Pauper',
    'Limited'
];

export const ImportDeckModal: React.FC<ImportDeckModalProps> = ({ isOpen, onClose, onImport, mergeMode = false }) => {
    const [activeTab, setActiveTab] = useState<TabType>('url');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [preview, setPreview] = useState<ImportedDeck | null>(null);

    // URL Import state
    const [url, setUrl] = useState('');
    const [detectedSource, setDetectedSource] = useState<string | null>(null);
    const [urlFormat, setUrlFormat] = useState('Standard');

    // Text Import state
    const [text, setText] = useState('');
    const [deckName, setDeckName] = useState('');
    const [selectedFormat, setSelectedFormat] = useState('Standard');
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const content = event.target?.result as string;
            if (content) {
                setText(content);
                // Use filename as deck name if not set
                if (!deckName) {
                    const nameWithoutExt = file.name.replace(/\.(csv|txt)$/i, '');
                    setDeckName(nameWithoutExt);
                }
            }
        };
        reader.readAsText(file);
        // Reset input so same file can be selected again
        e.target.value = '';
    };

    // Preview format (can be edited before saving)
    const [previewFormat, setPreviewFormat] = useState<string | null>(null);

    if (!isOpen) return null;

    const detectSource = async (inputUrl: string) => {
        if (!inputUrl) {
            setDetectedSource(null);
            return;
        }

        try {
            const response = await ApiService.post<{ success: boolean; source: string; deckId: string | null }>('/api/import/parse-url', { url: inputUrl });
            if (response.success && response.source !== 'unknown') {
                setDetectedSource(response.source);
                setError(null);
            } else {
                setDetectedSource(null);
                setError('URL non riconosciuta. Supportati: Archidekt, Moxfield');
            }
        } catch {
            setDetectedSource(null);
        }
    };

    const handleUrlChange = (value: string) => {
        setUrl(value);
        setError(null);
        setPreview(null);
        // Debounce source detection
        const timeoutId = setTimeout(() => detectSource(value), 500);
        return () => clearTimeout(timeoutId);
    };

    const handleUrlImport = async () => {
        if (!url) {
            setError('Inserisci un URL');
            return;
        }

        setLoading(true);
        setError(null);
        setPreview(null);

        try {
            // Request full Scryfall card resolution for complete metadata
            const response = await ApiService.post<{ success: boolean; deck: ImportedDeck; error?: string }>('/api/import/url', {
                url,
                format: urlFormat,
                resolveCards: true
            });
            if (response.success && response.deck) {
                setPreview(response.deck);
                setPreviewFormat(response.deck.format);
            } else {
                setError(response.error || 'Errore durante l\'import');
            }
        } catch (err: any) {
            setError(err.message || 'Errore durante l\'import');
        } finally {
            setLoading(false);
        }
    };

    const handleTextImport = async () => {
        if (!text.trim()) {
            setError('Inserisci una decklist');
            return;
        }

        setLoading(true);
        setError(null);
        setPreview(null);

        try {
            const response = await ApiService.post<{ success: boolean; deck: ImportedDeck; error?: string }>('/api/import/text', {
                text,
                name: deckName || 'Imported Deck',
                format: selectedFormat
            });
            if (response.success && response.deck) {
                setPreview(response.deck);
                setPreviewFormat(response.deck.format);
            } else {
                setError(response.error || 'Errore durante l\'import');
            }
        } catch (err: any) {
            setError(err.message || 'Errore durante l\'import');
        } finally {
            setLoading(false);
        }
    };

    const handleConfirmImport = () => {
        if (preview) {
            // Use the edited format if available
            const deckToImport = previewFormat && previewFormat !== preview.format
                ? { ...preview, format: previewFormat }
                : preview;
            onImport(deckToImport);
            handleClose();
        }
    };

    const handleClose = () => {
        setUrl('');
        setText('');
        setDeckName('');
        setSelectedFormat('Standard');
        setUrlFormat('Standard');
        setError(null);
        setPreview(null);
        setPreviewFormat(null);
        setDetectedSource(null);
        onClose();
    };

    const totalCards = preview ? (
        preview.cards.reduce((sum, c) => sum + c.quantity, 0) +
        (preview.commanders?.reduce((sum, c) => sum + c.quantity, 0) || 0) +
        (preview.sideboard?.reduce((sum, c) => sum + c.quantity, 0) || 0)
    ) : 0;

    return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="bg-slate-800 rounded-xl border border-slate-700 shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="flex justify-between items-center p-4 border-b border-slate-700">
                    <h2 className="text-xl font-bold text-white">
                        {mergeMode ? 'Aggiungi Carte' : 'Importa Mazzo'}
                    </h2>
                    <button onClick={handleClose} className="text-slate-400 hover:text-white transition-colors">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-slate-700">
                    <button
                        onClick={() => { setActiveTab('url'); setError(null); setPreview(null); }}
                        className={`flex-1 py-3 px-4 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
                            activeTab === 'url'
                                ? 'text-purple-400 border-b-2 border-purple-400 bg-purple-500/10'
                                : 'text-slate-400 hover:text-white'
                        }`}
                    >
                        <Link className="w-4 h-4" /> Da URL
                    </button>
                    <button
                        onClick={() => { setActiveTab('text'); setError(null); setPreview(null); }}
                        className={`flex-1 py-3 px-4 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
                            activeTab === 'text'
                                ? 'text-purple-400 border-b-2 border-purple-400 bg-purple-500/10'
                                : 'text-slate-400 hover:text-white'
                        }`}
                    >
                        <FileText className="w-4 h-4" /> Da Testo
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {error && (
                        <div className="flex items-center gap-2 p-3 bg-red-900/30 border border-red-500/50 rounded-lg text-red-300 text-sm">
                            <AlertCircle className="w-4 h-4 shrink-0" />
                            {error}
                        </div>
                    )}

                    {activeTab === 'url' && !preview && (
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-2">
                                    URL del mazzo (Archidekt o Moxfield)
                                </label>
                                <input
                                    type="url"
                                    value={url}
                                    onChange={(e) => handleUrlChange(e.target.value)}
                                    placeholder="https://archidekt.com/decks/12345 o https://moxfield.com/decks/AbCdEf"
                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white placeholder-slate-500 focus:ring-2 focus:ring-purple-500 outline-none"
                                />
                                {detectedSource && (
                                    <div className="mt-2 flex items-center gap-2 text-sm text-emerald-400">
                                        <CheckCircle className="w-4 h-4" />
                                        Rilevato: <span className="font-bold capitalize">{detectedSource}</span>
                                    </div>
                                )}
                            </div>

                            {!mergeMode && (
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-2">
                                        Formato
                                    </label>
                                    <select
                                        value={urlFormat}
                                        onChange={(e) => setUrlFormat(e.target.value)}
                                        className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-purple-500 outline-none"
                                    >
                                        {FORMATS.map(f => (
                                            <option key={f} value={f}>{f}</option>
                                        ))}
                                    </select>
                                    <p className="mt-1 text-xs text-slate-500">
                                        Specifica il formato manualmente (quello rilevato automaticamente potrebbe non essere corretto)
                                    </p>
                                </div>
                            )}

                            <div className="text-xs text-slate-500 space-y-1">
                                <p className="font-medium text-slate-400">Piattaforme supportate:</p>
                                <ul className="list-disc list-inside space-y-0.5">
                                    <li>Archidekt - archidekt.com/decks/...</li>
                                    <li>Moxfield - moxfield.com/decks/...</li>
                                </ul>
                                <p className="mt-2 text-amber-400/70">
                                    Il mazzo deve essere pubblico per poterlo importare.
                                </p>
                            </div>

                            <button
                                onClick={handleUrlImport}
                                disabled={loading || !url}
                                className="w-full py-3 bg-purple-600 hover:bg-purple-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-bold rounded-lg transition-colors flex items-center justify-center gap-2"
                            >
                                {loading ? (
                                    <><Loader2 className="w-5 h-5 animate-spin" /> Importazione...</>
                                ) : (
                                    <><ExternalLink className="w-5 h-5" /> Importa da URL</>
                                )}
                            </button>
                        </div>
                    )}

                    {activeTab === 'text' && !preview && (
                        <div className="space-y-4">
                            {!mergeMode && (
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-300 mb-2">
                                            Nome del mazzo
                                        </label>
                                        <input
                                            type="text"
                                            value={deckName}
                                            onChange={(e) => setDeckName(e.target.value)}
                                            placeholder="Il mio mazzo"
                                            className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white placeholder-slate-500 focus:ring-2 focus:ring-purple-500 outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-300 mb-2">
                                            Formato
                                        </label>
                                        <select
                                            value={selectedFormat}
                                            onChange={(e) => setSelectedFormat(e.target.value)}
                                            className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-purple-500 outline-none"
                                        >
                                            {FORMATS.map(f => (
                                                <option key={f} value={f}>{f}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            )}

                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <label className="block text-sm font-medium text-slate-300">
                                        Decklist (formato MTGO/Arena o CSV)
                                    </label>
                                    <div>
                                        <input
                                            type="file"
                                            ref={fileInputRef}
                                            className="hidden"
                                            accept=".csv,.txt"
                                            onChange={handleFileUpload}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => fileInputRef.current?.click()}
                                            className="flex items-center gap-1.5 bg-slate-700 hover:bg-slate-600 text-white px-3 py-1.5 rounded text-xs font-medium transition-colors"
                                        >
                                            <Upload className="w-3.5 h-3.5" /> Carica File
                                        </button>
                                    </div>
                                </div>
                                <textarea
                                    value={text}
                                    onChange={(e) => setText(e.target.value)}
                                    placeholder={`4 Lightning Bolt\n4 Counterspell\n2 Jace, the Mind Sculptor\n\nSideboard\n2 Negate\n1 Surgical Extraction`}
                                    rows={10}
                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white placeholder-slate-500 focus:ring-2 focus:ring-purple-500 outline-none font-mono text-sm resize-none"
                                />
                            </div>

                            <div className="text-xs text-slate-500 space-y-1">
                                <p className="font-medium text-slate-400">Formati supportati:</p>
                                <ul className="list-disc list-inside space-y-0.5">
                                    <li>MTGO/Arena: "4 Lightning Bolt" o "4x Lightning Bolt"</li>
                                    <li>CSV Archidekt (colonne: Quantity, Name)</li>
                                    <li>Sezioni: "Commander:", "Sideboard:", "Companion:"</li>
                                    <li>Una carta per riga, quantità opzionale (default 1)</li>
                                </ul>
                            </div>

                            <button
                                onClick={handleTextImport}
                                disabled={loading || !text.trim()}
                                className="w-full py-3 bg-purple-600 hover:bg-purple-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-bold rounded-lg transition-colors flex items-center justify-center gap-2"
                            >
                                {loading ? (
                                    <><Loader2 className="w-5 h-5 animate-spin" /> Importazione...</>
                                ) : (
                                    <><FileText className="w-5 h-5" /> Importa da Testo</>
                                )}
                            </button>
                        </div>
                    )}

                    {/* Preview */}
                    {preview && (
                        <div className="space-y-4">
                            <div className="flex items-center gap-2 p-3 bg-emerald-900/30 border border-emerald-500/50 rounded-lg text-emerald-300">
                                <CheckCircle className="w-5 h-5" />
                                <span>{mergeMode ? `${totalCards} carte pronte per essere aggiunte` : 'Mazzo importato con successo!'}</span>
                            </div>

                            <div className="bg-slate-900 rounded-lg p-4 border border-slate-700">
                                {!mergeMode && <h3 className="text-lg font-bold text-white mb-2">{preview.name}</h3>}
                                <div className="flex items-center gap-4 text-sm text-slate-400 mb-4">
                                    {!mergeMode && (
                                        <select
                                            value={previewFormat || preview.format}
                                            onChange={(e) => setPreviewFormat(e.target.value)}
                                            className="px-2 py-1 bg-purple-500/20 text-purple-300 rounded border border-purple-500/30 focus:ring-2 focus:ring-purple-500 outline-none text-sm"
                                        >
                                            {FORMATS.map(f => (
                                                <option key={f} value={f} className="bg-slate-800 text-white">{f}</option>
                                            ))}
                                        </select>
                                    )}
                                    <span>{totalCards} carte totali</span>
                                    {preview.source && (
                                        <span className="capitalize">da {preview.source}</span>
                                    )}
                                </div>

                                {preview.commanders && preview.commanders.length > 0 && (
                                    <div className="mb-3">
                                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Commander</h4>
                                        <ul className="text-sm text-slate-300">
                                            {preview.commanders.map((c, i) => (
                                                <li key={i}>{c.quantity}x {c.name}</li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                <div className="mb-3">
                                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
                                        Mainboard ({preview.cards.reduce((s, c) => s + c.quantity, 0)})
                                    </h4>
                                    <div className="max-h-32 overflow-y-auto custom-scrollbar">
                                        <ul className="text-sm text-slate-300 space-y-0.5">
                                            {preview.cards.slice(0, 10).map((c, i) => (
                                                <li key={i}>{c.quantity}x {c.name}</li>
                                            ))}
                                            {preview.cards.length > 10 && (
                                                <li className="text-slate-500">... e altre {preview.cards.length - 10} carte</li>
                                            )}
                                        </ul>
                                    </div>
                                </div>

                                {preview.sideboard && preview.sideboard.length > 0 && (
                                    <div>
                                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
                                            Sideboard ({preview.sideboard.reduce((s, c) => s + c.quantity, 0)})
                                        </h4>
                                        <ul className="text-sm text-slate-300">
                                            {preview.sideboard.slice(0, 5).map((c, i) => (
                                                <li key={i}>{c.quantity}x {c.name}</li>
                                            ))}
                                            {preview.sideboard.length > 5 && (
                                                <li className="text-slate-500">... e altre {preview.sideboard.length - 5} carte</li>
                                            )}
                                        </ul>
                                    </div>
                                )}
                            </div>

                            <div className="flex gap-3">
                                <button
                                    onClick={() => setPreview(null)}
                                    className="flex-1 py-3 bg-slate-700 hover:bg-slate-600 text-white font-bold rounded-lg transition-colors"
                                >
                                    Modifica
                                </button>
                                <button
                                    onClick={handleConfirmImport}
                                    className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg transition-colors"
                                >
                                    {mergeMode ? 'Aggiungi Carte' : 'Salva Mazzo'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
