# Plan: Full Metadata Passthrough

## Objective
Ensure that the `DraftCard` objects used throughout the application (and eventually sent to the backend) contain the **complete** original metadata from Scryfall. The user has explicitly requested access to "all cards informations" for future algorithms.

## Steps

1.  **Update `ScryfallService.ts`**
    *   Add an index signature `[key: string]: any;` to the `ScryfallCard` interface. This acknowledges that the object contains more fields than strictly typed, preventing TypeScript from complaining when accessing obscure fields, and correctly modeling the API response.

2.  **Update `PackGeneratorService.ts`**
    *   Add `sourceData: ScryfallCard;` (or similar name like `scryfallData`) to the `DraftCard` interface.
    *   In `processCards`, assign the incoming `cardData` (the full Scryfall object) to this new property.

## Impact
*   **Data Size**: Payload size for rooms will increase, but this is acceptable (and requested) for the richness of data required.
*   **Flexibility**: Future updates to pack generation (e.g., checking specific `frame_effects` or `prices`) will not require interface updates; the data will already be there in `card.sourceData`.

## Verification
*   The valid "Parse Bulk" operation will now produce `DraftCard`s that, if inspected, contain the full Scryfall JSON.
