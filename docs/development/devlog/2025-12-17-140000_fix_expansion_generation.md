# Fix Expansion Pack Generation (Infinite Cards)

## Problem
The user reported two issues with "From Expansion" pack generation:
1. Incorrect amount of packs generated (e.g., 10 instead of 36).
2. The generator was using a finite pool of cards (like a custom cube) instead of an infinite supply (like opening fresh packs).

## Root Cause
The `PackGeneratorService` defaults to generating packs without replacement (`withReplacement: false`). This means once a card is used, it is removed from the pool.
For a standard set (Expansion), the pool contains only one copy of each card (from Scryfall fetch).
When generating a large number of packs (e.g., 36 for a box), the rare/mythic/uncommon pools would deplete quickly, causing the generator to stop early and produce fewer packs than requested.

## Solution
Modified `src/server/index.ts` to enforce `settings.withReplacement = true` when `sourceMode === 'set'`.
This ensures that:
- The pack generator refreshes the card pools for every new pack.
- Generating 36 packs (or any number) is possible even from a single set of source cards.
- Duplicates are allowed across packs (simulating a print run), while maintaining uniqueness within a single pack (handled by `buildSinglePack`).

## Changes
- **File**: `src/server/index.ts`
- **Logic**: Added a check in the `/api/packs/generate` route to set `settings.withReplacement = true` if `sourceMode === 'set'`.
