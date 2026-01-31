import { Router } from 'express';
import { CardController } from '../controllers/card.controller';

const router = Router();

router.get('/sets', CardController.getSets);
router.get('/sets/:code/cards', CardController.getSetCards);
router.get('/lands/fallback', CardController.getFallbackLands);
router.get('/search', CardController.search);
router.post('/parse', CardController.parse);
router.post('/cache', CardController.cache);

export default router;
