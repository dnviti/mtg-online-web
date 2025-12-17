import React, { useState, useRef, useEffect } from 'react';
import { Layers, RotateCcw, Box, Check, Loader2, Upload, LayoutGrid, List, Sliders, Settings, Users, Download, Copy, FileDown, Trash2, Search, X } from 'lucide-react';
import { ScryfallCard, ScryfallSet } from '../../services/ScryfallService';
import { PackGeneratorService, ProcessedPools, SetsMap, Pack, PackGenerationSettings } from '../../services/PackGeneratorService';
import { PackCard } from '../../components/PackCard';

interface CubeManagerProps {
  packs: Pack[];
  setPacks: React.Dispatch<React.SetStateAction<Pack[]>>;
  onGoToLobby: () => void;
}

import { useToast } from '../../components/Toast';

export const CubeManager: React.FC<CubeManagerProps> = ({ packs, setPacks, onGoToLobby }) => {
  const { showToast } = useToast();
  // --- Services ---
  // Memoize services to persist cache across renders
  const generatorService = React.useMemo(() => new PackGeneratorService(), []);

  // --- State ---
  const [inputText, setInputText] = useState(() => localStorage.getItem('cube_inputText') || '');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState('');
  const [copySuccess, setCopySuccess] = useState(false);

  const [rawScryfallData, setRawScryfallData] = useState<ScryfallCard[] | null>(() => {
    try {
      const saved = localStorage.getItem('cube_rawScryfallData');
      return saved ? JSON.parse(saved) : null;
    } catch (e) {
      console.warn("Failed to load rawScryfallData from local storage", e);
      return null;
    }
  });

  useEffect(() => {
    try {
      if (rawScryfallData) {
        localStorage.setItem('cube_rawScryfallData', JSON.stringify(rawScryfallData));
      } else {
        localStorage.removeItem('cube_rawScryfallData');
      }
    } catch (e) {
      console.warn("Failed to save rawScryfallData to local storage (likely quota exceeded)", e);
    }
  }, [rawScryfallData]);
  const [processedData, setProcessedData] = useState<{ pools: ProcessedPools, sets: SetsMap } | null>(null);

  const [filters, setFilters] = useState<{
    ignoreBasicLands: boolean;
    ignoreCommander: boolean;
    ignoreTokens: boolean;
  }>(() => {
    try {
      const saved = localStorage.getItem('cube_filters');
      return saved ? JSON.parse(saved) : {
        ignoreBasicLands: false,
        ignoreCommander: false,
        ignoreTokens: false
      };
    } catch {
      return {
        ignoreBasicLands: false,
        ignoreCommander: false,
        ignoreTokens: false
      };
    }
  });

  // UI State
  const [viewMode, setViewMode] = useState<'list' | 'grid' | 'stack'>('list');

  // Generation Settings
  const [genSettings, setGenSettings] = useState<PackGenerationSettings>(() => {
    try {
      const saved = localStorage.getItem('cube_genSettings');
      return saved ? JSON.parse(saved) : {
        mode: 'mixed',
        rarityMode: 'peasant'
      };
    } catch {
      return {
        mode: 'mixed',
        rarityMode: 'peasant'
      };
    }
  });

  const [sourceMode, setSourceMode] = useState<'upload' | 'set'>(() =>
    (localStorage.getItem('cube_sourceMode') as 'upload' | 'set') || 'upload'
  );
  const [availableSets, setAvailableSets] = useState<ScryfallSet[]>([]);
  const [selectedSets, setSelectedSets] = useState<string[]>(() => {
    const saved = localStorage.getItem('cube_selectedSets');
    return saved ? JSON.parse(saved) : [];
  });

  const [searchTerm, setSearchTerm] = useState('');
  const [gameTypeFilter, setGameTypeFilter] = useState<'all' | 'paper' | 'digital'>('all'); // Filter state
  const [numBoxes, setNumBoxes] = useState<number>(() => {
    const saved = localStorage.getItem('cube_numBoxes');
    return saved ? parseInt(saved) : 3;
  });

  const [cardWidth, setCardWidth] = useState(() => {
    const saved = localStorage.getItem('cube_cardWidth');
    return saved ? parseInt(saved) : 140;
  });

  // --- Persistence Effects ---
  useEffect(() => localStorage.setItem('cube_inputText', inputText), [inputText]);
  useEffect(() => localStorage.setItem('cube_filters', JSON.stringify(filters)), [filters]);
  useEffect(() => localStorage.setItem('cube_genSettings', JSON.stringify(genSettings)), [genSettings]);
  useEffect(() => localStorage.setItem('cube_sourceMode', sourceMode), [sourceMode]);
  useEffect(() => localStorage.setItem('cube_selectedSets', JSON.stringify(selectedSets)), [selectedSets]);
  useEffect(() => localStorage.setItem('cube_numBoxes', numBoxes.toString()), [numBoxes]);
  useEffect(() => localStorage.setItem('cube_cardWidth', cardWidth.toString()), [cardWidth]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Effects ---
  useEffect(() => {
    if (rawScryfallData) {
      // Use local images: true
      const result = generatorService.processCards(rawScryfallData, filters, true);
      setProcessedData(result);
    }
  }, [filters, rawScryfallData]);

  useEffect(() => {
    fetch('/api/sets')
      .then(res => res.json())
      .then((sets: ScryfallSet[]) => {
        setAvailableSets(sets.sort((a, b) => new Date(b.released_at).getTime() - new Date(a.released_at).getTime()));
      })
      .catch(console.error);
  }, []);

  // --- Handlers ---
  const handlePlayOnline = () => {
    const totalPacks = packs.length;

    // Rules:
    // < 12: No draft
    // 12 <= p < 18: 4 players
    // 18 <= p < 24: 4 or 6 players
    // >= 24: 4, 6 or 8 players

    if (totalPacks < 12) {
      showToast('Need at least 12 packs for a 4-player draft (3 packs/player).', 'error');
      return;
    }

    if (totalPacks >= 12 && totalPacks < 18) {
      showToast('Enough packs for 4 players only.', 'info');
    } else if (totalPacks >= 18 && totalPacks < 24) {
      showToast('Enough packs for 4 or 6 players.', 'info');
    } else {
      showToast('Enough packs for 8 players!', 'success');
    }

    // Proceed to lobby
    onGoToLobby();
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => setInputText(e.target?.result as string || '');
    reader.readAsText(file);
    event.target.value = '';
  };



  const handleGenerate = async () => {
    // Validate inputs
    if (sourceMode === 'set' && selectedSets.length === 0) return;
    if (sourceMode === 'upload' && !inputText) return;

    setLoading(true);
    setPacks([]); // Clear old packs to avoid confusion

    try {
      // --- Step 1: Fetch/Parse ---
      let currentCards: ScryfallCard[] = [];

      setProgress(sourceMode === 'set' ? 'Fetching set data...' : 'Parsing text...');

      if (sourceMode === 'set') {
        // Fetch set by set
        for (const [index, setCode] of selectedSets.entries()) {
          setProgress(`Fetching set ${setCode.toUpperCase()} (${index + 1}/${selectedSets.length})...`);
          const response = await fetch(`/api/sets/${setCode}/cards`);
          if (!response.ok) throw new Error(`Failed to fetch set ${setCode}`);
          const cards: ScryfallCard[] = await response.json();
          currentCards.push(...cards);
        }

      } else {
        // Parse Text
        setProgress('Parsing and fetching from server...');
        const response = await fetch('/api/cards/parse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: inputText })
        });

        if (!response.ok) {
          const err = await response.json();
          throw new Error(err.error || "Failed to parse cards");
        }

        currentCards = await response.json();

      }

      // Update local state for UI preview/stats
      setRawScryfallData(currentCards);

      // --- Step 2: Generate ---
      setProgress('Generating packs on server...');

      const payload = {
        cards: sourceMode === 'upload' ? currentCards : [], // For set mode, we let server refetch or handle it
        sourceMode,
        selectedSets,
        settings: {
          ...genSettings,
          withReplacement: sourceMode === 'set'
        },
        numBoxes,
        numPacks: sourceMode === 'set' ? (numBoxes * 36) : undefined,
        filters
      };

      if (sourceMode === 'set') {
        payload.cards = [];
      }

      const response = await fetch('/api/packs/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Generation failed");
      }

      const newPacks: Pack[] = await response.json();

      if (newPacks.length === 0) {
        alert(`No packs generated. Check your card pool settings.`);
      } else {
        setPacks(newPacks);
      }
    } catch (err: any) {
      console.error("Process failed", err);
      alert(err.message || "Error during process.");
    } finally {
      setLoading(false);
      setProgress('');
    }
  };

  const handleExportCsv = () => {
    if (packs.length === 0) return;
    const csvContent = generatorService.generateCsv(packs);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `generated_packs_${new Date().toISOString().slice(0, 10)}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadTemplate = () => {
    const template = `Quantity,Name,Finish,Edition Name,Scryfall ID
5,Agate Assault,Normal,Bloomburrow,7dd9946b-515e-4e0d-9da2-711e126e9fa6
1,Agate-Blade Assassin,Normal,Bloomburrow,39ebb84a-1c52-4b07-9bd0-b360523b3a5b
4,Agate-Blade Assassin,Normal,Bloomburrow,39ebb84a-1c52-4b07-9bd0-b360523b3a5b
4,Alania's Pathmaker,Normal,Bloomburrow,d3871fe6-e26e-4ab4-bd81-7e3c7b8135c1
1,Artist's Talent,Normal,Bloomburrow,8b9e51d9-189b-4dd6-87cb-628ea6373e81
1,Azure Beastbinder,Normal,Bloomburrow,211af1bf-910b-41a5-b928-f378188d1871
3,Bakersbane Duo,Normal,Bloomburrow,5309354f-1ff4-4fa9-9141-01ea2f7588ab
2,Bandit's Talent,Normal,Bloomburrow,485dc8d8-9e44-4a0f-9ff6-fa448e232290
3,Banishing Light,Normal,Bloomburrow,25a06f82-ebdb-4dd6-bfe8-958018ce557c
4,Barkform Harvester,Normal,Bloomburrow,f77049a6-0f22-415b-bc89-20bcb32accf6
1,Bark-Knuckle Boxer,Normal,Bloomburrow,582637a9-6aa0-4824-bed7-d5fc91bda35e
1,"Baylen, the Haymaker",Normal,Bloomburrow,00e93be2-e06b-4774-8ba5-ccf82a6da1d8
3,Bellowing Crier,Normal,Bloomburrow,ca2215dd-6300-49cf-b9b2-3a840b786c31
1,Blacksmith's Talent,Normal,Bloomburrow,4bb318fa-481d-40a7-978e-f01b49101ae0
1,Blooming Blast,Normal,Bloomburrow,0cd92a83-cec3-4085-a929-3f204e3e0140
4,Bonebind Orator,Normal,Bloomburrow,faf226fa-ca09-4468-8804-87b2a7de2c66
2,Bonecache Overseer,Normal,Bloomburrow,82defb87-237f-4b77-9673-5bf00607148f
1,Brambleguard Captain,Foil,Bloomburrow,e200b8bf-f2f3-4157-8e04-02baf07a963e`;
    const blob = new Blob([template], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `import_template.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCopyCsv = async () => {
    if (packs.length === 0) return;
    const csvContent = generatorService.generateCsv(packs);
    try {
      await navigator.clipboard.writeText(csvContent);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error('Failed to copy: ', err);
      alert('Failed to copy CSV to clipboard');
    }
  };

  const toggleFilter = (key: keyof typeof filters) => {
    setFilters(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleReset = () => {
    if (window.confirm("Are you sure you want to clear this session? All parsed cards and generated packs will be lost.")) {
      setPacks([]);
      setInputText('');
      setRawScryfallData(null);
      setProcessedData(null);
      setProcessedData(null);
      setSelectedSets([]);
      localStorage.removeItem('cube_inputText');
      localStorage.removeItem('cube_rawScryfallData');
      localStorage.removeItem('cube_selectedSets');
      // We keep filters and settings as they are user preferences
    }
  };

  return (
    <div className="h-full overflow-y-auto w-full flex flex-col lg:flex-row gap-8 p-4 md:p-6">

      {/* --- LEFT COLUMN: CONTROLS --- */}
      <div className="w-full lg:w-1/3 lg:max-w-[400px] shrink-0 flex flex-col gap-4 lg:sticky lg:top-4 lg:self-start lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto custom-scrollbar p-1">
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
                  <button onClick={handleDownloadTemplate} className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1 hover:underline">
                    <FileDown className="w-3 h-3" /> Template
                  </button>
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

              {/* Parse Button Removed per request */}
            </>
          ) : (
            <>
              <div className="mb-4">
                <label className="block text-sm font-semibold text-slate-300 mb-2">Select Expansions</label>

                <div className="bg-slate-900 border border-slate-700 rounded-lg overflow-hidden">
                  {/* Search Header */}
                  <div className="flex items-center gap-2 p-2 border-b border-slate-700 bg-slate-800/50">
                    <Search className="w-4 h-4 text-slate-500" />
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Search sets..."
                      className="bg-transparent text-xs w-full outline-none text-white placeholder-slate-500 font-medium"
                      disabled={loading}
                    />
                    {searchTerm && (
                      <button onClick={() => setSearchTerm('')}>
                        <X className="w-3 h-3 text-slate-500 hover:text-white" />
                      </button>
                    )}
                  </div>

                  {/* Game Type Filter */}
                  <div className="flex border-b border-slate-700 bg-slate-900">
                    <button
                      onClick={() => setGameTypeFilter('all')}
                      className={`flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors ${gameTypeFilter === 'all' ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'}`}
                    >
                      All
                    </button>
                    <button
                      onClick={() => setGameTypeFilter('paper')}
                      className={`flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors ${gameTypeFilter === 'paper' ? 'bg-emerald-900/40 text-emerald-400' : 'text-slate-500 hover:text-emerald-400 hover:bg-slate-800'}`}
                      title="Show only Paper sets"
                    >
                      Paper
                    </button>
                    <button
                      onClick={() => setGameTypeFilter('digital')}
                      className={`flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors ${gameTypeFilter === 'digital' ? 'bg-blue-900/40 text-blue-400' : 'text-slate-500 hover:text-blue-400 hover:bg-slate-800'}`}
                      title="Show only Digital sets (Arena/MTGO)"
                    >
                      Digital
                    </button>
                  </div>

                  {/* List */}
                  <div className="max-h-60 overflow-y-auto custom-scrollbar p-1 space-y-0.5">
                    {availableSets
                      .filter(s => {
                        // Search Filter
                        const matchesSearch = !searchTerm ||
                          s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          s.code.toLowerCase().includes(searchTerm.toLowerCase());

                        // Game Type Filter
                        const matchesType =
                          gameTypeFilter === 'all' ? true :
                            gameTypeFilter === 'paper' ? !s.digital :
                              gameTypeFilter === 'digital' ? s.digital : true;

                        return matchesSearch && matchesType;
                      })
                      .map(s => {
                        const isSelected = selectedSets.includes(s.code);
                        return (
                          <label
                            key={s.code}
                            className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors ${isSelected ? 'bg-purple-900/30 text-purple-200' : 'hover:bg-slate-800 text-slate-400 hover:text-slate-200'}`}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {
                                setSelectedSets(prev =>
                                  prev.includes(s.code)
                                    ? prev.filter(c => c !== s.code)
                                    : [...prev, s.code]
                                )
                              }}
                              className="w-3.5 h-3.5 rounded border-slate-600 bg-slate-800 text-purple-500 focus:ring-purple-500 focus:ring-offset-0"
                              disabled={loading}
                            />
                            <div className="flex flex-col">
                              <span className="text-xs font-medium leading-none">{s.name}</span>
                              <span className="text-[10px] opacity-60 font-mono">{s.code.toUpperCase()} • {s.set_type} • {s.released_at?.slice(0, 4)}</span>
                            </div>
                          </label>
                        );
                      })}
                    {availableSets.filter(s => !searchTerm || s.name.toLowerCase().includes(searchTerm.toLowerCase()) || s.code.toLowerCase().includes(searchTerm.toLowerCase())).length === 0 && (
                      <div className="p-3 text-center text-xs text-slate-600 italic">
                        No sets found matching "{searchTerm}"
                      </div>
                    )}
                  </div>

                  {/* Footer Stats */}
                  <div className="bg-slate-950 p-2 border-t border-slate-800 flex justify-between items-center">
                    <span className="text-[10px] text-slate-500 font-mono">
                      {selectedSets.length} selected
                    </span>
                    {selectedSets.length > 0 && (
                      <button
                        onClick={() => setSelectedSets([])}
                        className="text-[10px] text-red-400 hover:text-red-300 hover:underline"
                        disabled={loading}
                      >
                        Clear Selection
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Fetch Set and Quantity Blocks Removed/Moved */}
            </>
          )}

          {/* Generation Settings */}
          {(sourceMode === 'set' ? selectedSets.length > 0 : !!inputText) && (
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

              {/* Quantity - Moved Here */}
              {sourceMode === 'set' && (
                <div className="mb-4">
                  <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Quantity</label>
                  <div className="flex items-center gap-2 bg-slate-800 p-2 rounded border border-slate-700">
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={numBoxes}
                      onChange={(e) => setNumBoxes(parseInt(e.target.value))}
                      className="w-16 bg-slate-700 border-none rounded p-1 text-center text-white font-mono"
                      disabled={loading}
                    />
                    <span className="text-slate-300 text-xs">Boxes ({numBoxes * 36} Packs)</span>
                  </div>
                </div>
              )}

              {/* Sets Info */}
              {processedData && Object.keys(processedData.sets).length > 0 && (
                <div className="max-h-40 overflow-y-auto text-xs space-y-1 pr-2 custom-scrollbar border-t border-slate-800 pt-2">
                  {Object.values(processedData.sets).sort((a, b) => b.commons.length - a.commons.length).map(set => (
                    <div key={set.code} className="flex justify-between items-center text-slate-400 border-b border-slate-800 pb-1">
                      <span className="truncate w-32" title={set.name}>{set.name}</span>
                      <span className="font-mono text-[10px]">{set.commons.length}C / {set.uncommons.length}U / {set.rares.length}R</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <button
            onClick={handleGenerate}
            disabled={((sourceMode === 'set' && selectedSets.length === 0) || (sourceMode === 'upload' && !inputText)) || loading}
            className={`w-full py-3 px-4 rounded-lg font-bold flex justify-center items-center gap-2 transition-all ${((sourceMode === 'set' && selectedSets.length === 0) || (sourceMode === 'upload' && !inputText)) || loading ? 'bg-slate-700 cursor-not-allowed text-slate-500' : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/20'}`}
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <RotateCcw className="w-5 h-5" />}
            {loading ? progress : 'Generate Packs'}
          </button>

          {/* Reset Button */}
          <button
            onClick={handleReset}
            className="w-full mt-4 py-2 text-xs font-semibold text-slate-500 hover:text-red-400 hover:bg-red-900/10 rounded-lg transition-colors flex items-center justify-center gap-2"
            title="Clear all data and start over"
          >
            <Trash2 className="w-3 h-3" /> Clear Session
          </button>
        </div>
      </div>

      {/* --- RIGHT COLUMN: PACKS --- */}
      <div className="flex-1 w-full min-w-0">
        <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4 sticky top-4 z-40 bg-slate-900/95 backdrop-blur-xl p-3 rounded-xl border border-white/10 shadow-2xl">
          <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-start">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <span className="bg-slate-700 text-purple-400 px-3 py-1 rounded-lg text-sm border border-slate-600">{packs.length}</span>
              Packs
            </h2>
          </div>

          <div className="flex gap-2 w-full sm:w-auto justify-end overflow-x-auto pb-1 sm:pb-0">
            {/* Play Button */}
            {packs.length > 0 && (
              <>
                <button
                  onClick={handlePlayOnline}
                  className={`px-4 py-2 font-bold rounded-lg shadow-lg flex items-center gap-2 animate-in fade-in zoom-in whitespace-nowrap transition-colors
                    ${packs.length < 12
                      ? 'bg-slate-700 text-slate-400 cursor-not-allowed hover:bg-slate-600'
                      : 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white'
                    }`}
                >
                  <Users className="w-4 h-4" /> <span className="hidden sm:inline">Play Online</span>
                </button>
                <button
                  onClick={handleExportCsv}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white font-bold rounded-lg shadow-lg flex items-center gap-2 animate-in fade-in zoom-in"
                  title="Export as CSV"
                >
                  <Download className="w-4 h-4" /> <span className="hidden sm:inline">Export</span>
                </button>
                <button
                  onClick={handleCopyCsv}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white font-bold rounded-lg shadow-lg flex items-center gap-2 animate-in fade-in zoom-in"
                  title="Copy CSV to Clipboard"
                >
                  {copySuccess ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  <span className="hidden sm:inline">{copySuccess ? 'Copied!' : 'Copy'}</span>
                </button>

                {/* Size Slider */}
                <div className="flex items-center gap-2 bg-slate-800 rounded-lg px-2 py-1 border border-slate-700 h-9 mr-2 flex">
                  <div className="w-3 h-4 rounded border border-slate-500 bg-slate-700" title="Small Cards" />
                  <input
                    type="range"
                    min="100"
                    max="300"
                    step="1"
                    value={cardWidth}
                    onChange={(e) => setCardWidth(parseInt(e.target.value))}
                    className="w-24 accent-purple-500 cursor-pointer h-1.5 bg-slate-600 rounded-lg appearance-none"
                    title={`Card Size: ${cardWidth}px`}
                  />
                  <div className="w-4 h-6 rounded border border-slate-500 bg-slate-700" title="Large Cards" />
                </div>
              </>
            )}

            <div className="flex bg-slate-800 rounded-lg p-1 border border-slate-700 shrink-0">
              <button onClick={() => setViewMode('list')} className={`p-2 rounded ${viewMode === 'list' ? 'bg-slate-600 text-white' : 'text-slate-400'}`}><List className="w-4 h-4" /></button>
              <button onClick={() => setViewMode('grid')} className={`p-2 rounded ${viewMode === 'grid' ? 'bg-slate-600 text-white' : 'text-slate-400'}`}><LayoutGrid className="w-4 h-4" /></button>
              <button onClick={() => setViewMode('stack')} className={`p-2 rounded ${viewMode === 'stack' ? 'bg-slate-600 text-white' : 'text-slate-400'}`}><Layers className="w-4 h-4" /></button>
            </div>
          </div>
        </div>

        {packs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 border-2 border-dashed border-slate-700 rounded-2xl bg-slate-800/30 text-slate-500">
            <Box className="w-12 h-12 mb-4 opacity-50" />
            <p>No packs generated.</p>
          </div>
        ) : (
          <div
            className="grid gap-6 pb-20"
            style={{
              gridTemplateColumns: cardWidth <= 150
                ? `repeat(auto-fill, minmax(${viewMode === 'list' ? '320px' : '550px'}, 1fr))`
                : '1fr'
            }}
          >
            {packs.map((pack) => (
              <PackCard key={pack.id} pack={pack} viewMode={viewMode} cardWidth={cardWidth} />
            ))}
          </div>
        )}
      </div>

    </div >
  );
};
