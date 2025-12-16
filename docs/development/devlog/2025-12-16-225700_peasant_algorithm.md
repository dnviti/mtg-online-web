# Peasant Algorithm Implementation

## Overview
Implemented the detailed "Peasant" pack generation algorithm in `PackGeneratorService.ts`.

## Changes
- Updated `buildSinglePack` in `PackGeneratorService.ts` to include specific logic for Peasant rarity mode.
- Implemented slot-based generation:
    - Slots 1-6: Commons (Color Balanced)
    - Slot 7: Common or "The List" (Simulated)
    - Slots 8-11: Uncommons
    - Slot 12: Land (20% Foil)
    - Slot 13: Non-Foil Wildcard (Weighted by rarity)
    - Slot 14: Foil Wildcard (Weighted by rarity)
    - Slot 15: Marketing Token

## Notes
- Used existing helper methods `drawColorBalanced` and `drawUniqueCards`.
- Simulated "The List" logic using available Common/Uncommon pools as exact "The List" metadata might not be available in standard pools provided to the generator.
- Wildcard weights follow the specification (~49% C, ~24% U, ~13% R, ~13% M).
