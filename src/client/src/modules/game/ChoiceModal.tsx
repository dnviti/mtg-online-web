import React, { useState, useEffect } from 'react';
import { Check, ChevronUp, ChevronDown, Zap } from 'lucide-react';
import { CardInstance, PendingChoice, ChoiceResult, ChoiceOption } from '../../types/game';
import { CardComponent } from './CardComponent';

interface ChoiceModalProps {
  choice: PendingChoice;
  cards: Record<string, CardInstance>;
  currentPlayerId: string;
  onSubmit: (result: ChoiceResult) => void;
  onCardHover?: (card: CardInstance | null) => void;
}

export const ChoiceModal: React.FC<ChoiceModalProps> = ({
  choice,
  cards,
  currentPlayerId,
  onSubmit,
  onCardHover
}) => {
  const [selectedOptions, setSelectedOptions] = useState<Set<string>>(new Set());
  const [selectedCards, setSelectedCards] = useState<Set<string>>(new Set());
  const [selectedValue, setSelectedValue] = useState<number>(choice.minValue || 0);
  const [orderedCards, setOrderedCards] = useState<string[]>([]);
  const [confirmed, setConfirmed] = useState<boolean | null>(null);
  const [selectedAbilityIndex, setSelectedAbilityIndex] = useState<number | null>(null);

  const isMyChoice = choice.choosingPlayerId === currentPlayerId;

  // Initialize order selection with selectableIds
  useEffect(() => {
    if (choice.type === 'order_selection' && choice.selectableIds) {
      setOrderedCards([...choice.selectableIds]);
    }
  }, [choice.type, choice.selectableIds]);

  const handleSubmit = () => {
    if (!isMyChoice || !isValid()) return;

    const result: ChoiceResult = {
      choiceId: choice.id,
      type: choice.type
    };

    switch (choice.type) {
      case 'mode_selection':
        result.selectedOptionIds = Array.from(selectedOptions);
        break;
      case 'card_selection':
      case 'target_selection':
        result.selectedCardIds = Array.from(selectedCards);
        break;
      case 'yes_no':
        result.confirmed = confirmed ?? false;
        break;
      case 'number_selection':
        result.selectedValue = selectedValue;
        break;
      case 'order_selection':
        result.orderedIds = orderedCards;
        break;
      case 'ability_selection':
        result.selectedAbilityIndex = selectedAbilityIndex ?? 0;
        break;
      case 'player_selection':
        // Handle if needed
        break;
    }

    onSubmit(result);
  };

  const isValid = (): boolean => {
    const constraints = choice.constraints;

    switch (choice.type) {
      case 'mode_selection': {
        const count = selectedOptions.size;
        if (constraints?.exactCount) return count === constraints.exactCount;
        if (constraints?.minCount && count < constraints.minCount) return false;
        if (constraints?.maxCount && count > constraints.maxCount) return false;
        return count > 0;
      }
      case 'card_selection':
      case 'target_selection': {
        const count = selectedCards.size;
        if (constraints?.exactCount) return count === constraints.exactCount;
        if (constraints?.minCount && count < constraints.minCount) return false;
        if (constraints?.maxCount && count > constraints.maxCount) return false;
        // For "up to X" targets, minCount is 0, so allow 0 selections
        if (constraints?.minCount === 0) return true;
        return count > 0;
      }
      case 'yes_no':
        return confirmed !== null;
      case 'number_selection':
        return selectedValue >= (choice.minValue || 0) &&
               selectedValue <= (choice.maxValue || Infinity);
      case 'order_selection':
        return orderedCards.length === (choice.selectableIds?.length || 0);
      case 'ability_selection':
        return selectedAbilityIndex !== null;
      default:
        return true;
    }
  };

  const toggleOption = (optionId: string) => {
    if (!isMyChoice) return;
    const newSet = new Set(selectedOptions);
    if (newSet.has(optionId)) {
      newSet.delete(optionId);
    } else {
      const maxCount = choice.constraints?.maxCount || choice.constraints?.exactCount || 1;
      if (newSet.size < maxCount) {
        newSet.add(optionId);
      }
    }
    setSelectedOptions(newSet);
  };

  const toggleCard = (cardId: string) => {
    if (!isMyChoice) return;
    const newSet = new Set(selectedCards);
    if (newSet.has(cardId)) {
      newSet.delete(cardId);
    } else {
      const maxCount = choice.constraints?.maxCount || choice.constraints?.exactCount || 1;
      if (newSet.size < maxCount) {
        newSet.add(cardId);
      }
    }
    setSelectedCards(newSet);
  };

  const moveInOrder = (cardId: string, direction: 'up' | 'down') => {
    if (!isMyChoice) return;
    const index = orderedCards.indexOf(cardId);
    if (index === -1) return;

    const newOrder = [...orderedCards];
    if (direction === 'up' && index > 0) {
      [newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]];
    } else if (direction === 'down' && index < newOrder.length - 1) {
      [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];
    }
    setOrderedCards(newOrder);
  };

  const getSelectionHint = (): string => {
    const constraints = choice.constraints;
    if (constraints?.exactCount) {
      return `Select exactly ${constraints.exactCount}`;
    }
    if (constraints?.minCount && constraints?.maxCount) {
      return `Select ${constraints.minCount}-${constraints.maxCount}`;
    }
    if (constraints?.minCount) {
      return `Select at least ${constraints.minCount}`;
    }
    if (constraints?.maxCount) {
      return `Select up to ${constraints.maxCount}`;
    }
    return '';
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden mx-4">
        {/* Header */}
        <div className="p-4 border-b border-slate-700 bg-slate-950/50">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-500">
                {choice.sourceCardName}
              </h2>
              <p className="text-sm text-slate-400 mt-1">{choice.prompt}</p>
            </div>
            {!isMyChoice && (
              <div className="px-3 py-1 bg-amber-600/20 border border-amber-500 rounded text-amber-300 text-sm animate-pulse">
                Waiting for opponent...
              </div>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* Mode Selection UI */}
          {choice.type === 'mode_selection' && choice.options && (
            <div className="grid grid-cols-1 gap-3">
              {choice.options.map((opt: ChoiceOption) => (
                <button
                  key={opt.id}
                  onClick={() => toggleOption(opt.id)}
                  disabled={opt.disabled || !isMyChoice}
                  className={`p-4 rounded-lg border-2 text-left transition-all ${
                    selectedOptions.has(opt.id)
                      ? 'border-purple-500 bg-purple-500/20 shadow-[0_0_20px_rgba(168,85,247,0.3)]'
                      : opt.disabled
                        ? 'border-slate-700 bg-slate-800/50 opacity-50 cursor-not-allowed'
                        : 'border-slate-700 bg-slate-800 hover:border-slate-500 hover:bg-slate-750'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all ${
                      selectedOptions.has(opt.id) ? 'border-purple-500 bg-purple-500' : 'border-slate-500'
                    }`}>
                      {selectedOptions.has(opt.id) && <Check size={14} className="text-white" />}
                    </div>
                    <div className="flex-1">
                      <p className="text-white font-medium">{opt.label}</p>
                      {opt.disabledReason && (
                        <p className="text-xs text-red-400 mt-1">{opt.disabledReason}</p>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Card Selection UI */}
          {(choice.type === 'card_selection' || choice.type === 'target_selection') && (
            <>
              {/* Skip option for "you may" effects like blight */}
              {choice.options?.some(o => o.id === 'skip') && (
                <div className="mb-4 flex justify-center">
                  <button
                    onClick={() => {
                      if (!isMyChoice) return;
                      onSubmit({
                        choiceId: choice.id,
                        type: choice.type,
                        selectedOptionIds: ['skip'],
                        selectedCardIds: []
                      });
                    }}
                    disabled={!isMyChoice}
                    className="px-6 py-3 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg font-medium transition-colors border border-slate-600"
                  >
                    Skip (Don't Blight)
                  </button>
                </div>
              )}
              <div className="flex flex-wrap justify-center gap-4">
              {choice.selectableIds?.map(cardId => {
                const card = cards[cardId];
                if (!card) return null;

                const isSelected = selectedCards.has(cardId);

                return (
                  <div
                    key={cardId}
                    onClick={() => toggleCard(cardId)}
                    onMouseEnter={() => onCardHover?.(card)}
                    onMouseLeave={() => onCardHover?.(null)}
                    className={`relative cursor-pointer ${!isMyChoice ? 'pointer-events-none opacity-50' : ''}`}
                  >
                    <CardComponent
                      card={card}
                      viewMode="cutout"
                      onDragStart={() => {}}
                      onClick={() => toggleCard(cardId)}
                      className={isSelected
                        ? 'ring-4 ring-purple-500 shadow-[0_0_30px_rgba(168,85,247,0.5)]'
                        : 'ring-2 ring-slate-500'
                      }
                    />
                    {isSelected && (
                      <div className="absolute top-2 right-2 w-8 h-8 bg-purple-500 rounded-full flex items-center justify-center shadow-lg z-20">
                        <Check size={20} className="text-white" />
                      </div>
                    )}
                  </div>
                );
              })}
              </div>
            </>
          )}

          {/* Yes/No UI */}
          {choice.type === 'yes_no' && (
            <div className="flex justify-center gap-8 py-8">
              <button
                onClick={() => isMyChoice && setConfirmed(true)}
                disabled={!isMyChoice}
                className={`px-12 py-6 rounded-xl font-bold text-xl transition-all ${
                  confirmed === true
                    ? 'bg-emerald-600 text-white shadow-[0_0_30px_rgba(16,185,129,0.4)]'
                    : 'bg-slate-800 text-slate-300 border border-slate-600 hover:bg-emerald-600/20 hover:border-emerald-500'
                }`}
              >
                Yes
              </button>
              <button
                onClick={() => isMyChoice && setConfirmed(false)}
                disabled={!isMyChoice}
                className={`px-12 py-6 rounded-xl font-bold text-xl transition-all ${
                  confirmed === false
                    ? 'bg-red-600 text-white shadow-[0_0_30px_rgba(239,68,68,0.4)]'
                    : 'bg-slate-800 text-slate-300 border border-slate-600 hover:bg-red-600/20 hover:border-red-500'
                }`}
              >
                No
              </button>
            </div>
          )}

          {/* Number Selection UI */}
          {choice.type === 'number_selection' && (
            <div className="flex flex-col items-center py-8 gap-4">
              <div className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-500">
                {selectedValue}
              </div>
              <div className="flex gap-4">
                <button
                  onClick={() => setSelectedValue(Math.max(choice.minValue || 0, selectedValue - 1))}
                  disabled={selectedValue <= (choice.minValue || 0) || !isMyChoice}
                  className="w-14 h-14 bg-slate-800 hover:bg-slate-700 rounded-lg flex items-center justify-center text-3xl font-bold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  -
                </button>
                <button
                  onClick={() => setSelectedValue(Math.min(choice.maxValue || 99, selectedValue + 1))}
                  disabled={selectedValue >= (choice.maxValue || 99) || !isMyChoice}
                  className="w-14 h-14 bg-slate-800 hover:bg-slate-700 rounded-lg flex items-center justify-center text-3xl font-bold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  +
                </button>
              </div>
              <div className="text-sm text-slate-400">
                Range: {choice.minValue || 0} - {choice.maxValue || '...'}
              </div>
            </div>
          )}

          {/* Order Selection UI */}
          {choice.type === 'order_selection' && (
            <div className="space-y-2">
              <p className="text-sm text-slate-400 mb-4 text-center">
                Use arrows to reorder. Top of list = top of library.
              </p>
              {orderedCards.map((cardId, index) => {
                const card = cards[cardId];
                if (!card) return null;

                return (
                  <div key={cardId} className="flex items-center gap-3 bg-slate-800 p-2 rounded-lg">
                    <div className="flex flex-col gap-1">
                      <button
                        onClick={() => moveInOrder(cardId, 'up')}
                        disabled={index === 0 || !isMyChoice}
                        className="w-8 h-8 bg-slate-700 hover:bg-slate-600 rounded disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center"
                      >
                        <ChevronUp size={18} />
                      </button>
                      <button
                        onClick={() => moveInOrder(cardId, 'down')}
                        disabled={index === orderedCards.length - 1 || !isMyChoice}
                        className="w-8 h-8 bg-slate-700 hover:bg-slate-600 rounded disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center"
                      >
                        <ChevronDown size={18} />
                      </button>
                    </div>
                    <div className="w-10 text-center text-slate-500 font-mono text-lg">{index + 1}</div>
                    <img
                      src={card.imageUrl}
                      alt={card.name}
                      className="w-20 h-14 object-cover rounded"
                    />
                    <span className="text-white font-medium flex-1">{card.name}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Ability Selection UI */}
          {choice.type === 'ability_selection' && choice.options && (
            <div className="grid grid-cols-1 gap-3">
              <p className="text-sm text-slate-400 mb-2 text-center">
                Choose an ability to activate:
              </p>
              {choice.options.map((opt: ChoiceOption, index: number) => (
                <button
                  key={opt.id}
                  onClick={() => !opt.disabled && isMyChoice && setSelectedAbilityIndex(index)}
                  disabled={opt.disabled || !isMyChoice}
                  className={`p-4 rounded-lg border-2 text-left transition-all ${
                    selectedAbilityIndex === index
                      ? 'border-amber-500 bg-amber-500/20 shadow-[0_0_20px_rgba(245,158,11,0.3)]'
                      : opt.disabled
                        ? 'border-slate-700 bg-slate-800/50 opacity-50 cursor-not-allowed'
                        : 'border-slate-700 bg-slate-800 hover:border-amber-500/50 hover:bg-slate-750'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-8 h-8 rounded-lg border-2 flex items-center justify-center shrink-0 transition-all ${
                      selectedAbilityIndex === index ? 'border-amber-500 bg-amber-500' : 'border-slate-500 bg-slate-700'
                    }`}>
                      <Zap size={16} className={selectedAbilityIndex === index ? 'text-white' : 'text-slate-400'} />
                    </div>
                    <div className="flex-1">
                      <p className="text-white font-medium text-sm leading-relaxed">{opt.label}</p>
                      {opt.description && opt.description !== opt.label && (
                        <p className="text-xs text-slate-400 mt-1">{opt.description}</p>
                      )}
                      {opt.disabledReason && (
                        <p className="text-xs text-red-400 mt-1">{opt.disabledReason}</p>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-700 bg-slate-950/50 flex justify-between items-center gap-4">
          <div className="text-sm text-slate-400">
            {choice.type !== 'yes_no' && getSelectionHint()}
          </div>
          <button
            onClick={handleSubmit}
            disabled={!isValid() || !isMyChoice}
            className={`px-8 py-3 rounded-lg font-bold transition-all ${
              isValid() && isMyChoice
                ? 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white shadow-lg hover:shadow-[0_0_20px_rgba(168,85,247,0.4)]'
                : 'bg-slate-800 text-slate-500 cursor-not-allowed'
            }`}
          >
            Confirm Choice
          </button>
        </div>
      </div>
    </div>
  );
};
