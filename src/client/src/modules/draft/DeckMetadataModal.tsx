import React, { useState, useEffect } from 'react';
import { Modal } from '../../components/Modal';
import { Pencil, Swords } from 'lucide-react';

interface DeckMetadataModalProps {
    isOpen: boolean;
    onClose: () => void;
    initialName: string;
    initialFormat: string;
    onSave: (name: string, format: string) => void;
    isConstructed: boolean;
}

export const DeckMetadataModal: React.FC<DeckMetadataModalProps> = ({
    isOpen,
    onClose,
    initialName,
    initialFormat,
    onSave,
    isConstructed
}) => {
    const [name, setName] = useState(initialName);
    const [format, setFormat] = useState(initialFormat);

    useEffect(() => {
        if (isOpen) {
            setName(initialName);
            setFormat(initialFormat);
        }
    }, [isOpen, initialName, initialFormat]);

    const handleSave = () => {
        if (!name.trim()) return;
        onSave(name, format);
        onClose();
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Deck Settings"
            maxWidth="max-w-md"
            confirmLabel="Update"
            onConfirm={handleSave}
            cancelLabel="Cancel"
        >
            <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                    <label className="text-sm font-bold text-slate-400 flex items-center gap-2">
                        <Pencil className="w-4 h-4" /> Deck Name
                    </label>
                    <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-shadow"
                        placeholder="Enter deck name..."
                        autoFocus
                    />
                </div>

                {isConstructed && (
                    <div className="flex flex-col gap-2">
                        <label className="text-sm font-bold text-slate-400 flex items-center gap-2">
                            <Swords className="w-4 h-4" /> Format
                        </label>
                        <select
                            value={format}
                            onChange={(e) => setFormat(e.target.value)}
                            className="bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-emerald-500 outline-none appearance-none cursor-pointer hover:bg-slate-750 transition-colors"
                        >
                            <option value="Standard">Standard</option>
                            <option value="Modern">Modern</option>
                            <option value="Commander">Commander</option>
                            <option value="Pioneer">Pioneer</option>
                            <option value="Legacy">Legacy</option>
                            <option value="Vintage">Vintage</option>
                            <option value="Pauper">Pauper</option>
                            <option value="Historic">Historic</option>
                            <option value="Timeless">Timeless</option>
                            <option value="Limited">Limited / Draft</option>
                        </select>
                        {format === 'Commander' && (
                            <p className="text-xs text-amber-500 mt-1">
                                Commander rules enabled: 100 cards, Singleton, Commander Zone.
                            </p>
                        )}
                    </div>
                )}
            </div>
        </Modal>
    );
};
