import { Router } from 'express';
import passport from 'passport';
import { AuthController } from '../controllers/auth.controller';
import { authenticateToken } from '../middleware/auth.middleware';
import { isGoogleOAuthConfigured } from '../config/passport';

const router = Router();

// Local auth routes
router.post('/register', AuthController.register);
router.post('/login', AuthController.login);
router.get('/me', authenticateToken, AuthController.getMe);

// Check if Google OAuth is available
router.get('/google/status', (_req, res) => {
    res.json({ available: isGoogleOAuthConfigured() });
});

// Google OAuth routes (only if configured)
router.get('/google', (req, res, next) => {
    if (!isGoogleOAuthConfigured()) {
        return res.status(503).json({ error: 'Google OAuth non configurato' });
    }
    passport.authenticate('google', {
        scope: ['profile', 'email']
    })(req, res, next);
});

router.get('/google/callback',
    (_req, res, next) => {
        if (!isGoogleOAuthConfigured()) {
            return res.redirect('/login?error=oauth_not_configured');
        }
        next();
    },
    passport.authenticate('google', {
        session: false,
        failureRedirect: '/login?error=oauth_failed'
    }),
    (req, res) => {
        // User is authenticated, redirect to frontend with token
        const user = req.user as any;
        if (user && user.token) {
            // Redirect to frontend callback page with token
            res.redirect(`/auth/callback?token=${encodeURIComponent(user.token)}`);
        } else {
            res.redirect('/login?error=oauth_no_token');
        }
    }
);

export default router;
