import { Router, Request, Response } from 'express';
import authRoutes from './auth.routes';
import deckRoutes from './deck.routes';
import cardRoutes from './card.routes';
import packRoutes from './pack.routes';
import importRoutes from './import.routes';

const router = Router();

router.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

router.use('/auth', authRoutes);
router.use('/user/decks', deckRoutes); // Mounts to /api/user/decks
// router.use('/ai', aiRoutes); // Removed AI routes

// Card routes are a bit mixed: /api/sets, /api/lands, /api/cards/search
// I will mount generic card routes under /cards and specific sets under /sets to match API?
// Original: /api/sets, /api/lands/fallback, /api/cards/search, /api/cards/parse, /api/cards/cache
// Let's refactor slightly or map them specifically to maintain compatibility.

// Mapping to match original API exactly:
router.use('/sets', cardRoutes); // This mounts /sets/sets (Wrong)
// Wait, cardRoutes has /sets defined inside.
// If I mount cardRoutes to /, then /sets works.
// But /search is inside CardController.

// Let's rely on the router defining the full path relative to api root
// or split cardRoutes if needed.

// Current card.routes.ts:
// router.get('/sets', ...)
// router.get('/sets/:code/cards', ...)
// router.get('/lands/fallback', ...)
// router.get('/search', ...) -> /api/search (Wrong, original: /api/cards/search)
// router.post('/parse', ...) -> /api/cards/parse
// router.post('/cache', ...) -> /api/cards/cache

// So I should mount cardRoutes under / but I need to adjust the paths in card.routes.ts
// OR mount separate routers.

// Let's assume I fix card.routes.ts paths to be relative to module or specific.
// I'll mount them logically.

router.use('/cards', cardRoutes);
// This makes:
// /api/cards/sets (New?) -> Original: /api/sets
// /api/cards/search (Matches)
// /api/cards/parse (Matches)

// To support legacy /api/sets, I need to route it.
import { CardController } from '../controllers/card.controller';
router.get('/sets', CardController.getSets);
router.get('/sets/:code/cards', CardController.getSetCards);
router.get('/lands/fallback', CardController.getFallbackLands); // Original: /api/lands/fallback

router.use('/packs', packRoutes);
router.use('/import', importRoutes);

export default router;
