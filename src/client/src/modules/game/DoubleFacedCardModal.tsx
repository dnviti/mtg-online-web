import React from 'react';
import { CardInstance } from '../../types/game';
import { CardVisual } from '../../components/CardVisual';

interface DoubleFacedCardModalProps {
  isOpen: boolean;
  card: CardInstance | null;
  onClose: () => void;
  onSelectFace: (faceIndex: number) => void;
}

export const DoubleFacedCardModal: React.FC<DoubleFacedCardModalProps> = ({
  isOpen,
  card,
  onClose,
  onSelectFace
}) => {
  if (!isOpen || !card) return null;

  // Ensure definition has card_faces
  const faces = card.definition?.card_faces;
  if (!faces || faces.length < 2) {
    // Should not happen if logic is correct, but fail safe
    return null;
  }

  // Create temporary mock cards for rendering visual
  const createMockCardForFace = (faceIndex: number): CardInstance => ({
    ...card,
    activeFaceIndex: faceIndex, // CardVisual will use this to pick rect
    // We don't need to manually verify card_faces presence here as CardVisual will handle it
    // But for cleaner visual, we ensure face-down is false
    faceDown: false,
    tapped: false,
  });

  const frontCard = createMockCardForFace(0);
  const backCard = createMockCardForFace(1);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 max-w-4xl w-full shadow-2xl flex flex-col items-center gap-6">

        <h2 className="text-2xl font-bold text-white tracking-wide">Select Face to Play</h2>

        <div className="flex gap-8 items-center justify-center w-full">
          {/* Front Face */}
          <div
            className="group relative flex flex-col items-center gap-3 cursor-pointer transition-transform hover:scale-105"
            onClick={() => onSelectFace(0)}
          >
            <div className="relative w-64 h-[360px] rounded-xl overflow-hidden ring-4 ring-transparent hover:ring-blue-500 transition-all shadow-lg">
              <CardVisual card={frontCard} viewMode="large" className="w-full h-full" />
              {/* Overlay Label */}
              <div className="absolute top-2 left-2 bg-black/70 px-2 py-1 rounded text-xs font-bold text-white uppercase tracking-wider">
                Front
              </div>
            </div>
            <span className="text-slate-300 font-medium group-hover:text-blue-400 transition-colors">
              {faces[0].name}
            </span>
          </div>

          <div className="h-40 w-px bg-slate-700/50"></div>

          {/* Back Face */}
          <div
            className="group relative flex flex-col items-center gap-3 cursor-pointer transition-transform hover:scale-105"
            onClick={() => onSelectFace(1)}
          >
            <div className="relative w-64 h-[360px] rounded-xl overflow-hidden ring-4 ring-transparent hover:ring-purple-500 transition-all shadow-lg">
              <CardVisual card={backCard} viewMode="large" className="w-full h-full" />
              <div className="absolute top-2 left-2 bg-black/70 px-2 py-1 rounded text-xs font-bold text-white uppercase tracking-wider">
                Back
              </div>
            </div>
            <span className="text-slate-300 font-medium group-hover:text-purple-400 transition-colors">
              {faces[1].name}
            </span>
          </div>
        </div>

        <button
          onClick={onClose}
          className="mt-4 px-6 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 font-medium transition-colors"
        >
          Cancel
        </button>

      </div>
    </div>
  );
};
