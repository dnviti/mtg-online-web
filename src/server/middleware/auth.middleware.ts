import { Request, Response, NextFunction } from 'express';
import { userManager } from '../singletons';

export const authenticateToken = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.sendStatus(401);

  const payload = userManager.verifyToken(token);
  if (!payload) return res.sendStatus(403);

  (req as any).user = payload;
  next();
};

/**
 * Optional authentication - sets user if token provided, but doesn't fail if not
 */
export const optionalAuth = (req: Request, _res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token) {
    const payload = userManager.verifyToken(token);
    if (payload) {
      (req as any).user = payload;
    }
  }

  next();
};
