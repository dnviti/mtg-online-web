import React from 'react';
import { useUser } from '../contexts/UserContext';
import { AdBanner } from './AdBanner';

interface AdSidebarProps {
  position: 'left' | 'right';
}

// Configure your AdSense slot IDs here after creating ad units in Google AdSense
// You'll need separate slot IDs for each ad unit size
const AD_SLOTS = {
  skyscraper: 'XXXXXXXX', // 160x600 Wide Skyscraper - replace with your slot ID
  halfPage: 'YYYYYYYY',   // 160x300 Half Page - replace with your slot ID
};

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
      <div className="sticky top-4 p-2 flex flex-col gap-4">
        {/* Ad slot - 160x600 (Wide Skyscraper) */}
        <AdBanner
          slot={AD_SLOTS.skyscraper}
          format="vertical"
          width={160}
          height={600}
        />

        {/* Secondary smaller ad slot - 160x300 (Half Page) */}
        <AdBanner
          slot={AD_SLOTS.halfPage}
          format="rectangle"
          width={160}
          height={300}
        />
      </div>
    </aside>
  );
};
