# CLAUDE.md - AI Assistant Guide for MTGate

## Project Overview

**MTGate** is a browser-based Magic: The Gathering multiplayer draft simulator. It provides an immersive experience for cube drafting, deck building, and gameplay with real-time multiplayer synchronization.

### Core Features
- **Draft Simulation**: Synchronous multiplayer drafting with pack passing
- **Cube Manager**: Parse card lists, fetch metadata from Scryfall, generate booster packs
- **Deck Builder**: Build decks from drafted pools with validation
- **Live Gameplay**: Real-time MTG gameplay with rules engine support
- **Tournament System**: Bracket-based tournament management
- **Bot Support**: AI-powered bots for drafting and gameplay (via Gemini)

## Technology Stack

| Layer | Technology |
|-------|------------|
| Runtime | Node.js 20+ (TypeScript) |
| Frontend | React 19, Vite 6, Tailwind CSS 3 |
| Backend | Express 4, Socket.IO 4 |
| Database | SQLite via Prisma ORM |
| Caching | Redis (ioredis) |
| Card Data | Scryfall API |
| AI | Google Gemini API |
| Drag & Drop | dnd-kit |
| Icons | lucide-react, mana-font |
| PWA | vite-plugin-pwa |

## Project Structure

```
mtg-online-web/
├── src/                          # Main source directory
│   ├── client/                   # React frontend application
│   │   ├── index.html
│   │   ├── public/               # Static assets (favicon, icons)
│   │   └── src/
│   │       ├── App.tsx           # Main application component
│   │       ├── main.tsx          # Entry point
│   │       ├── components/       # Reusable UI components
│   │       │   ├── CardPreview.tsx
│   │       │   ├── CardVisual.tsx
│   │       │   ├── ConfirmDialog.tsx
│   │       │   ├── GameLogPanel.tsx
│   │       │   ├── GlobalContextMenu.tsx
│   │       │   ├── Modal.tsx
│   │       │   ├── PackCard.tsx
│   │       │   ├── StackView.tsx
│   │       │   └── Toast.tsx
│   │       ├── modules/          # Feature modules
│   │       │   ├── auth/         # Authentication UI
│   │       │   ├── cube/         # Cube management
│   │       │   ├── draft/        # Draft and deck building
│   │       │   ├── game/         # Live gameplay
│   │       │   ├── lobby/        # Online lobby
│   │       │   ├── profile/      # User profile and decks
│   │       │   ├── tester/       # Deck testing
│   │       │   └── tournament/   # Tournament management
│   │       ├── services/         # Client-side services
│   │       │   ├── CardParserService.ts
│   │       │   ├── PackGeneratorService.ts
│   │       │   ├── ScryfallService.ts
│   │       │   └── SocketService.ts
│   │       ├── contexts/         # React contexts
│   │       │   ├── GameLogContext.tsx
│   │       │   └── UserContext.tsx
│   │       ├── utils/            # Utility functions
│   │       └── types/            # TypeScript types
│   │
│   ├── server/                   # Node.js backend
│   │   ├── index.ts              # Server entry point
│   │   ├── managers/             # State managers
│   │   │   ├── DraftManager.ts   # Draft state management
│   │   │   ├── GameManager.ts    # Game state management
│   │   │   ├── RoomManager.ts    # Lobby room management
│   │   │   ├── TournamentManager.ts
│   │   │   ├── UserManager.ts    # Auth and user data
│   │   │   ├── PersistenceManager.ts  # Auto-save state
│   │   │   ├── FileStorageManager.ts
│   │   │   └── RedisClientManager.ts
│   │   ├── services/             # Backend services
│   │   │   ├── ScryfallService.ts    # Scryfall API integration
│   │   │   ├── CardService.ts        # Card image/metadata caching
│   │   │   ├── PackGeneratorService.ts
│   │   │   ├── CardParserService.ts
│   │   │   ├── GeminiService.ts      # AI integration
│   │   │   └── BotDeckBuilderService.ts
│   │   ├── game/                 # Game logic
│   │   │   ├── RulesEngine.ts    # MTG rules implementation
│   │   │   └── types.ts
│   │   └── public/               # Server static files
│   │       └── cards/            # Cached card assets
│   │           ├── images/[set]/crop/
│   │           ├── images/[set]/full/
│   │           ├── metadata/[set]/
│   │           └── sets/
│   │
│   ├── prisma/
│   │   └── schema.prisma         # Database schema
│   │
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
│
├── docs/
│   ├── development/
│   │   ├── CENTRAL.md            # Development status summary
│   │   └── devlog/               # Work logs (yyyy-mm-dd-hh24miss_description.md)
│   └── mtg-rulebook/             # MTG rules reference
│
├── helm/mtgate/                  # Kubernetes Helm chart
├── .agent/rules/                 # AI agent instructions
├── .github/workflows/ci.yml      # GitHub Actions CI
├── .gitea/workflows/build.yml    # Gitea CI
├── Dockerfile
├── docker-compose.yml
├── Makefile
└── README.md
```

## Development Commands

All commands run from the project root or `src/` directory:

```bash
# From root (using Makefile)
make install      # Install dependencies
make dev          # Run dev server (frontend + backend)
make dev-server   # Backend only
make dev-client   # Frontend only
make build        # Production build
make start        # Run production server
make clean        # Clean artifacts

# From src/ directory (using npm)
npm install
npm run dev       # Runs both server and client concurrently
npm run server    # Backend with tsx watch
npm run client    # Frontend with Vite
npm run build     # Build for production
npm run start     # Production mode (includes prisma db push)
```

## Database Setup

```bash
cd src
npx prisma generate    # Generate Prisma client
npx prisma db push     # Push schema to database
```

### Database Schema (SQLite)
- **User**: Authentication with username/password
- **SavedDeck**: User's saved decks (JSON cards)
- **MatchRecord**: Game history

## Environment Configuration

Create `src/.env` from `src/.env.example`:

```env
# Required for AI bot features
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.0-flash-lite-preview-02-05
USE_LLM_PICK=true

# Database (auto-configured for Docker)
DATABASE_URL=file:./dev.db

# Redis (REQUIRED for production - stores card metadata indexing)
# Falls back to local FS for development only
REDIS_URL=redis://localhost:6379
```

## Architecture Patterns

### Modular Monolith
The application follows a modular monolith pattern:
- Backend modules communicate through manager classes
- Frontend modules are self-contained feature directories
- Shared types between client and server

### Real-time Communication
Socket.IO handles all real-time features:
- Room management (create, join, leave)
- Draft synchronization (pack passing, card picks)
- Game state updates
- Tournament brackets

### Key Socket Events
| Event | Direction | Purpose |
|-------|-----------|---------|
| `create_room` | Client -> Server | Create new lobby |
| `join_room` | Client -> Server | Join existing lobby |
| `start_draft` | Client -> Server | Begin drafting |
| `pick_card` | Client -> Server | Select a card |
| `draft_update` | Server -> Client | Draft state changed |
| `game_action` | Client -> Server | Game move |
| `game_update` | Server -> Client | Game state changed |

### State Persistence
- `PersistenceManager` auto-saves every 5 seconds
- State survives server restarts
- User reconnection restores their session

## Card & Image Caching Architecture (MANDATORY)

**CRITICAL**: This caching strategy is MANDATORY for all card and token handling. Redis is REQUIRED for production deployments.

### Core Principle: Local Paths Only

**NEVER serve Scryfall URLs directly to clients.** All card and token images MUST use local cached paths.

```
✅ CORRECT: imageUrl = "/cards/images/blb/full/abc123.jpg"
❌ WRONG:   imageUrl = "https://cards.scryfall.io/normal/front/a/b/abc123.jpg"
```

Scryfall URLs are **ONLY** used internally to download images to local cache. They should never appear in:
- Game state (`StrictGameState.cards`)
- Token definitions passed to `ActionHandler.createToken()`
- Any data sent to clients

### Redis Indexing (MANDATORY)

Redis stores all card metadata and indexing. The following Redis structures are used:

| Key Pattern | Type | Purpose |
|-------------|------|---------|
| `set:{code}` | Hash | Card metadata by ID for each set (e.g., `set:blb`) |
| `card_indexes` | Hash | Maps card ID → set code for lookups |
| `sets` | Hash | Set metadata (name, release date, etc.) |

### Local File Structure

```
src/server/public/cards/
├── images/
│   ├── {set}/              # e.g., "blb", "tblb" (token set)
│   │   ├── full/           # Full card images
│   │   │   └── {id}.jpg    # Named by Scryfall ID
│   │   └── crop/           # Art crop images
│   │       └── {id}.jpg
├── metadata/
│   └── {set}/
│       └── {id}.json       # Card metadata JSON
└── sets/
    ├── {set}.json          # Full set card list
    ├── {set}_info.json     # Set metadata
    └── t{set}.json         # Token set card list
```

### Path Generation

`ScryfallService.normalizeCard()` automatically adds local paths:

```typescript
card.local_path_full = `/cards/images/${card.set}/full/${card.id}.jpg`;
card.local_path_crop = `/cards/images/${card.set}/crop/${card.id}.jpg`;
```

### Token Set Naming Convention

Tokens are stored in separate sets with a `t` prefix:
- Main set: `ecl` → Token set: `tecl`
- Main set: `blb` → Token set: `tblb`

This applies to both Redis keys (`set:tecl`) and filesystem paths (`sets/tecl.json`).

### Token Caching Flow

When a game starts:

1. **Fetch tokens**: `scryfallService.getTokensForSet(setCode)` fetches token data (automatically adds `t` prefix)
2. **Download images**: `cardService.cacheImages(tokens)` downloads images to local storage
3. **Cache in game state**: `gameManager.cacheTokensForGame(roomId, setCode, tokens)` stores tokens
4. **Use in effects**: `OracleEffectResolver` finds real tokens from `state.cachedTokens`
5. **Create with local paths**: `ActionHandler.createToken()` uses `local_path_full` only

### On-Demand Token Loading (Fallback)

If game state has no cached tokens when a spell tries to create one, `OracleEffectResolver.findRealToken()` will:

1. **Get set code** from source card (`sourceCard.setCode` or `sourceCard.definition.set`)
2. **Load from filesystem**: Read `sets/t{setCode}.json` synchronously (mirrors Redis)
3. **Normalize paths**: Add `local_path_full` and `local_path_crop` to each token
4. **Cache in game state**: Store in `state.cachedTokens` for subsequent calls

```typescript
// OracleEffectResolver.loadTokensFromCache(setCode)
const tokenSetCode = `t${setCode}`.toLowerCase();
const tokensCachePath = path.join(SETS_DIR, `${tokenSetCode}.json`);
// Read, parse, normalize paths, return tokens
```

This ensures tokens are **always** available even if initial caching was skipped.

### Image URL Resolution Order

In `ActionHandler.createToken()`:

```typescript
// CORRECT - Local paths only
const imageUrl = definition.local_path_full || definition.imageUrl || '/images/token.jpg';
```

### Key Files

| File | Responsibility |
|------|----------------|
| `ScryfallService.ts` | Fetch from API, normalize cards, manage Redis cache |
| `CardService.ts` | Download and cache images to local filesystem |
| `ActionHandler.ts` | Create tokens using local paths only |
| `OracleEffectResolver.ts` | Find real tokens from cached data, **load from filesystem on-demand if missing** |
| `GameManager.ts` | Store cached tokens in game state |

### Enforcement Checklist

When working with cards or tokens:

- [ ] All `imageUrl` fields use local paths (`/cards/images/...`)
- [ ] Scryfall URLs only used in `CardService.cacheImages()` for downloading
- [ ] `local_path_full` and `local_path_crop` are set via `normalizeCard()`
- [ ] Token images are cached before game starts (with on-demand fallback from `sets/t{set}.json`)
- [ ] Redis is used for all metadata lookups (filesystem mirrors Redis for fallback)
- [ ] Token sets use `t` prefix convention (e.g., `tecl` for `ecl` tokens)

## Key Services

### ScryfallService
- Fetches card data and sets from Scryfall API
- **Normalizes cards** with `local_path_full` and `local_path_crop` for local image paths
- Stores metadata in **Redis** (`set:{code}` hashes, `card_indexes` mapping)
- Falls back to filesystem cache (`metadata/{set}/{id}.json`)
- Handles rate limiting and retries
- **Important**: Scryfall URLs are only used internally for downloading - never exposed to clients

### PackGeneratorService
- Generates booster packs from card pools
- Supports multiple distribution modes (Peasant, Chaos, Standard)
- Handles rarity-based pack composition

### RulesEngine
- Implements MTG game rules
- Manages turn phases, priority, and the stack
- Handles card zones (library, hand, battlefield, graveyard, exile)

### GeminiService
- AI-powered draft picks for bots
- Deck building suggestions
- Requires GEMINI_API_KEY

## Code Conventions

### TypeScript
- Strict mode enabled
- ESNext modules with bundler resolution
- Path alias: `@/*` maps to `./client/src/*`

### React
- Functional components with hooks
- Context API for global state (UserContext, GameLogContext)
- Component structure: `modules/[feature]/[Component].tsx`

### Styling
- Tailwind CSS for all styling
- Dark mode theme (slate-900 base)
- Gaming aesthetic with purple/pink accents

### API Routes
- All API endpoints prefixed with `/api/`
- Auth: `/api/auth/register`, `/api/auth/login`
- Cards: `/api/cards/search`, `/api/cards/parse`, `/api/cards/cache`
- Packs: `/api/packs/generate`
- Sets: `/api/sets`, `/api/sets/:code/cards`

## Docker Deployment

```bash
# Build and run with docker-compose
docker-compose up -d

# Services:
# - app: Main application (port 3000)
# - redis: Caching layer

# Volumes:
# - ./server-data: Persistent data (DB, cached images)
# - redis-data: Redis persistence
```

## Documentation Requirements

When making changes, follow these documentation practices:

1. **Work Logs**: Create files in `docs/development/devlog/` using format:
   `yyyy-mm-dd-hh24miss_brief_description.md`

2. **Central Tracker**: Update `docs/development/CENTRAL.md` with links to new devlogs

3. **Code Comments**: Add comments for complex logic, especially in:
   - RulesEngine game logic
   - Socket event handlers
   - Pack generation algorithms

## Testing Considerations

- No test framework currently configured
- Manual testing via the UI
- Bot testing mode: "Solo Draft" with 7 AI players
- Deck tester module for hand simulation

## Common Tasks

### Adding a New Card Feature
1. Update `src/client/src/types/game.ts` if new card properties needed
2. Modify `src/server/services/ScryfallService.ts` for data fetching
3. Update `src/server/game/RulesEngine.ts` for game logic
4. Add UI in `src/client/src/modules/game/`

### Adding a New API Endpoint
1. Add route in `src/server/index.ts`
2. Create service method if needed
3. Add client service call in `src/client/src/services/`

### Modifying Draft Logic
1. `src/server/managers/DraftManager.ts` - Draft state
2. `src/server/services/PackGeneratorService.ts` - Pack creation
3. `src/client/src/modules/draft/DraftView.tsx` - UI

## CI/CD Pipeline

GitHub Actions workflow (`.github/workflows/ci.yml`):
- Triggers on push to `main` and `develop` branches
- Builds Docker image
- Pushes to GitHub Container Registry (ghcr.io)
- Tags: `stable` (main), `latest` (develop), SHA-based

## Important Notes

1. **Card Images**: Cached locally in `src/server/public/cards/`. This directory is gitignored. **NEVER use Scryfall URLs directly** - always use local cached paths.

2. **Database**: SQLite file at `src/dev.db` (dev) or `/app/server-data/mtgate.db` (Docker)

3. **Redis**: **MANDATORY for production**. Redis stores all card metadata indexing (`set:{code}`, `card_indexes`, `sets`). The app can fall back to local filesystem for development only, but Redis is required for proper card/token lookup and caching.

4. **Scryfall API**: Respect rate limits (100ms delay between requests). **Scryfall URLs are ONLY used for downloading images to local cache** - never serve them directly to clients.

5. **Socket.IO Buffer**: Set to 1GB for large pack transfers

6. **PWA**: Application installable as Progressive Web App

7. **Token Images**: When creating tokens programmatically (via `OracleEffectResolver`), always use real Scryfall token data from cached tokens. Token images must be downloaded to local storage before game starts using `cardService.cacheImages()`.
