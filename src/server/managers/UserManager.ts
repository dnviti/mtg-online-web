import Redis from 'ioredis';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';

const SECRET_KEY = process.env.JWT_SECRET || 'dev-secret-key-change-me';
const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
const REDIS_DB_PERSISTENCE = 3;

// --- Types (Formerly from Prisma) ---
export interface User {
    id: string;
    username: string;
    passwordHash: string;
    email?: string;
    googleId?: string;
    authProvider: 'local' | 'google';
    createdAt: Date;
    // Premium subscription fields
    isPremium: boolean;
    premiumSince?: Date;
    premiumUntil?: Date;
    stripeCustomerId?: string;
    stripeSubscriptionId?: string;
    subscriptionPlan?: 'monthly' | 'yearly';
    subscriptionStatus?: 'active' | 'canceled' | 'past_due';
}

export interface SavedDeck {
    id: string;
    name: string;
    cards: string; // JSON string
    format?: string;
    createdAt: Date;
    userId: string;
}

export interface MatchRecord {
    id: string;
    date: Date;
    result: string;
    deckId?: string;
    opponent?: string;
    userId: string;
}

// Helper type for safe user response
type SafeUser = Omit<User, 'passwordHash'> & {
    decks: (Omit<SavedDeck, 'cards'> & { cards: any[] })[];
    matchHistory: MatchRecord[];
};

export class UserManager {
    private redis: Redis;

    constructor() {
        console.log(`[UserManager] Initializing Redis Persistence at ${REDIS_HOST}:${REDIS_PORT}/db${REDIS_DB_PERSISTENCE}`);
        this.redis = new Redis({
            host: REDIS_HOST,
            port: REDIS_PORT,
            db: REDIS_DB_PERSISTENCE
        });
    }

    async register(username: string, password: string): Promise<{ user: SafeUser, token: string }> {
        // 1. Check if username exists
        const existingId = await this.redis.hget('users:lookup:username', username.toLowerCase());
        if (existingId) {
            throw new Error('Username already exists');
        }

        // 2. Create User
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);
        const userId = randomUUID();
        const now = new Date().toISOString();

        const user: User = {
            id: userId,
            username,
            passwordHash,
            authProvider: 'local',
            createdAt: new Date(now),
            isPremium: false
        };

        // Transaction to save user and update lookup
        const pipeline = this.redis.multi();
        pipeline.hset(`users:${userId}`, {
            id: userId,
            username,
            passwordHash,
            authProvider: 'local',
            createdAt: now,
            isPremium: 'false'
        });
        pipeline.hset('users:lookup:username', username.toLowerCase(), userId);
        await pipeline.exec();

        // 3. Return Token
        const token = this.generateToken(userId, username);

        return {
            user: { ...user, decks: [], matchHistory: [] },
            token
        };
    }

    async login(username: string, password: string): Promise<{ user: SafeUser, token: string }> {
        // 1. Lookup ID
        const userId = await this.redis.hget('users:lookup:username', username.toLowerCase());
        if (!userId) {
            throw new Error('Invalid credentials');
        }

        // 2. Get User
        const userData = await this.redis.hgetall(`users:${userId}`);
        if (!userData || !userData.username) { // Basic check
            throw new Error('User data corrupted');
        }

        // 3. Verify Password
        const valid = await bcrypt.compare(password, userData.passwordHash);
        if (!valid) {
            throw new Error('Invalid credentials');
        }

        const user: User = {
            id: userData.id,
            username: userData.username,
            passwordHash: userData.passwordHash,
            email: userData.email,
            googleId: userData.googleId,
            authProvider: (userData.authProvider as 'local' | 'google') || 'local',
            createdAt: new Date(userData.createdAt),
            isPremium: userData.isPremium === 'true',
            premiumSince: userData.premiumSince ? new Date(userData.premiumSince) : undefined,
            premiumUntil: userData.premiumUntil ? new Date(userData.premiumUntil) : undefined,
            stripeCustomerId: userData.stripeCustomerId,
            stripeSubscriptionId: userData.stripeSubscriptionId,
            subscriptionPlan: userData.subscriptionPlan as 'monthly' | 'yearly' | undefined,
            subscriptionStatus: userData.subscriptionStatus as 'active' | 'canceled' | 'past_due' | undefined
        };

        // 4. Fetch Details (Decks, Match History)
        const safeUser = await this.assembleSafeUser(user);
        const token = this.generateToken(user.id, user.username);

        return { user: safeUser, token };
    }

    private async assembleSafeUser(user: User): Promise<SafeUser> {
        // History and Decks
        const deckIds = await this.redis.smembers(`users:${user.id}:decks`);
        const decks: SavedDeck[] = [];

        for (const deckId of deckIds) {
            const deckData = await this.redis.hgetall(`decks:${deckId}`);
            if (deckData && deckData.id) {
                decks.push({
                    id: deckData.id,
                    name: deckData.name,
                    cards: deckData.cards,
                    format: deckData.format,
                    userId: deckData.userId,
                    createdAt: new Date(deckData.createdAt)
                } as any); // Cast to handle Date correctly being string in Redis
            }
        }

        const matchIds = await this.redis.smembers(`users:${user.id}:matches`);
        const history: MatchRecord[] = [];
        for (const mId of matchIds) {
            const mData = await this.redis.hgetall(`matches:${mId}`);
            if (mData && mData.id) {
                history.push({
                    id: mData.id,
                    date: new Date(mData.date),
                    result: mData.result,
                    deckId: mData.deckId,
                    opponent: mData.opponent,
                    userId: mData.userId
                });
            }
        }

        // Parse JSON cards immediately for safe user response? 
        // The original code did parsing in `getSafeUser`.
        // We should match that behavior for the frontend.

        const parsedDecks = decks.map(d => ({
            ...d,
            cards: typeof d.cards === 'string' ? JSON.parse(d.cards) : d.cards
        }));

        return {
            id: user.id,
            username: user.username,
            email: user.email,
            googleId: user.googleId,
            authProvider: user.authProvider,
            createdAt: user.createdAt,
            isPremium: user.isPremium,
            premiumSince: user.premiumSince,
            premiumUntil: user.premiumUntil,
            stripeCustomerId: user.stripeCustomerId,
            stripeSubscriptionId: user.stripeSubscriptionId,
            subscriptionPlan: user.subscriptionPlan,
            subscriptionStatus: user.subscriptionStatus,
            decks: parsedDecks,
            matchHistory: history
        };
    }

    generateToken(userId: string, username: string): string {
        return jwt.sign({ id: userId, username }, SECRET_KEY, { expiresIn: '7d' });
    }

    verifyToken(token: string): any {
        try {
            return jwt.verify(token, SECRET_KEY);
        } catch (e) {
            return null;
        }
    }

    async getUser(id: string): Promise<User | null> {
        const userData = await this.redis.hgetall(`users:${id}`);
        if (!userData || !userData.username) return null;
        return {
            id: userData.id,
            username: userData.username,
            passwordHash: userData.passwordHash,
            email: userData.email,
            googleId: userData.googleId,
            authProvider: (userData.authProvider as 'local' | 'google') || 'local',
            createdAt: new Date(userData.createdAt),
            isPremium: userData.isPremium === 'true',
            premiumSince: userData.premiumSince ? new Date(userData.premiumSince) : undefined,
            premiumUntil: userData.premiumUntil ? new Date(userData.premiumUntil) : undefined,
            stripeCustomerId: userData.stripeCustomerId,
            stripeSubscriptionId: userData.stripeSubscriptionId,
            subscriptionPlan: userData.subscriptionPlan as 'monthly' | 'yearly' | undefined,
            subscriptionStatus: userData.subscriptionStatus as 'active' | 'canceled' | 'past_due' | undefined
        };
    }

    async getSafeUser(id: string): Promise<SafeUser | null> {
        const user = await this.getUser(id);
        if (!user) return null;
        return this.assembleSafeUser(user);
    }

    async saveDeck(userId: string, deckName: string, cards: any[], format?: string): Promise<SavedDeck> {
        const cardsJson = JSON.stringify(cards);
        const deckId = randomUUID();
        const now = new Date().toISOString();

        const deck: any = {
            id: deckId,
            name: deckName,
            cards: cardsJson,
            format: format || 'Standard',
            userId,
            createdAt: now
        };

        const pipeline = this.redis.multi();
        pipeline.hset(`decks:${deckId}`, deck);
        pipeline.sadd(`users:${userId}:decks`, deckId);
        await pipeline.exec();

        return { ...deck, cards: cards }; // Return with parsed cards object for frontend convenience
    }

    async updateDeck(userId: string, deckId: string, deckName: string, cards: any[], format?: string): Promise<SavedDeck> {
        // Validate Ownership
        const existing = await this.redis.hgetall(`decks:${deckId}`);
        if (!existing || existing.userId !== userId) {
            throw new Error("Deck not found or unauthorized");
        }

        const cardsJson = JSON.stringify(cards);

        await this.redis.hset(`decks:${deckId}`, {
            name: deckName,
            cards: cardsJson,
            format: format || existing.format
        });

        // Reconstruct
        return {
            id: existing.id,
            userId: existing.userId,
            createdAt: new Date(existing.createdAt),
            name: deckName,
            cards: cards,
            format: format || existing.format
        } as unknown as SavedDeck;
    }

    async deleteDeck(userId: string, deckId: string): Promise<void> {
        const existing = await this.redis.hgetall(`decks:${deckId}`);
        if (!existing || existing.userId !== userId) {
            throw new Error("Deck not found or unauthorized");
        }

        const pipeline = this.redis.multi();
        pipeline.del(`decks:${deckId}`);
        pipeline.srem(`users:${userId}:decks`, deckId);
        await pipeline.exec();
    }

    /**
     * Find or create a user from Google OAuth profile
     */
    async findOrCreateOAuthUser(profile: {
        googleId: string;
        email: string;
        displayName: string;
    }): Promise<{ user: SafeUser; token: string }> {
        // 1. Check if user exists by Google ID
        const existingUserId = await this.redis.hget('users:lookup:google', profile.googleId);

        if (existingUserId) {
            // User exists, fetch and return
            const user = await this.getUser(existingUserId);
            if (!user) {
                throw new Error('User data corrupted');
            }
            const safeUser = await this.assembleSafeUser(user);
            const token = this.generateToken(user.id, user.username);
            return { user: safeUser, token };
        }

        // 2. Check if email is already registered (to link accounts or prevent duplicates)
        // For simplicity, we'll create a new user. In production, you might want to link accounts.

        // 3. Generate unique username from display name
        let baseUsername = profile.displayName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
        if (baseUsername.length < 3) {
            baseUsername = 'user';
        }
        let username = baseUsername;
        let counter = 1;

        // Check for username conflicts
        while (await this.redis.hget('users:lookup:username', username.toLowerCase())) {
            username = `${baseUsername}${counter}`;
            counter++;
            if (counter > 1000) {
                // Fallback to random suffix
                username = `${baseUsername}${Date.now().toString(36)}`;
                break;
            }
        }

        // 4. Create new OAuth user
        const userId = randomUUID();
        const now = new Date().toISOString();

        const user: User = {
            id: userId,
            username,
            passwordHash: '', // Empty for OAuth users
            email: profile.email,
            googleId: profile.googleId,
            authProvider: 'google',
            createdAt: new Date(now),
            isPremium: false
        };

        // Transaction to save user and update lookups
        const pipeline = this.redis.multi();
        pipeline.hset(`users:${userId}`, {
            id: userId,
            username,
            passwordHash: '',
            email: profile.email || '',
            googleId: profile.googleId,
            authProvider: 'google',
            createdAt: now,
            isPremium: 'false'
        });
        pipeline.hset('users:lookup:username', username.toLowerCase(), userId);
        pipeline.hset('users:lookup:google', profile.googleId, userId);
        await pipeline.exec();

        const token = this.generateToken(userId, username);

        return {
            user: { ...user, decks: [], matchHistory: [] },
            token
        };
    }

    /**
     * Get user by Google ID
     */
    async getUserByGoogleId(googleId: string): Promise<User | null> {
        const userId = await this.redis.hget('users:lookup:google', googleId);
        if (!userId) return null;
        return this.getUser(userId);
    }

    // ==================== Premium Subscription Methods ====================

    /**
     * Set user as premium after successful Stripe subscription
     */
    async setPremiumStatus(
        userId: string,
        stripeCustomerId: string,
        stripeSubscriptionId: string,
        subscriptionPlan: 'monthly' | 'yearly',
        premiumUntil: Date
    ): Promise<void> {
        const now = new Date().toISOString();

        await this.redis.hset(`users:${userId}`, {
            isPremium: 'true',
            premiumSince: now,
            premiumUntil: premiumUntil.toISOString(),
            stripeCustomerId,
            stripeSubscriptionId,
            subscriptionPlan,
            subscriptionStatus: 'active'
        });

        // Also store reverse lookup for webhooks
        await this.redis.hset('users:lookup:stripe', stripeCustomerId, userId);
    }

    /**
     * Update subscription status (for webhook events)
     */
    async updateSubscriptionStatus(
        stripeCustomerId: string,
        status: 'active' | 'canceled' | 'past_due',
        premiumUntil?: Date
    ): Promise<void> {
        const userId = await this.redis.hget('users:lookup:stripe', stripeCustomerId);
        if (!userId) {
            console.error(`[UserManager] No user found for Stripe customer ${stripeCustomerId}`);
            return;
        }

        const updates: Record<string, string> = {
            subscriptionStatus: status
        };

        // If subscription is canceled or past due, set isPremium based on premiumUntil
        if (status === 'canceled') {
            // Keep premium until the period ends
            if (premiumUntil) {
                updates.premiumUntil = premiumUntil.toISOString();
            }
        } else if (status === 'past_due') {
            // Payment failed, but keep premium for grace period
            updates.subscriptionStatus = 'past_due';
        } else if (status === 'active' && premiumUntil) {
            // Renewed successfully
            updates.premiumUntil = premiumUntil.toISOString();
            updates.isPremium = 'true';
        }

        await this.redis.hset(`users:${userId}`, updates);
    }

    /**
     * Cancel subscription (set to expire at period end)
     */
    async cancelSubscription(userId: string): Promise<void> {
        await this.redis.hset(`users:${userId}`, {
            subscriptionStatus: 'canceled'
        });
    }

    /**
     * Remove premium status completely (when subscription period ends)
     */
    async removePremiumStatus(stripeCustomerId: string): Promise<void> {
        const userId = await this.redis.hget('users:lookup:stripe', stripeCustomerId);
        if (!userId) {
            console.error(`[UserManager] No user found for Stripe customer ${stripeCustomerId}`);
            return;
        }

        await this.redis.hset(`users:${userId}`, {
            isPremium: 'false',
            subscriptionStatus: ''
        });

        // Clean up subscription-specific fields (keep customer ID for re-subscription)
        await this.redis.hdel(`users:${userId}`, 'stripeSubscriptionId', 'subscriptionPlan', 'premiumUntil');
    }

    /**
     * Get user by Stripe customer ID (for webhook handling)
     */
    async getUserByStripeCustomerId(stripeCustomerId: string): Promise<User | null> {
        const userId = await this.redis.hget('users:lookup:stripe', stripeCustomerId);
        if (!userId) return null;
        return this.getUser(userId);
    }

    /**
     * Check if user's premium has expired and update status
     */
    async checkAndUpdatePremiumExpiry(userId: string): Promise<boolean> {
        const user = await this.getUser(userId);
        if (!user) return false;

        if (user.isPremium && user.premiumUntil) {
            const now = new Date();
            if (now > user.premiumUntil) {
                // Premium has expired
                await this.redis.hset(`users:${userId}`, {
                    isPremium: 'false'
                });
                return false;
            }
        }
        return user.isPremium;
    }
}

