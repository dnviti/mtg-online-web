import React, { useState } from 'react';
import { Modal } from '../../components/Modal';
import { ManaIcon } from '../../components/ManaIcon';

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
  { id: 'W', label: 'White' },
  { id: 'U', label: 'Blue' },
  { id: 'B', label: 'Black' },
  { id: 'R', label: 'Red' },
  { id: 'G', label: 'Green' },
  { id: 'C', label: 'Colorless' },
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
          <div className="flex gap-4 flex-wrap justify-center">
            {COLORS.map(c => {
              const isSelected = selectedColors.includes(c.id);
              return (
                <button
                  key={c.id}
                  onClick={() => toggleColor(c.id)}
                  className={`
                  transition-all duration-200 rounded-full flex items-center justify-center
                  ${isSelected ? 'scale-110 opacity-100 saturate-100 ring-2 ring-white/50 ring-offset-2 ring-offset-slate-900' : 'opacity-40 saturate-0 hover:opacity-100 hover:saturate-100 hover:scale-105'}
                `}
                  title={c.label}
                >
                  <div className="pointer-events-none flex items-center justify-center">
                    <ManaIcon symbol={c.id.toLowerCase()} size="2x" shadow />
                  </div>
                </button>
              )
            })}
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
            <div className="text-xs text-slate-400 flex items-center gap-2">
              <div className="flex items-center gap-0.5">
                {selectedColors.length > 0 ? selectedColors.map(c => (
                  <ManaIcon key={c} symbol={c.toLowerCase()} size="sm" shadow />
                )) : 'Colorless'}
              </div>
              <span>{types} {subtypes ? `— ${subtypes}` : ''}</span>
            </div>
          </div>
        </div>

      </div>
    </Modal>
  );
};
