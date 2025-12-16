# Plan: Enhance Card Metadata

## Objective
Update Scryfall fetching and parsing logic to include comprehensive metadata for cards. This will enable more precise pack generation algorithms in the future (e.g., filtering by legality, format, artist, or specific frame effects).

## Steps

1.  **Update `ScryfallCard` Interface (`src/client/src/services/ScryfallService.ts`)**
    *   Add fields for `legalities`, `finishes`, `games`, `produced_mana`, `artist`, `released_at`, `frame_effects`, `security_stamp`, `promo_types`.
    *   Define a more robust `ScryfallCardFace` interface.

2.  **Update `DraftCard` Interface (`src/client/src/services/PackGeneratorService.ts`)**
    *   Add corresponding fields to the internal `DraftCard` interface to store this data in the application state.

3.  **Update `PackGeneratorService.processCards`**
    *   Map the new fields from `ScryfallCard` to `DraftCard` during the processing phase.
    *   Ensure `cardFaces` are also mapped correctly if present (useful for Flip cards where we might want front/back info).

4.  **Verification**
    *   Build the project to ensure no type errors.
    *   (Optional) Run a test script or verify in browser if possible, but static analysis should suffice for interface updates.
