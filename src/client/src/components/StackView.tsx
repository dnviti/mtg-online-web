import React, { useMemo } from 'react';
import { DraftCard } from '../services/PackGeneratorService';
import { CardHoverWrapper, FoilOverlay } from './CardPreview';

interface StackViewProps {
  cards: DraftCard[];
  cardWidth?: number;
}

const CATEGORY_ORDER = [
  'Creature',
  'Planeswalker',
  'Instant',
  'Sorcery',
  'Enchantment',
  'Artifact',
  'Land',
  'Battle',
  'Other'
];

export const StackView: React.FC<StackViewProps> = ({ cards, cardWidth = 150 }) => {

  const categorizedCards = useMemo(() => {
    const categories: Record<string, DraftCard[]> = {};
    CATEGORY_ORDER.forEach(c => categories[c] = []);

    cards.forEach(card => {
      let category = 'Other';
      const typeLine = card.typeLine || '';

      if (typeLine.includes('Creature')) category = 'Creature'; // Includes Artifact Creature, Ench Creature
      else if (typeLine.includes('Planeswalker')) category = 'Planeswalker';
      else if (typeLine.includes('Instant')) category = 'Instant';
      else if (typeLine.includes('Sorcery')) category = 'Sorcery';
      else if (typeLine.includes('Enchantment')) category = 'Enchantment';
      else if (typeLine.includes('Artifact')) category = 'Artifact';
      else if (typeLine.includes('Battle')) category = 'Battle';
      else if (typeLine.includes('Land')) category = 'Land';

      // Special handling: Commander? usually Creature or Planeswalker
      // Ensure it lands in one of the predefined bins

      categories[category].push(card);
    });

    // Sort cards within categories by CMC (low to high)? Or Rarity?
    // Archidekt usually sorts by CMC.
    Object.keys(categories).forEach(key => {
      categories[key].sort((a, b) => (a.cmc || 0) - (b.cmc || 0));
    });

    return categories;
  }, [cards]);

  return (
    <div className="flex flex-row gap-2 overflow-x-auto pb-8 snap-x">
      {CATEGORY_ORDER.map(category => {
        const catCards = categorizedCards[category];
        if (catCards.length === 0) return null;

        return (
          <div key={category} className="flex-shrink-0 snap-start" style={{ width: cardWidth }}>
            {/* Header */}
            <div className="flex justify-between items-center mb-2 px-1 border-b border-slate-700 pb-1">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{category}</span>
              <span className="text-xs font-mono text-slate-500">{catCards.length}</span>
            </div>

            {/* Stack */}
            <div className="flex flex-col relative px-2">
              {catCards.map((card, index) => {
                // Margin calculation: Negative margin to pull up next cards. 
                // To show a "strip" of say 35px at the top of each card.
                const isLast = index === catCards.length - 1;
                const useArtCrop = cardWidth < 170 && !!card.imageArtCrop;
                const displayImage = useArtCrop ? card.imageArtCrop : card.image;

                return (
                  <CardHoverWrapper key={card.id} card={card} className="relative w-full z-0 hover:z-50 transition-all duration-200" preventPreview={cardWidth >= 200}>
                    <div
                      className={`relative w-full rounded-lg bg-slate-800 shadow-md border border-slate-950 overflow-hidden cursor-pointer group`}
                      style={{
                        // Aspect ratio is maintained by image or div dimensions
                        // With overlap, we just render them one after another with negative margin
                        marginBottom: isLast ? '0' : '-125%', // Negative margin to show header
                        aspectRatio: '2.5/3.5'
                      }}
                    >
                      <img src={displayImage} alt={card.name} className="w-full h-full object-cover" />
                      {/* Optional: Shine effect for foils if visible? */}
                      {card.finish === 'foil' && <FoilOverlay />}
                    </div>
                  </CardHoverWrapper>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  );
};
