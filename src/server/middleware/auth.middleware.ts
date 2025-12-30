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
