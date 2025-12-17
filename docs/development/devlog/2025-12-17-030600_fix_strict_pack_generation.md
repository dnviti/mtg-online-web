# Strict Pack Generation Logic Fix

## Objective
Fix the pack generation algorithm to strictly enforce pack sizes and composition rules. Ensure that "Standard" packs have exactly 14 cards and "Peasant" packs have exactly 13 cards. Any generation attempt that fails to meet these criteria due to card depletion must result in the termination of the generation process for that set, rather than producing partial/invalid packs.

## Current Issues
1. **Partial Packs**: The current generator continues to produce packs even when specific rarity pools (like Rares for Standard) are depleted, resulting in packs with fewer than the required number of cards.
2. **Fallbacks**: The logic currently "falls back" to lower rarities (e.g., Common instead of List/Wildcard) to fill slots, which might violate "Strict" adherence if not desired.
3. **Size limit**: Packs are not strictly truncated or validated against the target size (14 or 13).

## Proposed Changes
### `PackGeneratorService.ts`
1. **Refactor `buildSinglePack`**:
    - define `targetSize` based on `rarityMode` (14 for Standard, 13 for Peasant).
    - **Slot 7 (List)**: Remove fallback to Common if Uncommon/List pool is empty. If the strict RNG calls for a List card and none are available, the slot remains empty (causing validation failure).
    - **Wildcards**: Remove fallback to Common if the rolled rarity pool is empty.
    - **Peasant Isolation**: Explicitly restrict Peasant Wildcards to Common/Uncommon only (No Rares/Mythics under any RNG circumstance).
    - **Strict Validation**: At the end of pack construction, check if `packCards.length` is less than `targetSize`. If so, return `null`.
    - **Truncation**: Slice the `packCards` array to `targetSize` to ensure no "exceeding" cards (like Tokens or extra Wildcards) are included beyond the strict limit.

2. **Algorithm Details**:
    - **Standard**: 14 Cards.
        - Slots 1-6: Commons
        - Slot 7: Common/List
        - Slots 8-10: Uncommons
        - Slot 11: Rare/Mythic
        - Slot 12: Land
        - Slot 13: Wildcard
        - Slot 14: Foil Wildcard
        - (Slot 15 Token ignored/truncated)
    - **Peasant**: 13 Cards.
        - Slots 1-6: Commons
        - Slot 7: Common/List
        - Slots 8-11: Uncommons
        - Slot 12: Land
        - Slot 13: Wildcard (Common/Uncommon ONLY)
        - (Slot 14 Foil WC ignored/truncated)
        - (Slot 15 Token ignored/truncated)

3. **Behavior**:
    - If `buildSinglePack` returns `null`, the `generatePacks` loop will `break` (stop), preventing the creation of any further illegal packs from that pool.

## Verification
- Run `npm run build` to ensure compilation.
- (Manual) Verify in Draft App that generating from a small pool stops correctly when Rares run out.
