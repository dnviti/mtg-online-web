import { Request, Response } from 'express';
import { externalDeckImportService } from '../services/ExternalDeckImportService';

export class ImportController {
    /**
     * Import deck from URL (auto-detect Archidekt/Moxfield)
     * POST /api/import/url
     * Body: { url: string }
     */
    static async importFromUrl(req: Request, res: Response) {
        try {
            const { url } = req.body;

            if (!url || typeof url !== 'string') {
                return res.status(400).json({ error: 'URL richiesta' });
            }

            const deck = await externalDeckImportService.importFromUrl(url);
            return res.json({ success: true, deck });
        } catch (error: any) {
            console.error('[ImportController] Error importing from URL:', error.message);
            return res.status(400).json({ error: error.message || 'Errore durante l\'import' });
        }
    }

    /**
     * Import deck from Archidekt by ID
     * POST /api/import/archidekt/:deckId
     */
    static async importFromArchidekt(req: Request, res: Response) {
        try {
            const { deckId } = req.params;

            if (!deckId) {
                return res.status(400).json({ error: 'Deck ID richiesto' });
            }

            const deck = await externalDeckImportService.importFromArchidekt(deckId);
            return res.json({ success: true, deck });
        } catch (error: any) {
            console.error('[ImportController] Error importing from Archidekt:', error.message);
            return res.status(400).json({ error: error.message || 'Errore durante l\'import da Archidekt' });
        }
    }

    /**
     * Import deck from Moxfield by ID
     * POST /api/import/moxfield/:deckId
     */
    static async importFromMoxfield(req: Request, res: Response) {
        try {
            const { deckId } = req.params;

            if (!deckId) {
                return res.status(400).json({ error: 'Deck ID richiesto' });
            }

            const deck = await externalDeckImportService.importFromMoxfield(deckId);
            return res.json({ success: true, deck });
        } catch (error: any) {
            console.error('[ImportController] Error importing from Moxfield:', error.message);
            return res.status(400).json({ error: error.message || 'Errore durante l\'import da Moxfield' });
        }
    }

    /**
     * Import deck from text (MTGO/Arena format)
     * POST /api/import/text
     * Body: { text: string, name?: string, format?: string }
     */
    static async importFromText(req: Request, res: Response) {
        try {
            const { text, name, format } = req.body;

            if (!text || typeof text !== 'string') {
                return res.status(400).json({ error: 'Testo della decklist richiesto' });
            }

            const deck = externalDeckImportService.importFromText(
                text,
                name || 'Imported Deck',
                format || 'Standard'
            );

            return res.json({ success: true, deck });
        } catch (error: any) {
            console.error('[ImportController] Error importing from text:', error.message);
            return res.status(400).json({ error: error.message || 'Errore durante l\'import del testo' });
        }
    }

    /**
     * Parse URL to detect platform without importing
     * POST /api/import/parse-url
     * Body: { url: string }
     */
    static async parseUrl(req: Request, res: Response) {
        try {
            const { url } = req.body;

            if (!url || typeof url !== 'string') {
                return res.status(400).json({ error: 'URL richiesta' });
            }

            const parsed = externalDeckImportService.parseDeckUrl(url);
            return res.json({ success: true, ...parsed });
        } catch (error: any) {
            return res.status(400).json({ error: error.message || 'URL non valida' });
        }
    }
}
