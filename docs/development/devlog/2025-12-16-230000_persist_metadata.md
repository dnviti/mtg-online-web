# Plan: Persist Scryfall Metadata

## Objective
Persist fetched Scryfall card metadata in the browser's IndexedDB. This ensures that:
1.  Metadata (including the newly added rich fields) is saved across sessions.
2.  Pack generation can rely on this data without re-fetching.
3.  The application works better offline or with poor connection after initial fetch.

## Implementation Steps

1.  **Create `src/client/src/utils/db.ts`**
    *   Implement a lightweight IndexedDB wrapper.
    *   Database Name: `mtg-draft-maker`
    *   Store Name: `cards`
    *   Methods: `putCard`, `getCard`, `getAllCards`, `bulkPut`.

2.  **Update `ScryfallService.ts`**
    *   Import the DB utilities.
    *   In `constructor` or a new `initialize()` method, load all persisted cards into memory (`cacheById` and `cacheByName`).
    *   In `fetchCollection`, `fetchSetCards`, etc., whenever cards are fetched from API, save them to DB via `bulkPut`.
    *   Modify `fetchCollection` to check memory cache (which is now pre-filled from DB) before network.

3.  **Refactor `fetchCollection` deduplication**
    *   Since cache is pre-filled, the existing check `if (this.cacheById.has(...))` will effectively check the persisted data.

## Verification
*   Reload page -> Check if cards are loaded immediately without network requests (network tab).
*   Check Application -> Storage -> IndexedDB in browser devtools (mental check).
