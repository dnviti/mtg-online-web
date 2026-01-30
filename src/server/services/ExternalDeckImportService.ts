/**
 * ExternalDeckImportService
 * Handles deck imports from external platforms: Archidekt, Moxfield
 * Also handles text-based imports (MTGO/Arena format)
 */

import { scryfallService, cardService } from '../singletons';

export interface ImportedCard {
    name: string;
    quantity: number;
    section?: 'mainboard' | 'sideboard' | 'commander' | 'companion' | 'maybeboard';
    scryfallId?: string;
    setCode?: string;
    collectorNumber?: string;
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
     * @param url - The deck URL (Archidekt or Moxfield)
     * @param formatOverride - Optional format to override the detected one
     */
    async importFromUrl(url: string, formatOverride?: string): Promise<ImportedDeck> {
        const parsed = this.parseDeckUrl(url);

        if (parsed.source === 'unknown' || !parsed.deckId) {
            throw new Error('URL non riconosciuta. Supportati: Archidekt, Moxfield');
        }

        let deck: ImportedDeck;

        if (parsed.source === 'archidekt') {
            deck = await this.importFromArchidekt(parsed.deckId, url);
        } else if (parsed.source === 'moxfield') {
            deck = await this.importFromMoxfield(parsed.deckId, url);
        } else {
            throw new Error('Piattaforma non supportata');
        }

        // Apply format override if provided
        if (formatOverride && formatOverride.trim()) {
            deck.format = formatOverride;
        }

        return deck;
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

                // Extract Scryfall identifiers from Archidekt
                // Archidekt provides: card.uid (scryfall_id), card.edition.editioncode (set), card.collectorNumber
                const scryfallId = cardEntry.card?.uid || cardEntry.card?.scryfall_id;
                const setCode = cardEntry.card?.edition?.editioncode || cardEntry.card?.set;
                const collectorNumber = cardEntry.card?.collectorNumber || cardEntry.card?.collector_number;

                const importedCard: ImportedCard = {
                    name: cardName,
                    quantity,
                    scryfallId,
                    setCode,
                    collectorNumber
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
                    scryfallId: cardData.card?.scryfall_id,
                    setCode: cardData.card?.set,
                    collectorNumber: cardData.card?.cn || cardData.card?.collector_number
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
                    scryfallId: cardData.card?.scryfall_id,
                    setCode: cardData.card?.set,
                    collectorNumber: cardData.card?.cn || cardData.card?.collector_number
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
                    scryfallId: cardData.card?.scryfall_id,
                    setCode: cardData.card?.set,
                    collectorNumber: cardData.card?.cn || cardData.card?.collector_number
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
                    scryfallId: cardData.card?.scryfall_id,
                    setCode: cardData.card?.set,
                    collectorNumber: cardData.card?.cn || cardData.card?.collector_number
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

    /**
     * Resolve imported cards to full Scryfall card objects
     * Uses scryfallId if available, otherwise falls back to name + setCode
     * @param importedCards - Array of imported cards with optional identifiers
     * @returns Array of full Scryfall card objects with quantities
     */
    async resolveCardsToScryfall(importedCards: ImportedCard[]): Promise<any[]> {
        if (!importedCards || importedCards.length === 0) return [];

        // Build identifiers for Scryfall collection API
        // Priority: scryfallId > name+set > name only
        const identifiers: { id?: string; name?: string; set?: string }[] = [];
        const cardInfoMap = new Map<string, ImportedCard>(); // Map to preserve quantity and section

        for (const card of importedCards) {
            let identifier: { id?: string; name?: string; set?: string };
            let key: string;

            if (card.scryfallId) {
                // Best case: we have the exact Scryfall ID
                identifier = { id: card.scryfallId };
                key = card.scryfallId;
            } else if (card.setCode && card.name) {
                // Second best: name + set code
                identifier = { name: card.name, set: card.setCode.toLowerCase() };
                key = `${card.name.toLowerCase()}|${card.setCode.toLowerCase()}`;
            } else {
                // Fallback: just the name
                identifier = { name: card.name };
                key = card.name.toLowerCase();
            }

            // Only add unique identifiers (we'll expand by quantity later)
            if (!cardInfoMap.has(key)) {
                identifiers.push(identifier);
                cardInfoMap.set(key, card);
            }
        }

        // Fetch cards from Scryfall
        let scryfallCards: any[] = [];
        try {
            scryfallCards = await scryfallService.fetchCollection(identifiers);

            // Cache images for the fetched cards
            if (scryfallCards.length > 0) {
                // Debug: Check if cards have image_uris
                const withImages = scryfallCards.filter(c => c.image_uris?.normal || c.card_faces?.[0]?.image_uris?.normal);
                const withoutImages = scryfallCards.filter(c => !c.image_uris?.normal && !c.card_faces?.[0]?.image_uris?.normal);

                console.log(`[ExternalDeckImportService] Caching images for ${scryfallCards.length} imported cards...`);
                console.log(`[ExternalDeckImportService] Cards with image_uris: ${withImages.length}, without: ${withoutImages.length}`);

                if (withoutImages.length > 0) {
                    console.log(`[ExternalDeckImportService] Sample card without images:`, JSON.stringify(withoutImages[0], null, 2).substring(0, 500));
                }

                const downloadedCount = await cardService.cacheImages(scryfallCards);
                console.log(`[ExternalDeckImportService] Downloaded ${downloadedCount} new images`);
            }
        } catch (e: any) {
            console.error('[ExternalDeckImportService] Failed to fetch cards from Scryfall:', e.message);
        }

        // Build result array with quantities expanded
        const results: any[] = [];
        const scryfallMap = new Map<string, any>();

        // Index Scryfall cards by multiple keys for matching
        for (const card of scryfallCards) {
            scryfallMap.set(card.id, card);
            if (card.name) {
                scryfallMap.set(card.name.toLowerCase(), card);
                if (card.set) {
                    scryfallMap.set(`${card.name.toLowerCase()}|${card.set.toLowerCase()}`, card);
                }
            }
        }

        // Match imported cards to Scryfall cards and expand by quantity
        for (const importedCard of importedCards) {
            let scryfallCard: any = null;

            // Try to find by scryfallId first
            if (importedCard.scryfallId) {
                scryfallCard = scryfallMap.get(importedCard.scryfallId);
            }

            // Try by name + set
            if (!scryfallCard && importedCard.setCode && importedCard.name) {
                scryfallCard = scryfallMap.get(`${importedCard.name.toLowerCase()}|${importedCard.setCode.toLowerCase()}`);
            }

            // Fallback to name only
            if (!scryfallCard && importedCard.name) {
                scryfallCard = scryfallMap.get(importedCard.name.toLowerCase());
            }

            if (scryfallCard) {
                // Expand by quantity and preserve section info
                for (let i = 0; i < importedCard.quantity; i++) {
                    results.push({
                        ...scryfallCard,
                        _importSection: importedCard.section // Preserve section for commander/sideboard handling
                    });
                }
            } else {
                console.warn(`[ExternalDeckImportService] Card not found in Scryfall: ${importedCard.name}`);
            }
        }

        return results;
    }

    /**
     * Import and resolve a full deck with all card metadata from Scryfall
     * @param url - The deck URL (Archidekt or Moxfield)
     * @param formatOverride - Optional format to override the detected one
     * @returns ImportedDeck with resolvedCards containing full Scryfall data
     */
    async importFromUrlWithFullData(url: string, formatOverride?: string): Promise<ImportedDeck & { resolvedCards?: any[] }> {
        // First, get the basic import
        const deck = await this.importFromUrl(url, formatOverride);

        // Collect all cards for resolution
        const allCards: ImportedCard[] = [
            ...deck.cards,
            ...(deck.commanders || []),
            ...(deck.sideboard || [])
        ];

        // Resolve to full Scryfall data
        const resolvedCards = await this.resolveCardsToScryfall(allCards);

        return {
            ...deck,
            resolvedCards
        };
    }
}

// Export singleton instance
export const externalDeckImportService = new ExternalDeckImportService();
