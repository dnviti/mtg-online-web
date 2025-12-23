import React, { useState } from 'react';
import { Modal } from '../../components/Modal';

interface TokenDefinition {
  name: string;
  power: string;
  toughness: string;
  colors: string[];
  types: string;
  subtypes: string;
  imageUrl?: string;
}

interface CreateTokenModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (definition: TokenDefinition) => void;
}

const COLORS = [
  { id: 'W', label: 'White', bg: 'bg-yellow-100 text-yellow-900 border-yellow-300' },
  { id: 'U', label: 'Blue', bg: 'bg-blue-100 text-blue-900 border-blue-300' },
  { id: 'B', label: 'Black', bg: 'bg-slate-300 text-slate-900 border-slate-400' },
  { id: 'R', label: 'Red', bg: 'bg-red-100 text-red-900 border-red-300' },
  { id: 'G', label: 'Green', bg: 'bg-green-100 text-green-900 border-green-300' },
  { id: 'C', label: 'Colorless', bg: 'bg-gray-100 text-gray-900 border-gray-300' },
];

export const CreateTokenModal: React.FC<CreateTokenModalProps> = ({ isOpen, onClose, onCreate }) => {
  const [name, setName] = useState('Token');
  const [power, setPower] = useState('1');
  const [toughness, setToughness] = useState('1');
  const [selectedColors, setSelectedColors] = useState<string[]>([]);
  const [types, setTypes] = useState('Creature');
  const [subtypes, setSubtypes] = useState('');
  const [imageUrl, setImageUrl] = useState('');

  const toggleColor = (colorId: string) => {
    setSelectedColors(prev =>
      prev.includes(colorId)
        ? prev.filter(c => c !== colorId)
        : [...prev, colorId]
    );
  };

  const handleCreate = () => {
    onCreate({
      name,
      power,
      toughness,
      colors: selectedColors,
      types: types,
      subtypes: subtypes,
      imageUrl: imageUrl || undefined
    });
    // Reset form roughly or keep? Usually reset.
    resetForm();
  };

  const resetForm = () => {
    setName('Token');
    setPower('1');
    setToughness('1');
    setSelectedColors([]);
    setTypes('Creature');
    setSubtypes('');
    setImageUrl('');
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Create Custom Token"
      confirmLabel="Create Token"
      onConfirm={handleCreate}
      cancelLabel="Cancel"
      maxWidth="max-w-lg"
    >
      <div className="flex flex-col gap-4">
        {/* Name */}
        <div>
          <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Token Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white focus:outline-none focus:border-emerald-500 transition-colors"
            placeholder="e.g. Dragon, Soldier, Treasure"
          />
        </div>

        {/* P/T */}
        <div className="flex gap-4">
          <div className="flex-1">
            <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Power</label>
            <input
              type="text"
              value={power}
              onChange={(e) => setPower(e.target.value)}
              className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white focus:outline-none focus:border-emerald-500 transition-colors"
            />
          </div>
          <div className="flex-1">
            <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Toughness</label>
            <input
              type="text"
              value={toughness}
              onChange={(e) => setToughness(e.target.value)}
              className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white focus:outline-none focus:border-emerald-500 transition-colors"
            />
          </div>
        </div>

        {/* Colors */}
        <div>
          <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Colors</label>
          <div className="flex gap-2 flex-wrap">
            {COLORS.map(c => (
              <button
                key={c.id}
                onClick={() => toggleColor(c.id)}
                className={`
                  w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm border-2 transition-all
                  ${selectedColors.includes(c.id) ? c.bg + ' ring-2 ring-white ring-offset-2 ring-offset-slate-900 scale-110' : 'bg-slate-800 border-slate-600 text-slate-500 hover:bg-slate-700'}
                `}
                title={c.label}
              >
                {c.id}
              </button>
            ))}
          </div>
        </div>

        {/* Types */}
        <div className="flex gap-4">
          <div className="flex-1">
            <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Type</label>
            <input
              type="text"
              value={types}
              onChange={(e) => setTypes(e.target.value)}
              className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white focus:outline-none focus:border-emerald-500 transition-colors"
              placeholder="Creature, Artifact..."
            />
          </div>
          <div className="flex-1">
            <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Subtypes</label>
            <input
              type="text"
              value={subtypes}
              onChange={(e) => setSubtypes(e.target.value)}
              className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white focus:outline-none focus:border-emerald-500 transition-colors"
              placeholder="Soldier, Drake..."
            />
          </div>
        </div>

        {/* Image URL */}
        <div>
          <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Image URL (Optional)</label>
          <input
            type="text"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white text-xs focus:outline-none focus:border-emerald-500 transition-colors"
            placeholder="https://..."
          />
        </div>

        {/* Preview Summary */}
        <div className="mt-2 p-3 bg-slate-800/50 rounded border border-slate-700 flex items-center gap-3">
          <div className="w-12 h-12 bg-slate-900 border border-slate-600 rounded flex items-center justify-center text-xs text-slate-500 overflow-hidden relative">
            {imageUrl ? (
              <img src={imageUrl} alt="Preview" className="w-full h-full object-cover" onError={(e) => e.currentTarget.style.display = 'none'} />
            ) : (
              <span>?</span>
            )}
          </div>
          <div className="flex-1">
            <div className="font-bold text-white text-sm">{name} {power}/{toughness}</div>
            <div className="text-xs text-slate-400">
              {selectedColors.length > 0 ? selectedColors.join('/') : 'Colorless'} {types} {subtypes ? `— ${subtypes}` : ''}
            </div>
          </div>
        </div>

      </div>
    </Modal>
  );
};
