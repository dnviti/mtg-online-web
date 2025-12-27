
export interface ValidationResult {
    isValid: boolean;
    errors: string[];
    warnings: string[];
}

export const validateDeck = (deck: any[], sideboard: any[] = [], format: string = 'Standard'): ValidationResult => {
    const errors: string[] = [];
    const warnings: string[] = [];
    const normalizedFormat = format.toLowerCase();

    // Basic Land names for exclusion from copy limits
    const basicLands = ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest', 'Wastes', 'Snow-Covered Plains', 'Snow-Covered Island', 'Snow-Covered Swamp', 'Snow-Covered Mountain', 'Snow-Covered Forest'];

    // Helper to count copies
    const cardCounts: Record<string, number> = {};
    [...deck, ...sideboard].forEach(card => {
        const name = card.name;
        // Skip basic lands
        if (basicLands.includes(name)) return;

        // Check for "Relentless Rats" styled cards that allow any number (simplified check)
        // For now, we'll just check generic copy limits. 
        // Ideally we'd check oracle text or specific list of unlimited cards.
        // 'Seven Dwarves', 'Dragon's Approach', 'Persistent Petitioners', 'Rat Colony', 'Relentless Rats', 'Shadowborn Apostle', 'Slime Against Humanity'
        const unlimitedCards = [
            'Relentless Rats', 'Shadowborn Apostle', 'Persistent Petitioners',
            'Rat Colony', 'Seven Dwarves', "Dragon's Approach", 'Slime Against Humanity'
        ];
        if (unlimitedCards.includes(name)) return;

        cardCounts[name] = (cardCounts[name] || 0) + 1;
    });

    // --- Limited (Draft/Sealed) ---
    if (normalizedFormat.includes('limited') || normalizedFormat.includes('draft') || normalizedFormat.includes('sealed')) {
        if (deck.length < 40) {
            errors.push(`Main deck must have at least 40 cards (currently ${deck.length}).`);
        }
        // Limited has no max copy limit typically (play what you open).
    }

    // --- Commander / EDH / Brawl ---
    else if (normalizedFormat.includes('commander') || normalizedFormat.includes('edh')) {
        const totalCards = deck.length; // Commander usually included in deck array or handled strictly? 
        // In our system, checking if commanders are in 'deck' or separate is key.
        // Assuming 'deck' passed here includes the Commander(s) as they are part of the 100.

        if (totalCards !== 100) {
            errors.push(`Commander decks must have exactly 100 cards (currently ${totalCards}).`);
        }

        // Singleton Rule
        Object.entries(cardCounts).forEach(([name, count]) => {
            if (count > 1) {
                errors.push(`Singleton rule violated: "${name}" has ${count} copies.`);
            }
        });

        // TODO: Color Identity check (complex, requires commander color identity vs card colors)
    }
    else if (normalizedFormat.includes('brawl')) {
        if (normalizedFormat.includes('historic')) {
            if (deck.length !== 100) errors.push(`Historic Brawl decks must have exactly 100 cards (currently ${deck.length}).`);
        } else {
            if (deck.length !== 60) errors.push(`Brawl decks must have exactly 60 cards (currently ${deck.length}).`);
        }

        // Singleton Rule
        Object.entries(cardCounts).forEach(([name, count]) => {
            if (count > 1) {
                errors.push(`Singleton rule violated: "${name}" has ${count} copies.`);
            }
        });
    }

    // --- Constructed (Standard, Modern, Pioneer, Historic, Legacy, Vintage) ---
    else {
        // Default 60 card minimum
        if (deck.length < 60) {
            errors.push(`Main deck must have at least 60 cards (currently ${deck.length}).`);
        }

        // Sideboard max 15
        if (sideboard.length > 15) {
            errors.push(`Sideboard cannot exceed 15 cards (currently ${sideboard.length}).`);
        }

        // 4 Copy Limit
        // Restricted list for Vintage not implemented. Banned list not implemented.
        Object.entries(cardCounts).forEach(([name, count]) => {
            if (count > 4) {
                errors.push(`Cannot have more than 4 copies of "${name}" (has ${count}).`);
            }
        });
    }

    return {
        isValid: errors.length === 0,
        errors,
        warnings
    };
};
