# Card Metadata Enhancement

## Objective
Enhance the Scryfall data fetching and internal card representation to include full metadata (CMC, Oracle Text, Power/Toughness, Collector Number, etc.). This allows strictly precise pack generation and potential future features like mana curve analysis or specific slot targeting.

## Changes
1.  **Updated `ScryfallService.ts`**:
    -   Extended `ScryfallCard` interface to include:
        -   `cmc` (number)
        -   `mana_cost` (string)
        -   `oracle_text` (string)
        -   `power`, `toughness` (strings)
        -   `collector_number` (string)
        -   `color_identity` (string[])
        -   `keywords` (string[])
        -   `booster` (boolean)
        -   `promo`, `reprint` (booleans)
    -   Verified that `fetch` calls already return this data; TS interface update exposes it.

2.  **Updated `PackGeneratorService.ts`**:
    -   Extended `DraftCard` internal interface to include the same metadata fields (normalized names like `manaCost`, `oracleText`).
    -   Updated `processCards` function to map these fields from the Scryfall response to the `DraftCard` object.

## Impact
-   Pack generation now has access to rich metadata.
-   Future-proofs the system for "The List" exact matching (via collector number or promo types) and game logic (CMC sorting).
