import Stripe from 'stripe';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const STRIPE_PRICE_MONTHLY = process.env.STRIPE_PRICE_MONTHLY;
const STRIPE_PRICE_YEARLY = process.env.STRIPE_PRICE_YEARLY;
const APP_URL = process.env.APP_URL || 'http://localhost:3000';

// Prices in cents
const PRICE_MONTHLY_CENTS = 299; // $2.99
const PRICE_YEARLY_CENTS = 2499; // $24.99

export class PaymentService {
    private stripe: Stripe | null = null;

    constructor() {
        if (STRIPE_SECRET_KEY) {
            this.stripe = new Stripe(STRIPE_SECRET_KEY);
            console.log('[PaymentService] Stripe initialized');
        } else {
            console.warn('[PaymentService] STRIPE_SECRET_KEY not set - payment features disabled');
        }
    }

    /**
     * Check if Stripe is configured
     */
    isConfigured(): boolean {
        return this.stripe !== null && !!STRIPE_PRICE_MONTHLY && !!STRIPE_PRICE_YEARLY;
    }

    /**
     * Get pricing info for frontend
     */
    getPricingInfo() {
        return {
            monthly: {
                priceId: STRIPE_PRICE_MONTHLY,
                amount: PRICE_MONTHLY_CENTS,
                currency: 'usd',
                displayPrice: '$2.99/month'
            },
            yearly: {
                priceId: STRIPE_PRICE_YEARLY,
                amount: PRICE_YEARLY_CENTS,
                currency: 'usd',
                displayPrice: '$24.99/year',
                savings: '~30%'
            }
        };
    }

    /**
     * Create a Stripe Checkout Session for subscription
     */
    async createCheckoutSession(
        userId: string,
        userEmail: string | undefined,
        plan: 'monthly' | 'yearly'
    ): Promise<{ sessionId: string; url: string }> {
        if (!this.stripe) {
            throw new Error('Stripe not configured');
        }

        const priceId = plan === 'monthly' ? STRIPE_PRICE_MONTHLY : STRIPE_PRICE_YEARLY;

        if (!priceId) {
            throw new Error(`Price ID not configured for plan: ${plan}`);
        }

        const session = await this.stripe.checkout.sessions.create({
            mode: 'subscription',
            payment_method_types: ['card'],
            line_items: [
                {
                    price: priceId,
                    quantity: 1
                }
            ],
            metadata: {
                userId,
                plan
            },
            customer_email: userEmail,
            success_url: `${APP_URL}/?tab=profile&payment=success`,
            cancel_url: `${APP_URL}/?tab=profile&payment=cancelled`,
            subscription_data: {
                metadata: {
                    userId,
                    plan
                }
            }
        });

        if (!session.url) {
            throw new Error('Failed to create checkout session URL');
        }

        return {
            sessionId: session.id,
            url: session.url
        };
    }

    /**
     * Create a Stripe Customer Portal session for managing subscription
     */
    async createPortalSession(stripeCustomerId: string): Promise<{ url: string }> {
        if (!this.stripe) {
            throw new Error('Stripe not configured');
        }

        const session = await this.stripe.billingPortal.sessions.create({
            customer: stripeCustomerId,
            return_url: `${APP_URL}/?tab=profile`
        });

        return { url: session.url };
    }

    /**
     * Cancel subscription at period end
     */
    async cancelSubscription(stripeSubscriptionId: string): Promise<void> {
        if (!this.stripe) {
            throw new Error('Stripe not configured');
        }

        await this.stripe.subscriptions.update(stripeSubscriptionId, {
            cancel_at_period_end: true
        });
    }

    /**
     * Get subscription details
     */
    async getSubscription(stripeSubscriptionId: string): Promise<Stripe.Subscription | null> {
        if (!this.stripe) {
            return null;
        }

        try {
            return await this.stripe.subscriptions.retrieve(stripeSubscriptionId);
        } catch (e) {
            console.error('[PaymentService] Error fetching subscription:', e);
            return null;
        }
    }

    /**
     * Verify and construct webhook event
     */
    constructWebhookEvent(payload: Buffer, signature: string): Stripe.Event {
        if (!this.stripe) {
            throw new Error('Stripe not configured');
        }

        if (!STRIPE_WEBHOOK_SECRET) {
            throw new Error('Stripe webhook secret not configured');
        }

        return this.stripe.webhooks.constructEvent(
            payload,
            signature,
            STRIPE_WEBHOOK_SECRET
        );
    }

    /**
     * Extract useful data from checkout session completed event
     */
    extractCheckoutData(session: Stripe.Checkout.Session): {
        userId: string;
        plan: 'monthly' | 'yearly';
        customerId: string;
        subscriptionId: string;
    } | null {
        const userId = session.metadata?.userId;
        const plan = session.metadata?.plan as 'monthly' | 'yearly';
        const customerId = session.customer as string;
        const subscriptionId = session.subscription as string;

        if (!userId || !plan || !customerId || !subscriptionId) {
            console.error('[PaymentService] Missing data in checkout session:', {
                userId, plan, customerId, subscriptionId
            });
            return null;
        }

        return { userId, plan, customerId, subscriptionId };
    }

    /**
     * Calculate premium expiry date from subscription
     */
    async getSubscriptionPeriodEnd(subscriptionId: string): Promise<Date | null> {
        if (!this.stripe) {
            return null;
        }

        try {
            const subscription = await this.stripe.subscriptions.retrieve(subscriptionId) as any;
            // current_period_end is on the subscription object
            const periodEnd = subscription.current_period_end;
            return periodEnd ? new Date(periodEnd * 1000) : null;
        } catch (e) {
            console.error('[PaymentService] Error getting subscription period:', e);
            return null;
        }
    }
}

// Singleton instance
export const paymentService = new PaymentService();
