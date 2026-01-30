import React from 'react';
import { useUser } from '../contexts/UserContext';

interface AdSidebarProps {
  position: 'left' | 'right';
}

export const AdSidebar: React.FC<AdSidebarProps> = ({ position }) => {
  const { isPremium } = useUser();

  // Hide ads completely for premium users
  if (isPremium) {
    return null;
  }

  return (
    <aside
      className={`hidden xl:flex flex-col w-[160px] shrink-0 bg-slate-950 border-slate-700 ${
        position === 'left' ? 'border-r' : 'border-l'
      }`}
    >
      {/* Ad slot - 160x600 (Wide Skyscraper) */}
      <div className="sticky top-4 p-2 flex flex-col gap-4">
        <div className="w-[160px] h-[600px] bg-slate-800/50 border border-slate-700 rounded-lg flex items-center justify-center">
          <div className="text-center text-slate-500 text-xs p-4">
            <div className="w-8 h-8 mx-auto mb-2 rounded bg-slate-700/50 flex items-center justify-center">
              <span className="text-lg">AD</span>
            </div>
            <p>160x600</p>
            <p className="text-[10px] mt-1 text-slate-600">Ad Space</p>
          </div>
        </div>

        {/* Secondary smaller ad slot - 160x300 */}
        <div className="w-[160px] h-[300px] bg-slate-800/50 border border-slate-700 rounded-lg flex items-center justify-center">
          <div className="text-center text-slate-500 text-xs p-4">
            <div className="w-8 h-8 mx-auto mb-2 rounded bg-slate-700/50 flex items-center justify-center">
              <span className="text-lg">AD</span>
            </div>
            <p>160x300</p>
            <p className="text-[10px] mt-1 text-slate-600">Ad Space</p>
          </div>
        </div>
      </div>
    </aside>
  );
};
