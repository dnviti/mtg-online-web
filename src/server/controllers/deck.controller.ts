import { Request, Response } from 'express';
import { userManager } from '../singletons';

export class DeckController {
  static async saveDeck(req: Request, res: Response) {
    const userId = (req as any).user.id;
    const { name, cards, format } = req.body;

    try {
      const deck = await userManager.saveDeck(userId, name || 'Untitled Deck', cards || [], format);
      res.json(deck);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  }

  static async updateDeck(req: Request, res: Response) {
    const userId = (req as any).user.id;
    const { id } = req.params;
    const { name, cards } = req.body;

    try {
      const deck = await userManager.updateDeck(userId, id, name || 'Untitled Deck', cards || []);
      res.json(deck);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  }

  static async deleteDeck(req: Request, res: Response) {
    const userId = (req as any).user.id;
    const { id } = req.params;

    try {
      await userManager.deleteDeck(userId, id);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  }
}
