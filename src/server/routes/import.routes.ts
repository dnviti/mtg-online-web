import { Router } from 'express';
import { ImportController } from '../controllers/import.controller';
import { authenticateToken } from '../middleware/auth.middleware';

const router = Router();

// Import from URL (auto-detect platform)
router.post('/url', authenticateToken, ImportController.importFromUrl);

// Import from specific platforms
router.post('/archidekt/:deckId', authenticateToken, ImportController.importFromArchidekt);
router.post('/moxfield/:deckId', authenticateToken, ImportController.importFromMoxfield);

// Import from text (MTGO/Arena format)
router.post('/text', authenticateToken, ImportController.importFromText);

// Parse URL without importing (to show preview)
router.post('/parse-url', authenticateToken, ImportController.parseUrl);

export default router;
