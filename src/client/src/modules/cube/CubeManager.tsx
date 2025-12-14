import React, { useState, useRef, useEffect } from 'react';
import { Layers, RotateCcw, Box, Check, Loader2, Upload, LayoutGrid, List, Sliders, Settings } from 'lucide-react';
import { CardParserService } from '../../services/CardParserService';
import { ScryfallService, ScryfallCard, ScryfallSet } from '../../services/ScryfallService';
import { PackGeneratorService, ProcessedPools, SetsMap, Pack, PackGenerationSettings } from '../../services/PackGeneratorService';
import { PackCard } from '../../components/PackCard';

export const CubeManager: React.FC = () => {
  // --- Services ---
  // --- Services ---
  // Memoize services to persist cache across renders
  const parserService = React.useMemo(() => new CardParserService(), []);
  const scryfallService = React.useMemo(() => new ScryfallService(), []);
  const generatorService = React.useMemo(() => new PackGeneratorService(), []);

  // --- State ---
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState('');

  const [rawScryfallData, setRawScryfallData] = useState<ScryfallCard[] | null>(null);
  const [processedData, setProcessedData] = useState<{ pools: ProcessedPools, sets: SetsMap } | null>(null);

  const [filters, setFilters] = useState({
    ignoreBasicLands: true,
    ignoreCommander: true,
    ignoreTokens: true
  });

  const [packs, setPacks] = useState<Pack[]>([]);

  // UI State
  const [viewMode, setViewMode] = useState<'list' | 'grid' | 'stack'>('list');

  // Generation Settings
  const [genSettings, setGenSettings] = useState<PackGenerationSettings>({
    mode: 'mixed',
    rarityMode: 'peasant'
  });

  const [sourceMode, setSourceMode] = useState<'upload' | 'set'>('upload');
  const [availableSets, setAvailableSets] = useState<ScryfallSet[]>([]);
  const [selectedSet, setSelectedSet] = useState<string>('');
  const [numBoxes, setNumBoxes] = useState<number>(3);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Effects ---
  useEffect(() => {
    if (rawScryfallData) {
      const result = generatorService.processCards(rawScryfallData, filters);
      setProcessedData(result);
    }
  }, [filters, rawScryfallData]);

  useEffect(() => {
    scryfallService.fetchSets().then(sets => {
      setAvailableSets(sets.sort((a, b) => new Date(b.released_at).getTime() - new Date(a.released_at).getTime()));
    });
  }, [scryfallService]);

  // --- Handlers ---
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => setInputText(e.target?.result as string || '');
    reader.readAsText(file);
    event.target.value = '';
  };

  const loadDemoData = () => {
    const demo = `20 Shock
20 Llanowar Elves
20 Giant Growth
20 Counterspell
20 Dark Ritual
20 Lightning Bolt
20 Opt
20 Consider
20 Ponder
20 Preordain
20 Brainstorm
20 Duress
20 Faithless Looting
20 Thrill of Possibility
20 Terror
10 Serra Angel
10 Vampire Nighthawk
10 Eternal Witness
10 Mulldrifter
10 Flametongue Kavu
5 Wrath of God
5 Birds of Paradise
2 Jace, the Mind Sculptor
1 Sheoldred, the Apocalypse
20 Island
1 Sol Ring
1 Command Tower`;
    setInputText(demo);
  };

  const fetchAndParse = async () => {
    setLoading(true);
    setPacks([]);
    setProgress(sourceMode === 'set' ? 'Fetching set data...' : 'Parsing text...');

    try {
      let expandedCards: ScryfallCard[] = [];

      if (sourceMode === 'set') {
        if (!selectedSet) throw new Error("Please select a set.");
        const cards = await scryfallService.fetchSetCards(selectedSet, (count) => {
          setProgress(`Fetching set cards... (${count})`);
        });
        expandedCards = cards;
      } else {
        const identifiers = parserService.parse(inputText);
        const fetchList = identifiers.map(id => id.type === 'id' ? { id: id.value } : { name: id.value });

        await scryfallService.fetchCollection(fetchList, (current, total) => {
          setProgress(`Fetching Scryfall data... (${current}/${total})`);
        });

        identifiers.forEach(id => {
          const card = scryfallService.getCachedCard(id.type === 'id' ? { id: id.value } : { name: id.value });
          if (card) {
            for (let i = 0; i < id.quantity; i++) expandedCards.push(card);
          }
        });
      }

      setRawScryfallData(expandedCards);
      setLoading(false);
      setProgress('');

    } catch (err: any) {
      console.error(err);
      alert(err.message || "Error during process.");
      setLoading(false);
    }
  };

  const generatePacks = () => {
    if (!processedData) return;

    setLoading(true);

    // Use setTimeout to allow UI to show loading spinner before sync calculation blocks
    setTimeout(() => {
      try {
        let newPacks: Pack[] = [];
        if (sourceMode === 'set') {
          const totalPacks = numBoxes * 36;
          newPacks = generatorService.generateBoosterBox(processedData.pools, totalPacks, genSettings);
        } else {
          newPacks = generatorService.generatePacks(processedData.pools, processedData.sets, genSettings);
        }

        if (newPacks.length === 0) {
          alert(`Not enough cards to generate valid packs.`);
        } else {
          setPacks(newPacks);
        }
      } catch (e) {
        console.error("Generation failed", e);
        alert("Error generating packs: " + e);
      } finally {
        setLoading(false);
      }
    }, 50);
  };

  const toggleFilter = (key: keyof typeof filters) => {
    setFilters(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 p-4 md:p-6">

      {/* --- LEFT COLUMN: CONTROLS --- */}
      <div className="lg:col-span-4 flex flex-col gap-4">
        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700 shadow-xl">
          {/* Source Toggle */}
          <div className="flex p-1 bg-slate-900 rounded-lg mb-4 border border-slate-700">
            <button
              onClick={() => {
                setSourceMode('upload');
                setGenSettings(prev => ({ ...prev, mode: 'mixed' }));
              }}
              className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${sourceMode === 'upload' ? 'bg-slate-700 text-white shadow' : 'text-slate-500 hover:text-slate-300'}`}
            >
              Custom List
            </button>
            <button
              onClick={() => {
                setSourceMode('set');
                setGenSettings(prev => ({ ...prev, mode: 'by_set' }));
              }}
              className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${sourceMode === 'set' ? 'bg-slate-700 text-white shadow' : 'text-slate-500 hover:text-slate-300'}`}
            >
              From Expansion
            </button>
          </div>

          {sourceMode === 'upload' ? (
            <>
              <div className="flex justify-between items-center mb-2">
                <label className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                  <Box className="w-4 h-4" /> Input Bulk
                </label>
                <div className="flex gap-2">
                  <button onClick={() => fileInputRef.current?.click()} className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 hover:underline">
                    <Upload className="w-3 h-3" /> Upload
                  </button>
                  <input type="file" ref={fileInputRef} className="hidden" accept=".csv,.txt" onChange={handleFileUpload} />
                  <button onClick={loadDemoData} className="text-xs text-purple-400 hover:text-purple-300 hover:underline">Demo</button>
                </div>
              </div>

              {/* Filters */}
              <div className="mb-4 bg-slate-900 p-3 rounded-lg border border-slate-700">
                <h4 className="text-xs font-bold text-slate-400 uppercase mb-2 flex items-center gap-2">
                  <Sliders className="w-3 h-3" /> Import Options
                </h4>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm cursor-pointer hover:text-white text-slate-300">
                    <input type="checkbox" checked={filters.ignoreBasicLands} onChange={() => toggleFilter('ignoreBasicLands')} className="rounded border-slate-600 bg-slate-800 text-purple-500 focus:ring-purple-500" />
                    <span>Ignore Basic Lands</span>
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer hover:text-white text-slate-300">
                    <input type="checkbox" checked={filters.ignoreCommander} onChange={() => toggleFilter('ignoreCommander')} className="rounded border-slate-600 bg-slate-800 text-purple-500 focus:ring-purple-500" />
                    <span>Ignore Commander Sets</span>
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer hover:text-white text-slate-300">
                    <input type="checkbox" checked={filters.ignoreTokens} onChange={() => toggleFilter('ignoreTokens')} className="rounded border-slate-600 bg-slate-800 text-purple-500 focus:ring-purple-500" />
                    <span>Ignore Tokens</span>
                  </label>
                </div>
              </div>

              <textarea
                className="w-full h-40 bg-slate-900 border border-slate-700 rounded-lg p-3 text-xs font-mono text-slate-300 focus:ring-2 focus:ring-purple-500 outline-none resize-none mb-4 whitespace-pre"
                placeholder="Paste list or upload file..."
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                disabled={loading}
              />

              <button
                onClick={fetchAndParse}
                disabled={loading || !inputText}
                className={`w-full py-2 mb-4 rounded-lg font-bold flex justify-center items-center gap-2 transition-all ${loading ? 'bg-slate-700 cursor-not-allowed' : 'bg-purple-600 hover:bg-purple-500 text-white'}`}
              >
                {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> {progress}</> : <><Check className="w-4 h-4" /> 1. Parse Bulk</>}
              </button>
            </>
          ) : (
            <>
              <div className="mb-4">
                <label className="block text-sm font-semibold text-slate-300 mb-2">Select Expansion</label>
                <select
                  value={selectedSet}
                  onChange={(e) => setSelectedSet(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-sm text-slate-300 focus:ring-2 focus:ring-purple-500 outline-none"
                  disabled={loading}
                >
                  <option value="">-- Choose Set --</option>
                  {availableSets.map(s => (
                    <option key={s.code} value={s.code}>
                      {s.name} ({s.code.toUpperCase()}) - {s.set_type}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-semibold text-slate-300 mb-2">Quantity</label>
                <div className="flex items-center gap-2 bg-slate-900 p-2 rounded-lg border border-slate-700">
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={numBoxes}
                    onChange={(e) => setNumBoxes(parseInt(e.target.value))}
                    className="w-16 bg-slate-800 border-none rounded p-1 text-center text-white font-mono"
                    disabled={loading}
                  />
                  <span className="text-slate-400 text-sm">Booster Boxes ({numBoxes * 36} Packs)</span>
                </div>
              </div>

              <button
                onClick={fetchAndParse}
                disabled={loading || !selectedSet}
                className={`w-full py-2 mb-4 rounded-lg font-bold flex justify-center items-center gap-2 transition-all ${loading ? 'bg-slate-700 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-500 text-white'}`}
              >
                {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> {progress}</> : <><Check className="w-4 h-4" /> 1. Fetch Set</>}
              </button>
            </>
          )}

          {/* Generation Settings */}
          {processedData && Object.keys(processedData.sets).length > 0 && (
            <div className="bg-slate-900/50 p-3 rounded-lg border border-slate-700 mb-4 animate-in fade-in slide-in-from-top-4 duration-500">
              <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
                <Settings className="w-4 h-4 text-emerald-400" /> Configuration
              </h3>

              {/* Mode - Only show for Custom List */}
              {sourceMode === 'upload' && (
                <div className="mb-4">
                  <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Card Source</label>
                  <div className="flex flex-col gap-2">
                    <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                      <input type="radio" name="genMode" value="mixed" checked={genSettings.mode === 'mixed'} onChange={() => setGenSettings({ ...genSettings, mode: 'mixed' })} className="accent-purple-500" />
                      <span>Chaos Draft (Mix All)</span>
                    </label>
                    <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                      <input type="radio" name="genMode" value="by_set" checked={genSettings.mode === 'by_set'} onChange={() => setGenSettings({ ...genSettings, mode: 'by_set' })} className="accent-purple-500" />
                      <span>Split by Expansion</span>
                    </label>
                  </div>
                </div>
              )}

              {/* Rarity */}
              <div className="mb-4">
                <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Format</label>
                <div className="flex flex-col gap-2">
                  <label className={`flex items-center gap-2 text-sm cursor-pointer p-2 rounded border ${genSettings.rarityMode === 'peasant' ? 'bg-slate-700 border-purple-500' : 'border-transparent hover:bg-slate-800'}`}>
                    <input type="radio" name="rarMode" value="peasant" checked={genSettings.rarityMode === 'peasant'} onChange={() => setGenSettings({ ...genSettings, rarityMode: 'peasant' })} className="accent-purple-500" />
                    <div>
                      <span className="block font-bold text-white">Peasant (13 Cards)</span>
                      <span className="text-xs text-slate-400">10 Commons, 3 Uncommons</span>
                    </div>
                  </label>
                  <label className={`flex items-center gap-2 text-sm cursor-pointer p-2 rounded border ${genSettings.rarityMode === 'standard' ? 'bg-slate-700 border-amber-500' : 'border-transparent hover:bg-slate-800'}`}>
                    <input type="radio" name="rarMode" value="standard" checked={genSettings.rarityMode === 'standard'} onChange={() => setGenSettings({ ...genSettings, rarityMode: 'standard' })} className="accent-amber-500" />
                    <div>
                      <span className="block font-bold text-white">Standard (14 Cards)</span>
                      <span className="text-xs text-slate-400">10C, 3U, 1 Rare/Mythic</span>
                    </div>
                  </label>
                </div>
              </div>

              {/* Sets Info */}
              <div className="max-h-40 overflow-y-auto text-xs space-y-1 pr-2 custom-scrollbar border-t border-slate-800 pt-2">
                {Object.values(processedData.sets).sort((a, b) => b.commons.length - a.commons.length).map(set => (
                  <div key={set.code} className="flex justify-between items-center text-slate-400 border-b border-slate-800 pb-1">
                    <span className="truncate w-32" title={set.name}>{set.name}</span>
                    <span className="font-mono text-[10px]">{set.commons.length}C / {set.uncommons.length}U / {set.rares.length}R</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={generatePacks}
            disabled={!processedData || Object.keys(processedData.sets).length === 0 || loading}
            className={`w-full py-3 px-4 rounded-lg font-bold flex justify-center items-center gap-2 transition-all ${!processedData || Object.keys(processedData.sets).length === 0 || loading ? 'bg-slate-700 cursor-not-allowed text-slate-500' : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/20'}`}
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <RotateCcw className="w-5 h-5" />}
            {loading ? 'Generating...' : '2. Generate Packs'}
          </button>
        </div>
      </div>

      {/* --- RIGHT COLUMN: PACKS --- */}
      <div className="lg:col-span-8">
        <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4 sticky top-4 z-40 bg-slate-900/90 backdrop-blur-sm p-3 rounded-xl border border-white/5 shadow-2xl">
          <div className="flex items-center gap-4">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <span className="bg-slate-700 text-purple-400 px-3 py-1 rounded-lg text-sm border border-slate-600">{packs.length}</span>
              Packs
            </h2>
          </div>

          <div className="flex bg-slate-800 rounded-lg p-1 border border-slate-700">
            <button onClick={() => setViewMode('list')} className={`p-2 rounded ${viewMode === 'list' ? 'bg-slate-600 text-white' : 'text-slate-400'}`}><List className="w-4 h-4" /></button>
            <button onClick={() => setViewMode('grid')} className={`p-2 rounded ${viewMode === 'grid' ? 'bg-slate-600 text-white' : 'text-slate-400'}`}><LayoutGrid className="w-4 h-4" /></button>
            <button onClick={() => setViewMode('stack')} className={`p-2 rounded ${viewMode === 'stack' ? 'bg-slate-600 text-white' : 'text-slate-400'}`}><Layers className="w-4 h-4" /></button>
          </div>
        </div>

        {packs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 border-2 border-dashed border-slate-700 rounded-2xl bg-slate-800/30 text-slate-500">
            <Box className="w-12 h-12 mb-4 opacity-50" />
            <p>No packs generated.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 pb-20">
            {packs.map((pack) => (
              <PackCard key={pack.id} pack={pack} viewMode={viewMode} />
            ))}
          </div>
        )}
      </div>

    </div >
  );
};
