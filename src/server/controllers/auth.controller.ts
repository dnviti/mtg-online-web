import { Request, Response } from 'express';
import { userManager } from '../singletons';

export class AuthController {
  static async register(req: Request, res: Response) {
    try {
      const { username, password } = req.body;
      if (!username || !password) return res.status(400).json({ error: 'Missing credentials' });
      const result = await userManager.register(username, password);
      res.json(result);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  }

  static async login(req: Request, res: Response) {
    try {
      const { username, password } = req.body;
      if (!username || !password) return res.status(400).json({ error: 'Missing credentials' });
      const result = await userManager.login(username, password);
      res.json(result);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  }

  static async getMe(req: Request, res: Response) {
    const userId = (req as any).user.id;
    const user = await userManager.getSafeUser(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  }
}
