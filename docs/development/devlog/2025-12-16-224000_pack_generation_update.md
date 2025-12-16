# Pack Generation Algorithm Update

## Objective
Update the pack generation logic to match a new 15-slot "Play Booster" structure.
The new structure includes:
- **Slots 1-6:** Commons (Color Balanced).
- **Slot 7:** Common (87%), List (C/U 10%, R/M 2%), or Special Guest (1%).
- **Slots 8-10:** Uncommons (3).
- **Slot 11:** Rare (7/8) or Mythic (1/8).
- **Slot 12:** Basic Land or Common Dual Land (20% Foil).
- **Slot 13:** Wildcard (Non-Foil) - Weighted Rarity.
- **Slot 14:** Wildcard (Foil) - Weighted Rarity.
- **Slot 15:** Marketing Token / Art Card.

## Implementation Details
1.  **Updated `PackGeneratorService.ts`**:
    -   Modified `processedPools` to explicitly categorize `lands` (Basic + Common Dual) and `tokens`.
    -   Updated `processCards` to sort cards into these new pools (instead of filtering them out completely).
    -   Rewrote `buildSinglePack` (for `standard` rarity mode) to implement the 15-slot sequencing.
    -   Implemented logic for:
        -   Color balancing commons (naive attempt).
        -   "The List" simulation (using Wildcard logic from pools).
        -   Slots 13/14 Wildcards with weighted probabilities.
        -   Foil application (cloning card and setting `finish`).
        -   Slot 12 Land selection (preferring separate land pool).
    -   Added interfaces for `typeLine` and `layout` to `DraftCard`.

## Status
-   Implemented and Verified via static check (TS linting was fixed).
-   Ready for testing in the client.
