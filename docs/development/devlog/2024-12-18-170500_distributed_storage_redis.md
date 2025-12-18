
# 2024-12-18 17:05:00 - Distributed Storage with Redis

## Description
Implemented distributed storage using Redis (`ioredis`) to support horizontal scaling and persistence outside of local file systems, while retaining local storage for development.

## Key Changes
1.  **Dependencies**: Added `ioredis` and `@types/ioredis`.
2.  **Redis Manager**: created `RedisClientManager.ts` to manage connections:
    - `db0`: Session Persistence (Rooms, Drafts, Games).
    - `db1`: File Storage (Card Images, Metadata).
    - Enabled via environment variable `USE_REDIS=true`.
3.  **Persistence Manager**: Updated `PersistenceManager.ts` to read/write state to Redis DB 0 if enabled.
4.  **File Storage Manager**: Created `FileStorageManager.ts` to abstract file operations (`saveFile`, `readFile`, `exists`).
    - Uses Redis DB 1 if enabled.
    - Uses Local FS otherwise.
5.  **Card Service**: Refactored `CardService.ts` to use `FileStorageManager` instead of `fs` direct calls.
6.  **Server File Serving**: Updated `server/index.ts` to conditionally serve files:
    - If Redis enabled: Dynamic route intercepting `/cards/*` to fetch from Redis DB 1.
    - If Local: Standard `express.static` middleware.

## Configuration
- `USE_REDIS`: Set to `true` to enable Redis.
- `REDIS_HOST`: Default `localhost`.
- `REDIS_PORT`: Default `6379`.

## Status
- [x] Code implementation complete.
- [ ] Redis functionality verification (requires Redis instance).
