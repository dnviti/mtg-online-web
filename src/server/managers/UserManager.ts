import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { PrismaClient, User, SavedDeck, MatchRecord } from '@prisma/client';

const SECRET_KEY = process.env.JWT_SECRET || 'dev-secret-key-change-me';

// Helper type for safe user response
type SafeUser = Omit<User, 'passwordHash'> & {
    decks: SavedDeck[];
    matchHistory: MatchRecord[];
};

export class UserManager {
    private prisma: PrismaClient;

    constructor() {
        this.prisma = new PrismaClient();
    }

    async register(username: string, password: string): Promise<{ user: SafeUser, token: string }> {
        const existing = await this.prisma.user.findUnique({
            where: { username }
        });

        if (existing) {
            throw new Error('Username already exists');
        }

        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        const newUser = await this.prisma.user.create({
            data: {
                username,
                passwordHash,
            },
            include: {
                decks: true,
                matchHistory: true
            }
        });

        const token = this.generateToken(newUser.id, newUser.username);
        const { passwordHash: _, ...safeUser } = newUser;

        return { user: safeUser, token };
    }

    async login(username: string, password: string): Promise<{ user: SafeUser, token: string }> {
        const user = await this.prisma.user.findUnique({
            where: { username },
            include: {
                decks: true,
                matchHistory: true
            }
        });

        if (!user) {
            throw new Error('Invalid credentials');
        }

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) {
            throw new Error('Invalid credentials');
        }

        const token = this.generateToken(user.id, user.username);
        const { passwordHash: _, ...safeUser } = user;

        return { user: safeUser, token };
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

    // Changed to Async
    async getUser(id: string): Promise<User | null> {
        return this.prisma.user.findUnique({ where: { id } });
    }

    // Changed to Async
    async getSafeUser(id: string): Promise<SafeUser | null> {
        const user = await this.prisma.user.findUnique({
            where: { id },
            include: {
                decks: true,
                matchHistory: true
            }
        });

        if (!user) return null;
        const { passwordHash, ...safe } = user;
        return safe;
    }

    // Changed to Async
    async saveDeck(userId: string, deckName: string, cards: any[], format?: string): Promise<SavedDeck> {

        // Validate cards are JSON serializable
        const cardsJson = JSON.stringify(cards);

        return this.prisma.savedDeck.create({
            data: {
                name: deckName,
                cards: cardsJson,
                userId,
                format: format || 'Standard'
            }
        });
    }

    async updateDeck(userId: string, deckId: string, deckName: string, cards: any[], format?: string): Promise<SavedDeck> {
        const deck = await this.prisma.savedDeck.findUnique({
            where: { id: deckId }
        });

        if (!deck || deck.userId !== userId) {
            throw new Error("Deck not found or unauthorized");
        }

        const cardsJson = JSON.stringify(cards);

        return this.prisma.savedDeck.update({
            where: { id: deckId },
            data: {
                name: deckName,
                cards: cardsJson,
                format: format
            }
        });
    }

    // Changed to Async
    async deleteDeck(userId: string, deckId: string): Promise<void> {
        // Ensure the deck belongs to the user
        const deck = await this.prisma.savedDeck.findUnique({
            where: { id: deckId }
        });

        if (!deck || deck.userId !== userId) {
            throw new Error("Deck not found or unauthorized");
        }

        await this.prisma.savedDeck.delete({
            where: { id: deckId }
        });
    }
}
