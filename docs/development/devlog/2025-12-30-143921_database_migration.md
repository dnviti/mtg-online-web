# Database Migration to SQLite/Prisma

**Date**: 2025-12-30
**Status**: Completed

## Objective
Migrate the persistence layer from flat JSON files (`server-data/*.json`) to a local SQLite database using Prisma.

## Accomplished
1.  **Schema Defined**: `Card`, `Set`, `Draft`, `Game`, `Room` tables created in `src/prisma/schema.prisma`.
2.  **Migration Applied**: `init_core_tables` applied.
3.  **Persistence Updated**: `PersistenceManager` now uses `prisma.*` methods.
4.  **Seeding**: Scryfall data imported via `scripts/seed_from_json.ts`.
5.  **Automation**: `package.json` scripts updated to automatically run `prisma migrate deploy` on startup.

## Details
- `Card` table stores only essential columns, using JSON string fields for complex data (`image_uris` etc).
- `Draft` state is stored as a JSON blob in the database for flexibility while allowing ID-based lookups.
- Startup commands (`npm run server`, `npm run start`) now ensure the DB is present and migrated before launching the app.
