import { Request, Response } from 'express';
import { userManager } from '../singletons';
import { paymentService } from '../services/PaymentService';
import Stripe from 'stripe';

export class PaymentController {
    /**
     * Get payment status and pricing info
     */
    static async getStatus(req: Request, res: Response) {
        try {
            const userId = (req as any).user?.id;

            const response: any = {
                configured: paymentService.isConfigured(),
                pricing: paymentService.getPricingInfo()
            };

            // If user is authenticated, include their subscription status
            if (userId) {
                const user = await userManager.getSafeUser(userId);
                if (user) {
                    response.subscription = {
                        isPremium: user.isPremium,
                        premiumSince: user.premiumSince,
                        premiumUntil: user.premiumUntil,
                        plan: user.subscriptionPlan,
                        status: user.subscriptionStatus,
                        hasStripeCustomer: !!user.stripeCustomerId
                    };
                }
            }

            res.json(response);
        } catch (e: any) {
            console.error('[PaymentController] getStatus error:', e);
            res.status(500).json({ error: 'Failed to get payment status' });
        }
    }

    /**
     * Create Stripe Checkout session for subscription
     */
    static async createCheckoutSession(req: Request, res: Response) {
        try {
            const userId = (req as any).user.id;
            const { plan } = req.body;

            if (!plan || !['monthly', 'yearly'].includes(plan)) {
                return res.status(400).json({ error: 'Invalid plan. Must be "monthly" or "yearly"' });
            }

            // Get user email for pre-filling checkout
            const user = await userManager.getSafeUser(userId);
            if (!user) {
                return res.status(404).json({ error: 'User not found' });
            }

            // Check if already premium
            if (user.isPremium && user.subscriptionStatus === 'active') {
                return res.status(400).json({ error: 'Already have an active subscription' });
            }

            const session = await paymentService.createCheckoutSession(
                userId,
                user.email,
                plan
            );

            res.json(session);
        } catch (e: any) {
            console.error('[PaymentController] createCheckoutSession error:', e);
            res.status(500).json({ error: e.message || 'Failed to create checkout session' });
        }
    }

    /**
     * Create Stripe Customer Portal session for managing subscription
     */
    static async createPortalSession(req: Request, res: Response) {
        try {
            const userId = (req as any).user.id;

            const user = await userManager.getSafeUser(userId);
            if (!user) {
                return res.status(404).json({ error: 'User not found' });
            }

            if (!user.stripeCustomerId) {
                return res.status(400).json({ error: 'No active subscription found' });
            }

            const session = await paymentService.createPortalSession(user.stripeCustomerId);
            res.json(session);
        } catch (e: any) {
            console.error('[PaymentController] createPortalSession error:', e);
            res.status(500).json({ error: e.message || 'Failed to create portal session' });
        }
    }

    /**
     * Cancel subscription (at period end)
     */
    static async cancelSubscription(req: Request, res: Response) {
        try {
            const userId = (req as any).user.id;

            const user = await userManager.getSafeUser(userId);
            if (!user) {
                return res.status(404).json({ error: 'User not found' });
            }

            if (!user.stripeSubscriptionId) {
                return res.status(400).json({ error: 'No active subscription found' });
            }

            await paymentService.cancelSubscription(user.stripeSubscriptionId);
            await userManager.cancelSubscription(userId);

            res.json({ success: true, message: 'Subscription will be canceled at period end' });
        } catch (e: any) {
            console.error('[PaymentController] cancelSubscription error:', e);
            res.status(500).json({ error: e.message || 'Failed to cancel subscription' });
        }
    }

    /**
     * Handle Stripe webhook events
     * Note: This endpoint must receive raw body, not JSON parsed
     */
    static async handleWebhook(req: Request, res: Response) {
        const signature = req.headers['stripe-signature'] as string;

        if (!signature) {
            console.error('[PaymentController] Webhook missing signature');
            return res.status(400).send('Missing stripe-signature header');
        }

        let event: Stripe.Event;

        try {
            event = paymentService.constructWebhookEvent(req.body, signature);
        } catch (e: any) {
            console.error('[PaymentController] Webhook signature verification failed:', e.message);
            return res.status(400).send(`Webhook Error: ${e.message}`);
        }

        console.log(`[PaymentController] Received webhook event: ${event.type}`);

        try {
            switch (event.type) {
                case 'checkout.session.completed': {
                    const session = event.data.object as Stripe.Checkout.Session;
                    await PaymentController.handleCheckoutCompleted(session);
                    break;
                }

                case 'invoice.paid': {
                    const invoice = event.data.object as Stripe.Invoice;
                    await PaymentController.handleInvoicePaid(invoice);
                    break;
                }

                case 'invoice.payment_failed': {
                    const invoice = event.data.object as Stripe.Invoice;
                    await PaymentController.handleInvoicePaymentFailed(invoice);
                    break;
                }

                case 'customer.subscription.updated': {
                    const subscription = event.data.object as Stripe.Subscription;
                    await PaymentController.handleSubscriptionUpdated(subscription);
                    break;
                }

                case 'customer.subscription.deleted': {
                    const subscription = event.data.object as Stripe.Subscription;
                    await PaymentController.handleSubscriptionDeleted(subscription);
                    break;
                }

                default:
                    console.log(`[PaymentController] Unhandled event type: ${event.type}`);
            }

            res.json({ received: true });
        } catch (e: any) {
            console.error('[PaymentController] Webhook processing error:', e);
            // Return 500 to make Stripe retry
            res.status(500).json({ error: 'Webhook processing failed' });
        }
    }

    /**
     * Handle checkout.session.completed - new subscription
     */
    private static async handleCheckoutCompleted(session: Stripe.Checkout.Session) {
        const data = paymentService.extractCheckoutData(session);
        if (!data) {
            console.error('[PaymentController] Invalid checkout session data');
            return;
        }

        const premiumUntil = await paymentService.getSubscriptionPeriodEnd(data.subscriptionId);
        if (!premiumUntil) {
            console.error('[PaymentController] Could not get subscription period end');
            return;
        }

        await userManager.setPremiumStatus(
            data.userId,
            data.customerId,
            data.subscriptionId,
            data.plan,
            premiumUntil
        );

        console.log(`[PaymentController] User ${data.userId} subscribed to ${data.plan} plan`);
    }

    /**
     * Handle invoice.paid - subscription renewed
     */
    private static async handleInvoicePaid(invoice: Stripe.Invoice) {
        const customerId = invoice.customer as string;
        // Get subscription ID from invoice (cast to any for Stripe API compatibility)
        const invoiceAny = invoice as any;
        const subscriptionId = typeof invoiceAny.subscription === 'string'
            ? invoiceAny.subscription
            : invoiceAny.subscription?.id;

        if (!subscriptionId) {
            // One-time payment, not a subscription renewal
            return;
        }

        const premiumUntil = await paymentService.getSubscriptionPeriodEnd(subscriptionId);

        await userManager.updateSubscriptionStatus(
            customerId,
            'active',
            premiumUntil || undefined
        );

        console.log(`[PaymentController] Subscription renewed for customer ${customerId}`);
    }

    /**
     * Handle invoice.payment_failed
     */
    private static async handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
        const customerId = invoice.customer as string;

        await userManager.updateSubscriptionStatus(customerId, 'past_due');

        console.log(`[PaymentController] Payment failed for customer ${customerId}`);
    }

    /**
     * Handle customer.subscription.updated
     */
    private static async handleSubscriptionUpdated(subscription: Stripe.Subscription) {
        const customerId = subscription.customer as string;
        const status = subscription.status;
        // Get current_period_end from subscription (cast to any for Stripe API compatibility)
        const subscriptionAny = subscription as any;
        const periodEndTimestamp = subscriptionAny.current_period_end;
        const periodEnd = periodEndTimestamp ? new Date(periodEndTimestamp * 1000) : new Date();

        let mappedStatus: 'active' | 'canceled' | 'past_due';
        if (status === 'active' || status === 'trialing') {
            mappedStatus = 'active';
        } else if (status === 'past_due' || status === 'unpaid') {
            mappedStatus = 'past_due';
        } else {
            mappedStatus = 'canceled';
        }

        await userManager.updateSubscriptionStatus(customerId, mappedStatus, periodEnd);

        console.log(`[PaymentController] Subscription updated for customer ${customerId}: ${status}`);
    }

    /**
     * Handle customer.subscription.deleted - subscription ended
     */
    private static async handleSubscriptionDeleted(subscription: Stripe.Subscription) {
        const customerId = subscription.customer as string;

        await userManager.removePremiumStatus(customerId);

        console.log(`[PaymentController] Subscription deleted for customer ${customerId}`);
    }
}
