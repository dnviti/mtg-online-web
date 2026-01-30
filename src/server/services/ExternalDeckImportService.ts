/**
 * ExternalDeckImportService
 * Handles deck imports from external platforms: Archidekt, Moxfield
 * Also handles text-based imports (MTGO/Arena format)
 */

export interface ImportedCard {
    name: string;
    quantity: number;
    section?: 'mainboard' | 'sideboard' | 'commander' | 'companion' | 'maybeboard';
    scryfallId?: string;
}

export interface ImportedDeck {
    name: string;
    format: string;
    cards: ImportedCard[];
    commanders?: ImportedCard[];
    sideboard?: ImportedCard[];
    description?: string;
    source: 'archidekt' | 'moxfield' | 'text' | 'unknown';
    originalUrl?: string;
}

export interface ParsedUrl {
    source: 'archidekt' | 'moxfield' | 'unknown';
    deckId: string | null;
}

// Rate limiting - track last request time per API
let lastArchidektRequest = 0;
let lastMoxfieldRequest = 0;
const MIN_REQUEST_INTERVAL = 200; // 200ms between requests

async function waitForRateLimit(lastRequest: number): Promise<void> {
    const elapsed = Date.now() - lastRequest;
    if (elapsed < MIN_REQUEST_INTERVAL) {
        await new Promise(resolve => setTimeout(resolve, MIN_REQUEST_INTERVAL - elapsed));
    }
}

export class ExternalDeckImportService {

    /**
     * Parse a deck URL to determine source and deck ID
     */
    parseDeckUrl(url: string): ParsedUrl {
        try {
            const urlObj = new URL(url);

            // Archidekt: https://archidekt.com/decks/12345/deck-name
            if (urlObj.hostname === 'archidekt.com' || urlObj.hostname === 'www.archidekt.com') {
                const match = urlObj.pathname.match(/\/decks\/(\d+)/);
                if (match) {
                    return { source: 'archidekt', deckId: match[1] };
                }
            }

            // Moxfield: https://www.moxfield.com/decks/AbCdEfGhI or https://moxfield.com/decks/AbCdEfGhI
            if (urlObj.hostname === 'moxfield.com' || urlObj.hostname === 'www.moxfield.com') {
                const match = urlObj.pathname.match(/\/decks\/([A-Za-z0-9_-]+)/);
                if (match) {
                    return { source: 'moxfield', deckId: match[1] };
                }
            }

            return { source: 'unknown', deckId: null };
        } catch {
            return { source: 'unknown', deckId: null };
        }
    }

    /**
     * Import deck from URL (auto-detect platform)
     */
    async importFromUrl(url: string): Promise<ImportedDeck> {
        const parsed = this.parseDeckUrl(url);

        if (parsed.source === 'unknown' || !parsed.deckId) {
            throw new Error('URL non riconosciuta. Supportati: Archidekt, Moxfield');
        }

        if (parsed.source === 'archidekt') {
            return this.importFromArchidekt(parsed.deckId, url);
        }

        if (parsed.source === 'moxfield') {
            return this.importFromMoxfield(parsed.deckId, url);
        }

        throw new Error('Piattaforma non supportata');
    }

    /**
     * Import deck from Archidekt by deck ID
     * API: https://archidekt.com/api/decks/{deckId}/
     */
    async importFromArchidekt(deckId: string, originalUrl?: string): Promise<ImportedDeck> {
        await waitForRateLimit(lastArchidektRequest);
        lastArchidektRequest = Date.now();

        const apiUrl = `https://archidekt.com/api/decks/${deckId}/`;

        const response = await fetch(apiUrl, {
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'MTGate/1.0 (Deck Import)'
            }
        });

        if (!response.ok) {
            if (response.status === 404) {
                throw new Error('Mazzo non trovato su Archidekt. Verifica che sia pubblico.');
            }
            throw new Error(`Errore Archidekt API: ${response.status}`);
        }

        const data = await response.json();

        // Parse Archidekt response
        const cards: ImportedCard[] = [];
        const commanders: ImportedCard[] = [];
        const sideboard: ImportedCard[] = [];

        if (data.cards && Array.isArray(data.cards)) {
            for (const cardEntry of data.cards) {
                const cardName = cardEntry.card?.oracleCard?.name || cardEntry.card?.name;
                const quantity = cardEntry.quantity || 1;
                const categories = cardEntry.categories || [];

                if (!cardName) continue;

                const importedCard: ImportedCard = {
                    name: cardName,
                    quantity
                };

                // Check if commander
                if (categories.includes('Commander')) {
                    importedCard.section = 'commander';
                    commanders.push(importedCard);
                } else if (categories.includes('Sideboard')) {
                    importedCard.section = 'sideboard';
                    sideboard.push(importedCard);
                } else if (categories.includes('Companion')) {
                    importedCard.section = 'companion';
                    sideboard.push(importedCard);
                } else if (categories.includes('Maybeboard')) {
                    importedCard.section = 'maybeboard';
                    // Skip maybeboard cards
                } else {
                    importedCard.section = 'mainboard';
                    cards.push(importedCard);
                }
            }
        }

        // Map Archidekt format names to our format names
        const formatMap: Record<string, string> = {
            'commander': 'Commander',
            'edh': 'Commander',
            'standard': 'Standard',
            'modern': 'Modern',
            'pioneer': 'Pioneer',
            'legacy': 'Legacy',
            'vintage': 'Vintage',
            'pauper': 'Pauper',
            'historic': 'Historic',
            'brawl': 'Brawl',
            'premodern': 'Premodern',
            'oathbreaker': 'Oathbreaker',
            'duel': 'Duel Commander',
            'penny': 'Penny Dreadful',
            'limited': 'Limited',
            'draft': 'Limited',
            'sealed': 'Limited'
        };

        const rawFormat = (data.format || '').toLowerCase();
        const format = formatMap[rawFormat] || 'Standard';

        return {
            name: data.name || 'Imported Deck',
            format,
            cards,
            commanders: commanders.length > 0 ? commanders : undefined,
            sideboard: sideboard.length > 0 ? sideboard : undefined,
            description: data.description,
            source: 'archidekt',
            originalUrl: originalUrl || `https://archidekt.com/decks/${deckId}`
        };
    }

    /**
     * Import deck from Moxfield by deck ID
     * API: https://api2.moxfield.com/v3/decks/all/{publicId}
     */
    async importFromMoxfield(deckId: string, originalUrl?: string): Promise<ImportedDeck> {
        await waitForRateLimit(lastMoxfieldRequest);
        lastMoxfieldRequest = Date.now();

        // Moxfield uses api2.moxfield.com for their v3 API
        const apiUrl = `https://api2.moxfield.com/v3/decks/all/${deckId}`;

        const response = await fetch(apiUrl, {
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'MTGate/1.0 (Deck Import)'
            }
        });

        if (!response.ok) {
            if (response.status === 404) {
                throw new Error('Mazzo non trovato su Moxfield. Verifica che sia pubblico.');
            }
            if (response.status === 403) {
                throw new Error('Accesso negato. Il mazzo potrebbe essere privato.');
            }
            throw new Error(`Errore Moxfield API: ${response.status}`);
        }

        const data = await response.json();

        const cards: ImportedCard[] = [];
        const commanders: ImportedCard[] = [];
        const sideboard: ImportedCard[] = [];

        // Parse mainboard
        if (data.mainboard) {
            for (const [cardName, cardData] of Object.entries(data.mainboard as Record<string, any>)) {
                cards.push({
                    name: cardData.card?.name || cardName,
                    quantity: cardData.quantity || 1,
                    section: 'mainboard',
                    scryfallId: cardData.card?.scryfall_id
                });
            }
        }

        // Parse commanders
        if (data.commanders) {
            for (const [cardName, cardData] of Object.entries(data.commanders as Record<string, any>)) {
                commanders.push({
                    name: cardData.card?.name || cardName,
                    quantity: cardData.quantity || 1,
                    section: 'commander',
                    scryfallId: cardData.card?.scryfall_id
                });
            }
        }

        // Parse sideboard
        if (data.sideboard) {
            for (const [cardName, cardData] of Object.entries(data.sideboard as Record<string, any>)) {
                sideboard.push({
                    name: cardData.card?.name || cardName,
                    quantity: cardData.quantity || 1,
                    section: 'sideboard',
                    scryfallId: cardData.card?.scryfall_id
                });
            }
        }

        // Parse companions
        if (data.companions) {
            for (const [cardName, cardData] of Object.entries(data.companions as Record<string, any>)) {
                sideboard.push({
                    name: cardData.card?.name || cardName,
                    quantity: cardData.quantity || 1,
                    section: 'companion',
                    scryfallId: cardData.card?.scryfall_id
                });
            }
        }

        // Map Moxfield format names
        const formatMap: Record<string, string> = {
            'commander': 'Commander',
            'standard': 'Standard',
            'modern': 'Modern',
            'pioneer': 'Pioneer',
            'legacy': 'Legacy',
            'vintage': 'Vintage',
            'pauper': 'Pauper',
            'historic': 'Historic',
            'brawl': 'Brawl',
            'premodern': 'Premodern',
            'oathbreaker': 'Oathbreaker',
            'duel': 'Duel Commander',
            'penny': 'Penny Dreadful',
            'limited': 'Limited'
        };

        const rawFormat = (data.format || '').toLowerCase();
        const format = formatMap[rawFormat] || 'Standard';

        return {
            name: data.name || 'Imported Deck',
            format,
            cards,
            commanders: commanders.length > 0 ? commanders : undefined,
            sideboard: sideboard.length > 0 ? sideboard : undefined,
            description: data.description,
            source: 'moxfield',
            originalUrl: originalUrl || `https://www.moxfield.com/decks/${deckId}`
        };
    }

    /**
     * Import deck from text (MTGO/Arena format)
     * Supports formats:
     * - "4 Lightning Bolt"
     * - "4x Lightning Bolt"
     * - "Lightning Bolt"
     * - Section headers: "Commander:", "Sideboard:", "Companion:"
     */
    importFromText(text: string, deckName: string = 'Imported Deck', format: string = 'Standard'): ImportedDeck {
        const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);

        const cards: ImportedCard[] = [];
        const commanders: ImportedCard[] = [];
        const sideboard: ImportedCard[] = [];

        let currentSection: 'mainboard' | 'sideboard' | 'commander' | 'companion' = 'mainboard';

        for (const line of lines) {
            // Check for section headers
            const lowerLine = line.toLowerCase();
            if (lowerLine.startsWith('commander') || lowerLine.startsWith('// commander')) {
                currentSection = 'commander';
                continue;
            }
            if (lowerLine.startsWith('sideboard') || lowerLine.startsWith('// sideboard')) {
                currentSection = 'sideboard';
                continue;
            }
            if (lowerLine.startsWith('companion') || lowerLine.startsWith('// companion')) {
                currentSection = 'companion';
                continue;
            }
            if (lowerLine.startsWith('mainboard') || lowerLine.startsWith('// mainboard') || lowerLine.startsWith('deck') || lowerLine.startsWith('// deck')) {
                currentSection = 'mainboard';
                continue;
            }
            if (lowerLine.startsWith('maybeboard') || lowerLine.startsWith('// maybeboard')) {
                // Skip maybeboard cards
                continue;
            }

            // Skip comment lines
            if (line.startsWith('//') || line.startsWith('#')) {
                continue;
            }

            // Parse card line: "4 Lightning Bolt" or "4x Lightning Bolt" or "Lightning Bolt"
            const match = line.match(/^(\d+)x?\s+(.+?)(?:\s*\(.+?\))?(?:\s*\[.+?\])?(?:\s*\*.+)?$/i);

            let quantity = 1;
            let cardName = line;

            if (match) {
                quantity = parseInt(match[1], 10);
                cardName = match[2].trim();
            } else {
                // Try just getting the card name (no quantity specified)
                cardName = line.replace(/\s*\(.+?\)\s*/g, '').replace(/\s*\[.+?\]\s*/g, '').trim();
            }

            // Clean up card name - remove set codes, collector numbers, etc.
            cardName = cardName
                .replace(/\s*\(\w+\)\s*\d*$/i, '') // Remove (SET) 123
                .replace(/\s*#\d+$/i, '')          // Remove #123
                .replace(/\s*\*F\*$/i, '')         // Remove *F* (foil marker)
                .trim();

            if (!cardName || cardName.length === 0) continue;

            const importedCard: ImportedCard = {
                name: cardName,
                quantity,
                section: currentSection
            };

            if (currentSection === 'commander') {
                commanders.push(importedCard);
            } else if (currentSection === 'sideboard' || currentSection === 'companion') {
                sideboard.push(importedCard);
            } else {
                cards.push(importedCard);
            }
        }

        // Auto-detect format based on deck composition
        let detectedFormat = format;
        if (commanders.length > 0 && cards.length + commanders.length >= 99) {
            detectedFormat = 'Commander';
        }

        return {
            name: deckName,
            format: detectedFormat,
            cards,
            commanders: commanders.length > 0 ? commanders : undefined,
            sideboard: sideboard.length > 0 ? sideboard : undefined,
            source: 'text'
        };
    }
}

// Export singleton instance
export const externalDeckImportService = new ExternalDeckImportService();
