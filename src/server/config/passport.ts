import passport from 'passport';
import { Strategy as GoogleStrategy, Profile } from 'passport-google-oauth20';
import { userManager } from '../singletons';

/**
 * Configure Passport.js with Google OAuth 2.0 strategy
 */
export const configurePassport = () => {
    // Only configure Google strategy if credentials are provided
    const clientID = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const callbackURL = process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/api/auth/google/callback';

    if (!clientID || !clientSecret) {
        console.warn('[Passport] Google OAuth not configured: missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET');
        return;
    }

    console.log('[Passport] Configuring Google OAuth strategy');

    passport.use(new GoogleStrategy({
        clientID,
        clientSecret,
        callbackURL,
    }, async (
        _accessToken: string,
        _refreshToken: string,
        profile: Profile,
        done: (error: any, user?: any) => void
    ) => {
        try {
            // Extract user info from Google profile
            const googleId = profile.id;
            const email = profile.emails?.[0]?.value || '';
            const displayName = profile.displayName || profile.name?.givenName || 'User';

            // Find or create user in our database
            const result = await userManager.findOrCreateOAuthUser({
                googleId,
                email,
                displayName
            });

            // Return user with token attached
            done(null, { ...result.user, token: result.token });
        } catch (error) {
            console.error('[Passport] Google OAuth error:', error);
            done(error as Error);
        }
    }));

    // Serialize user for session (store user id)
    passport.serializeUser((user: any, done) => {
        done(null, user.id);
    });

    // Deserialize user from session (fetch user by id)
    passport.deserializeUser(async (id: string, done) => {
        try {
            const user = await userManager.getSafeUser(id);
            done(null, user);
        } catch (error) {
            done(error);
        }
    });
};

/**
 * Check if Google OAuth is configured
 */
export const isGoogleOAuthConfigured = (): boolean => {
    return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
};
