import React, { useMemo } from 'react';
import { DraftCard } from '../services/PackGeneratorService';
import { FoilOverlay, CardHoverWrapper } from './CardPreview';
import { useCardTouch } from '../utils/interaction';


type GroupMode = 'type' | 'color' | 'cmc' | 'rarity';

interface StackViewProps {
  cards: DraftCard[];
  cardWidth?: number;
  onCardClick?: (card: DraftCard) => void;
  onHover?: (card: DraftCard | null) => void;
  disableHoverPreview?: boolean;
  groupBy?: GroupMode;
  renderWrapper?: (card: DraftCard, children: React.ReactNode) => React.ReactNode;
  useArtCrop?: boolean;
}

const GROUPS: Record<GroupMode, string[]> = {
  type: ['Creature', 'Planeswalker', 'Instant', 'Sorcery', 'Enchantment', 'Artifact', 'Battle', 'Land', 'Other'],
  color: ['White', 'Blue', 'Black', 'Red', 'Green', 'Multicolor', 'Colorless'],
  cmc: ['0', '1', '2', '3', '4', '5', '6', '7+'],
  rarity: ['Mythic', 'Rare', 'Uncommon', 'Common']
};

const getCardGroup = (card: DraftCard, mode: GroupMode): string => {
  if (mode === 'type') {
    const typeLine = card.typeLine || '';
    if (typeLine.includes('Creature')) return 'Creature';
    if (typeLine.includes('Planeswalker')) return 'Planeswalker';
    if (typeLine.includes('Instant')) return 'Instant';
    if (typeLine.includes('Sorcery')) return 'Sorcery';
    if (typeLine.includes('Enchantment')) return 'Enchantment';
    if (typeLine.includes('Artifact')) return 'Artifact';
    if (typeLine.includes('Battle')) return 'Battle';
    if (typeLine.includes('Land')) return 'Land';
    return 'Other';
  }

  if (mode === 'color') {
    const colors = card.colors || [];
    if (colors.length > 1) return 'Multicolor';
    if (colors.length === 0) {
      // Check if land
      if ((card.typeLine || '').includes('Land')) return 'Colorless';
      // Artifacts etc
      return 'Colorless';
    }
    if (colors[0] === 'W') return 'White';
    if (colors[0] === 'U') return 'Blue';
    if (colors[0] === 'B') return 'Black';
    if (colors[0] === 'R') return 'Red';
    if (colors[0] === 'G') return 'Green';
    return 'Colorless';
  }

  if (mode === 'cmc') {
    const cmc = Math.floor(card.cmc || 0);
    if (cmc >= 7) return '7+';
    return cmc.toString();
  }

  if (mode === 'rarity') {
    const r = (card.rarity || 'common').toLowerCase();
    if (r === 'mythic') return 'Mythic';
    if (r === 'rare') return 'Rare';
    if (r === 'uncommon') return 'Uncommon';
    return 'Common';
  }

  return 'Other';
};


export const StackView: React.FC<StackViewProps> = ({ cards, cardWidth = 150, onCardClick, onHover, disableHoverPreview = false, groupBy = 'color', renderWrapper, useArtCrop: forceArtCrop }) => {

  const categorizedCards = useMemo(() => {
    const categories: Record<string, DraftCard[]> = {};
    const groupKeys = GROUPS[groupBy];
    groupKeys.forEach(k => categories[k] = []);

    cards.forEach(card => {
      const group = getCardGroup(card, groupBy);
      if (categories[group]) {
        categories[group].push(card);
      } else {
        // Fallback for unexpected (shouldn't happen with defined logic coverage)
        if (!categories['Other']) categories['Other'] = [];
        categories['Other'].push(card);
      }
    });

    // Sort cards within categories by CMC (low to high)
    // Secondary sort by Name
    Object.keys(categories).forEach(key => {
      categories[key].sort((a, b) => {
        const cmcA = a.cmc || 0;
        const cmcB = b.cmc || 0;
        if (cmcA !== cmcB) return cmcA - cmcB;
        return a.name.localeCompare(b.name);
      });
    });

    return categories;
  }, [cards, groupBy]);

  const activeGroups = GROUPS[groupBy];

  return (
    <div className="inline-flex flex-row gap-4 pb-8 items-start min-w-full">
      {activeGroups.map(category => {
        const catCards = categorizedCards[category];
        if (catCards.length === 0) return null;

        return (
          <div key={category} className="flex-shrink-0 snap-start flex flex-col" style={{ width: cardWidth }}>
            {/* Header */}
            <div className="flex justify-between items-center mb-2 px-1 border-b border-slate-700 pb-1 shrink-0 bg-slate-900/80 backdrop-blur z-10 sticky top-0">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{category}</span>
              <span className="text-xs font-mono text-slate-500">{catCards.length}</span>
            </div>

            {/* Stack */}
            <div className="flex flex-col relative px-2 pb-32">
              {catCards.map((card, index) => {
                // Margin calculation: Negative margin to pull up next cards. 
                // To show a "strip" of say 35px at the top of each card.
                const isLast = index === catCards.length - 1;
                // Use prop if provided, otherwise fallback to width check (legacy/default behavior)
                const shouldCrop = forceArtCrop !== undefined ? forceArtCrop : (cardWidth < 100);
                const useArtCrop = shouldCrop && !!card.imageArtCrop;
                const displayImage = useArtCrop ? card.imageArtCrop : card.image;

                return (
                  <StackCardItem
                    key={card.id}
                    card={card}
                    cardWidth={cardWidth}
                    isLast={isLast}
                    useArtCrop={useArtCrop}
                    displayImage={displayImage}
                    onHover={onHover}
                    onCardClick={onCardClick}
                    disableHoverPreview={disableHoverPreview}
                    renderWrapper={renderWrapper}
                  />
                );
              })}
            </div>
          </div>
        )
      })}
    </div>
  );
};

const StackCardItem = ({ card, isLast, useArtCrop, displayImage, onHover, onCardClick, disableHoverPreview, renderWrapper }: any) => {
  const { onTouchStart, onTouchEnd, onTouchMove, onClick } = useCardTouch(onHover || (() => { }), () => onCardClick && onCardClick(card), card);

  const content = (
    <div
      className="relative w-full z-0 hover:z-50 transition-all duration-200 group"
      onMouseEnter={() => onHover && onHover(card)}
      onMouseLeave={() => onHover && onHover(null)}
      onClick={onClick}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onTouchMove={onTouchMove}
    >
      <CardHoverWrapper card={card} preventPreview={disableHoverPreview || (useArtCrop === false)}>
        <div
          className={`relative w-full rounded-lg bg-slate-800 shadow-md border border-slate-950 overflow-hidden cursor-pointer group-hover:ring-2 group-hover:ring-purple-400`}
          style={{
            marginBottom: isLast ? '0' : (useArtCrop ? '-85%' : '-125%'),
            aspectRatio: useArtCrop ? '1/1' : '2.5/3.5'
          }}
        >
          <img src={displayImage} alt={card.name} className="w-full h-full object-cover" />
          {card.finish === 'foil' && <FoilOverlay />}
        </div>
      </CardHoverWrapper>
    </div>
  );

  if (renderWrapper) {
    return renderWrapper(card, content);
  }

  return content;
};
