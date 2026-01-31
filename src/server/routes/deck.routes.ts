import { Router } from 'express';
import { DeckController } from '../controllers/deck.controller';
import { authenticateToken } from '../middleware/auth.middleware';

const router = Router();

router.post('/', authenticateToken, DeckController.saveDeck);
router.put('/:id', authenticateToken, DeckController.updateDeck);
router.delete('/:id', authenticateToken, DeckController.deleteDeck);

export default router;
