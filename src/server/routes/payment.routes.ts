import { Router } from 'express';
import { PaymentController } from '../controllers/payment.controller';
import { authenticateToken, optionalAuth } from '../middleware/auth.middleware';

const router = Router();

// Get payment status and pricing (public, but enhanced if authenticated)
router.get('/status', optionalAuth, PaymentController.getStatus);

// Create checkout session (requires auth)
router.post('/stripe/create-session', authenticateToken, PaymentController.createCheckoutSession);

// Create customer portal session (requires auth)
router.post('/stripe/portal', authenticateToken, PaymentController.createPortalSession);

// Cancel subscription (requires auth)
router.post('/cancel', authenticateToken, PaymentController.cancelSubscription);

// Stripe webhook - NO AUTH, verified by signature
// Note: This route must receive raw body, configured in server index.ts
router.post('/stripe/webhook', PaymentController.handleWebhook);

export default router;
