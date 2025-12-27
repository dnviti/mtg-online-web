
import React, { useState, useEffect, useMemo } from 'react';
import { Modal } from '../../components/Modal';
import { ManaIcon } from '../../components/ManaIcon';
import { RotateCcw, X, Plus, Search } from 'lucide-react';

interface AdvancedSearchModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSearch: (query: string) => void;
}



export const AdvancedSearchModal: React.FC<AdvancedSearchModalProps> = ({
    isOpen,
    onClose,
    onSearch
}) => {
    // --- State ---
    const [name, setName] = useState('');
    const [text, setText] = useState('');
    const [type, setType] = useState('');

    // Colors
    const [colors, setColors] = useState<Record<string, boolean>>({
        W: false, U: false, B: false, R: false, G: false, C: false
    });
    const [colorMode, setColorMode] = useState<'exactly' | 'include' | 'at_most'>('exactly');

    // Commander
    const [commanderColors, setCommanderColors] = useState<Record<string, boolean>>({
        W: false, U: false, B: false, R: false, G: false, C: false
    });

    // Mana & Stats
    const [manaCost, setManaCost] = useState('');
    const [statFilters, setStatFilters] = useState<{ stat: string; op: string; val: string }[]>([]);

    // Metadata
    const [set, setSet] = useState('');
    const [allSets, setAllSets] = useState<{ code: string; name: string }[]>([]);
    const [setSearch, setSetSearch] = useState('');
    const [isSetDropdownOpen, setIsSetDropdownOpen] = useState(false);

    const [format, setFormat] = useState('');
    const [rarity, setRarity] = useState<Record<string, boolean>>({
        common: false, uncommon: false, rare: false, mythic: false
    });
    const [artist, setArtist] = useState('');
    const [flavor, setFlavor] = useState('');

    // --- Effects ---
    useEffect(() => {
        if (isOpen && allSets.length === 0) {
            fetch('/api/sets')
                .then(res => res.json())
                .then(data => {
                    if (Array.isArray(data)) {
                        setAllSets(data.sort((a, b) => a.name.localeCompare(b.name)));
                    }
                })
                .catch(err => console.error('Failed to fetch sets', err));
        }
    }, [isOpen]);

    const filteredSets = useMemo(() => {
        if (!setSearch) return allSets;
        const q = setSearch.toLowerCase();
        return allSets.filter(s => s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q));
    }, [allSets, setSearch]);

    // --- Reset ---
    const handleReset = () => {
        setName('');
        setText('');
        setType('');
        setColors({ W: false, U: false, B: false, R: false, G: false, C: false });
        setColorMode('exactly');
        setCommanderColors({ W: false, U: false, B: false, R: false, G: false, C: false });
        setManaCost('');
        setStatFilters([]);
        setStatFilters([]);
        setSet('');
        setSetSearch('');
        setFormat('');
        setRarity({ common: false, uncommon: false, rare: false, mythic: false });
        setArtist('');
        setFlavor('');
    };

    // --- Build Query ---
    const buildQuery = () => {
        const parts: string[] = [];

        // Name
        if (name.trim()) parts.push(`name:"${name.trim()}"`);

        // Text
        if (text.trim()) parts.push(`o:"${text.trim()}"`);

        // Type
        if (type.trim()) parts.push(`t:"${type.trim()}"`);

        // Colors
        const activeColors = Object.entries(colors).filter(([_, v]) => v).map(([k]) => k).join('');
        if (activeColors) {
            if (colorMode === 'exactly') parts.push(`c=${activeColors}`);
            else if (colorMode === 'include') parts.push(`c>=${activeColors}`);
            else if (colorMode === 'at_most') parts.push(`c<=${activeColors}`);
        } else if (colors.C) {
            // Specifically colorless selected alone
            parts.push('c=c');
        }

        // Commander
        const activeCommander = Object.entries(commanderColors).filter(([_, v]) => v).map(([k]) => k).join('');
        if (activeCommander) {
            parts.push(`id:${activeCommander}`);
        }

        // Mana Cost
        if (manaCost.trim()) parts.push(`m:${manaCost.trim()}`);

        // Stats
        statFilters.forEach(f => {
            if (f.val) {
                parts.push(`${f.stat}${f.op}${f.val}`);
            }
        });

        // Set
        if (set) parts.push(`s:${set}`);

        // Format
        if (format) parts.push(`f:${format}`);

        // Rarity
        const activeRarities = Object.entries(rarity).filter(([_, v]) => v).map(([k]) => k);
        if (activeRarities.length > 0) {
            parts.push(`(${activeRarities.map(r => `r:${r}`).join(' or ')})`);
        }

        // Artist
        if (artist.trim()) parts.push(`a:"${artist.trim()}"`);

        // Flavor
        if (flavor.trim()) parts.push(`ft:"${flavor.trim()}"`);

        return parts.join(' ');
    };

    const handleSearchClick = () => {
        const q = buildQuery();
        if (q) onSearch(q);
        onClose();
    };

    // --- Helpers ---
    const toggleColor = (c: string) => setColors(prev => ({ ...prev, [c]: !prev[c] }));
    const toggleCommander = (c: string) => setCommanderColors(prev => ({ ...prev, [c]: !prev[c] }));
    const toggleRarity = (r: string) => setRarity(prev => ({ ...prev, [r]: !prev[r] }));

    const addStatFilter = () => setStatFilters([...statFilters, { stat: 'cmc', op: '=', val: '' }]);
    const updateStatFilter = (idx: number, field: keyof typeof statFilters[0], val: string) => {
        const newFilters = [...statFilters];
        newFilters[idx] = { ...newFilters[idx], [field]: val };
        setStatFilters(newFilters);
    };
    const removeStatFilter = (idx: number) => {
        setStatFilters(statFilters.filter((_, i) => i !== idx));
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Advanced Search"
            maxWidth="max-w-4xl"
            confirmLabel="Search"
            onConfirm={handleSearchClick}
            cancelLabel="Cancel"
        >
            <div className="flex flex-col gap-6 text-sm text-slate-300 pb-2">

                {/* Name & Text */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1">
                        <label className="font-bold text-slate-400">Card Name</label>
                        <input
                            type="text"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder='e.g. "Fire"'
                            className="bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                        />
                    </div>
                    <div className="flex flex-col gap-1">
                        <label className="font-bold text-slate-400">Text</label>
                        <input
                            type="text"
                            value={text}
                            onChange={e => setText(e.target.value)}
                            placeholder='e.g. "draw a card"'
                            className="bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                        />
                    </div>
                </div>

                {/* Type Line */}
                <div className="flex flex-col gap-1">
                    <label className="font-bold text-slate-400">Type Line</label>
                    <input
                        type="text"
                        value={type}
                        onChange={e => setType(e.target.value)}
                        placeholder='e.g. "Creature Goblin"'
                        className="bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                </div>

                {/* Colors */}
                <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700">
                    <div className="flex flex-wrap items-center gap-6">
                        <span className="font-bold text-slate-400 w-24 shrink-0">Colors</span>
                        {['W', 'U', 'B', 'R', 'G', 'C'].map(c => (
                            <button
                                key={c}
                                onClick={() => toggleColor(c)}
                                className={`
                                        rounded-full transition-all duration-200 p-0.5
                                        ${colors[c]
                                        ? 'ring-2 ring-emerald-500 scale-110 opacity-100 shadow-[0_0_10px_rgba(16,185,129,0.5)]'
                                        : 'opacity-50 hover:opacity-100 hover:scale-105 grayscale hover:grayscale-0'}
                                    `}
                                type="button"
                            >
                                <ManaIcon symbol={c} size="2x" shadow />
                            </button>
                        ))}
                        <div className="h-4 w-px bg-slate-600 mx-2" />
                        <select
                            value={colorMode}
                            onChange={(e) => setColorMode(e.target.value as any)}
                            className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white outline-none"
                        >
                            <option value="exactly">Exactly these colors</option>
                            <option value="include">Including these colors</option>
                            <option value="at_most">At most these colors</option>
                        </select>
                    </div>
                </div>

                {/* Commander Identity */}
                <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700">
                    <div className="flex flex-wrap items-center gap-6">
                        <span className="font-bold text-slate-400 w-24 shrink-0">Commander</span>
                        {['W', 'U', 'B', 'R', 'G', 'C'].map(c => (
                            <button
                                key={c}
                                onClick={() => toggleCommander(c)}
                                className={`
                                        rounded-full transition-all duration-200 p-0.5
                                        ${commanderColors[c]
                                        ? 'ring-2 ring-emerald-500 scale-110 opacity-100 shadow-[0_0_10px_rgba(16,185,129,0.5)]'
                                        : 'opacity-50 hover:opacity-100 hover:scale-105 grayscale hover:grayscale-0'}
                                    `}
                                type="button"
                            >
                                <ManaIcon symbol={c} size="2x" shadow />
                            </button>
                        ))}
                    </div>
                    <p className="text-[10px] text-slate-500 mt-1 ml-[7.5rem]">Filter by Commander Identity (select allowed colors)</p>
                </div>

                {/* Stats & Mana */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1">
                        <label className="font-bold text-slate-400">Mana Cost</label>
                        <input
                            type="text"
                            value={manaCost}
                            onChange={e => setManaCost(e.target.value)}
                            placeholder='e.g. {2}{U}{U}'
                            className="bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white focus:ring-2 focus:ring-emerald-500 outline-none font-mono"
                        />
                    </div>
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                            <label className="font-bold text-slate-400">Stats (CMC, Pow, Tgh)</label>
                            <button onClick={addStatFilter} type="button" className="text-xs flex items-center gap-1 text-emerald-400 hover:text-emerald-300">
                                <Plus className="w-3 h-3" /> Add
                            </button>
                        </div>
                        {statFilters.map((f, idx) => (
                            <div key={idx} className="flex items-center gap-2 animate-in fade-in slide-in-from-left-2">
                                <select
                                    value={f.stat}
                                    onChange={e => updateStatFilter(idx, 'stat', e.target.value)}
                                    className="bg-slate-700 border border-slate-600 rounded px-2 py-1 text-white outline-none w-24"
                                >
                                    <option value="cmc">CMC</option>
                                    <option value="power">Power</option>
                                    <option value="toughness">Toughness</option>
                                    <option value="loyalty">Loyalty</option>
                                </select>
                                <select
                                    value={f.op}
                                    onChange={e => updateStatFilter(idx, 'op', e.target.value)}
                                    className="bg-slate-700 border border-slate-600 rounded px-2 py-1 text-white outline-none w-16"
                                >
                                    <option value="=">=</option>
                                    <option value=">">&gt;</option>
                                    <option value=">=">&gt;=</option>
                                    <option value="<">&lt;</option>
                                    <option value="<=">&lt;=</option>
                                    <option value="!=">!=</option>
                                </select>
                                <input
                                    type="text"
                                    value={f.val}
                                    onChange={e => updateStatFilter(idx, 'val', e.target.value)}
                                    className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white outline-none w-20"
                                    placeholder="Val"
                                />
                                <button onClick={() => removeStatFilter(idx)} className="text-red-400 hover:text-red-300 p-1">
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Sets & Formats */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1">
                        <label className="font-bold text-slate-400">Set</label>
                        <div className="relative">
                            <div
                                className="bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white flex items-center justify-between cursor-pointer"
                                onClick={() => setIsSetDropdownOpen(!isSetDropdownOpen)}
                            >
                                <span className={set ? 'text-white' : 'text-slate-400'}>
                                    {set ? allSets.find(s => s.code === set)?.name || set.toUpperCase() : 'Any Set'}
                                </span>
                                <Search className="w-4 h-4 text-slate-500" />
                            </div>

                            {isSetDropdownOpen && (
                                <>
                                    <div className="fixed inset-0 z-10" onClick={() => setIsSetDropdownOpen(false)} />
                                    <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-xl max-h-60 overflow-y-auto">
                                        <div className="p-2 sticky top-0 bg-slate-800 border-b border-slate-700">
                                            <input
                                                type="text"
                                                value={setSearch}
                                                onChange={e => setSetSearch(e.target.value)}
                                                placeholder="Search sets..."
                                                className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm text-white focus:ring-1 focus:ring-emerald-500 outline-none"
                                                autoFocus
                                            />
                                        </div>
                                        <div
                                            className="px-3 py-2 hover:bg-slate-700 cursor-pointer text-slate-400 italic"
                                            onClick={() => { setSet(''); setIsSetDropdownOpen(false); }}
                                        >
                                            Any Set
                                        </div>
                                        {filteredSets.map(s => (
                                            <div
                                                key={s.code}
                                                className={`px-3 py-2 hover:bg-slate-700 cursor-pointer flex justify-between items-center ${set === s.code ? 'bg-slate-700/50 text-emerald-400' : 'text-slate-200'}`}
                                                onClick={() => { setSet(s.code); setIsSetDropdownOpen(false); }}
                                            >
                                                <span>{s.name}</span>
                                                <span className="text-xs text-slate-500 uppercase font-mono">{s.code}</span>
                                            </div>
                                        ))}
                                        {filteredSets.length === 0 && (
                                            <div className="px-3 py-4 text-center text-slate-500 text-sm">No sets found</div>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                        {/* Fallback text input if needed or if list is small */}
                        <div className="text-[10px] text-slate-500 text-right">Or type code: <input type="text" value={set} onChange={e => setSet(e.target.value)} className="bg-transparent border-b border-slate-600 w-12 text-center text-slate-300 focus:outline-none" /></div>
                    </div>

                    <div className="flex flex-col gap-1">
                        <label className="font-bold text-slate-400">Format</label>
                        <select
                            value={format}
                            onChange={e => setFormat(e.target.value)}
                            className="bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                        >
                            <option value="">Any Format</option>
                            <option value="standard">Standard</option>
                            <option value="pioneer">Pioneer</option>
                            <option value="modern">Modern</option>
                            <option value="legacy">Legacy</option>
                            <option value="vintage">Vintage</option>
                            <option value="commander">Commander</option>
                            <option value="pauper">Pauper</option>
                            <option value="historic">Historic</option>
                            <option value="timeless">Timeless</option>
                        </select>
                    </div>
                </div>

                {/* Rarity */}
                <div className="flex flex-col gap-2">
                    <label className="font-bold text-slate-400">Rarity</label>
                    <div className="flex items-center gap-4">
                        {['common', 'uncommon', 'rare', 'mythic'].map(r => (
                            <label key={r} className="flex items-center gap-1.5 cursor-pointer hover:text-white capitalize">
                                <input
                                    type="checkbox"
                                    checked={rarity[r]}
                                    onChange={() => toggleRarity(r)}
                                    className="rounded bg-slate-700 border-slate-600 text-emerald-500 focus:ring-emerald-500"
                                />
                                {r}
                            </label>
                        ))}
                    </div>
                </div>

                {/* Other */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1">
                        <label className="font-bold text-slate-400">Artist</label>
                        <input type="text" value={artist} onChange={e => setArtist(e.target.value)} className="bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white outline-none" />
                    </div>
                    <div className="flex flex-col gap-1">
                        <label className="font-bold text-slate-400">Flavor Text</label>
                        <input type="text" value={flavor} onChange={e => setFlavor(e.target.value)} className="bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white outline-none" />
                    </div>
                </div>

            </div>

            <div className="mt-4 pt-4 border-t border-slate-700 flex justify-between items-center">
                <button onClick={handleReset} className="text-slate-500 hover:text-white flex items-center gap-1 text-sm">
                    <RotateCcw className="w-3 h-3" /> Reset all filters
                </button>
                {/* Main buttons handled by Modal props */}
            </div>
        </Modal>
    );
};


// Simple Icon helper to avoid dependency if generic
