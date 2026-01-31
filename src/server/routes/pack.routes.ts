import { Router } from 'express';
import { PackController } from '../controllers/pack.controller';

const router = Router();

router.post('/generate', PackController.generate);

export default router;
