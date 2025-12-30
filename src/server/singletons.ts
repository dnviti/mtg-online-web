import { RoomManager } from './managers/RoomManager';
import { GameManager } from './managers/GameManager';
import { DraftManager } from './managers/DraftManager';
import { TournamentManager } from './managers/TournamentManager';
import { UserManager } from './managers/UserManager';
import { PersistenceManager } from './managers/PersistenceManager';
import { CardService } from './services/CardService';
import { ScryfallService } from './services/ScryfallService';
import { PackGeneratorService } from './services/PackGeneratorService';
import { CardParserService } from './services/CardParserService';

export const roomManager = new RoomManager();
export const gameManager = new GameManager();
export const draftManager = new DraftManager();
export const tournamentManager = new TournamentManager();
export const userManager = new UserManager();

// Persistence depends on others
export const persistenceManager = new PersistenceManager(roomManager, draftManager, gameManager);

export const cardService = new CardService();
export const scryfallService = new ScryfallService();
export const packGeneratorService = new PackGeneratorService();
export const cardParserService = new CardParserService();
