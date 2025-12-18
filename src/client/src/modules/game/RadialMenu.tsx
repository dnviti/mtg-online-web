import React, { } from 'react';
import { } from 'lucide-react';

export interface RadialOption {
  id: string;
  label: string;
  icon?: React.ReactNode;
  color?: string; // CSS color string
  onSelect: () => void;
}

interface RadialMenuProps {
  options: RadialOption[];
  position: { x: number, y: number };
  onClose: () => void;
}

export const RadialMenu: React.FC<RadialMenuProps> = ({ options, position, onClose }) => {
  if (options.length === 0) return null;

  const radius = 60; // Distance from center
  const buttonSize = 40; // Diameter of option buttons

  return (
    // Backdrop to close on click outside
    <div
      className="fixed inset-0 z-[150] touch-none select-none"
      onClick={onClose}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div
        className="absolute"
        style={{
          left: position.x,
          top: position.y,
          transform: 'translate(-50%, -50%)'
        }}
      >
        {/* Center close/cancel circle (optional) */}
        <div className="absolute inset-0 w-8 h-8 -translate-x-1/2 -translate-y-1/2 bg-black/50 rounded-full backdrop-blur-sm pointer-events-none" />

        {options.map((opt, index) => {
          const angle = (index * 360) / options.length;
          const radian = (angle - 90) * (Math.PI / 180); // -90 to start at top
          const x = Math.cos(radian) * radius;
          const y = Math.sin(radian) * radius;

          return (
            <div
              key={opt.id}
              className="absolute flex flex-col items-center justify-center cursor-pointer transition-transform hover:scale-110 active:scale-95 animate-in zoom-in duration-200"
              style={{
                left: x,
                top: y,
                width: buttonSize,
                height: buttonSize,
                transform: 'translate(-50%, -50%)'
              }}
              onClick={(e) => {
                e.stopPropagation();
                opt.onSelect();
                onClose();
              }}
            >
              <div
                className={`
                                w-full h-full rounded-full shadow-lg border-2 border-white/20 flex items-center justify-center text-white font-bold
                                ${opt.color ? '' : 'bg-slate-700'}
                            `}
                style={{ backgroundColor: opt.color }}
              >
                {opt.icon || opt.label.substring(0, 2)}
              </div>
              {/* Label tooltip or text below */}
              <div className="absolute top-full mt-1 bg-black/80 px-1.5 py-0.5 rounded text-[10px] text-white whitespace-nowrap opacity-0 hover:opacity-100 transition-opacity pointer-events-none">
                {opt.label}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
