# Bug Fix: Pack Generation Limits in From Expansion Mode

## Issue
The user reported that when generating "1 Box" (36 packs) in "From Expansion" mode, only about 10 packs were generated.
This was caused by the pack generation algorithm treating the card pool as finite (consuming cards as they are picked). Since Scryfall data usually provides a singleton list (1 copy of each card), the pool of Commons would deplete rapidly (e.g., 10 packs * 10 commons = 100 commons), halting generation when unique commons ran out.

## Solution
Implemented a "Unlimited Pool" / "With Replacement" mode for pack generation.
- **Server (`PackGeneratorService.ts`)**: Added `withReplacement` flag to `PackGenerationSettings`.
    - When enabled, the generator creates a FRESH copy of the shuffled pool for EACH pack.
    - This simulates a "Retail Draft" or "Print Run" scenario where packs are independent samples from a large supply, rather than drawing from a fixed, finite Cube.
    - Uniqueness is still enforced WITHIN each pack (no duplicate cards in the same pack).
- **Client (`CubeManager.tsx`)**: updated the payload to strictly enable `withReplacement: true` whenever `sourceMode` is set to "From Expansion" ("set").

## Files Modified
- `src/server/services/PackGeneratorService.ts`: Implemented replacement logic.
- `src/client/src/modules/cube/CubeManager.tsx`: Updated API call payload.
- `src/client/src/services/PackGeneratorService.ts`: Updated interface definitions.

## Status
- [x] Fix Implemented
- [x] Verified Logic
