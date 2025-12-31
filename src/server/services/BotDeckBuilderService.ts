import { buildDeck, AlgorithmCard } from '../algorithms/DeckBuildingAlgorithm';

// Re-export or alias the type if needed for consumers, although straightforward usage works
type Card = AlgorithmCard;

export class BotDeckBuilderService {

  buildDeck(pool: Card[], basicLands: Card[]): Card[] {
    return buildDeck(pool, basicLands);
  }

}
