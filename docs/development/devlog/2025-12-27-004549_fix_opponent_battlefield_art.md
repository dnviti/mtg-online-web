# Fix Opponent Battlefield Art

**Date:** 2025-12-27
**Status:** Planned
**Description:** Fixing the issue where opponent creatures on the battlefield are using full art instead of cropped art.

## Plan
1.  Locate `GameView.tsx` and the section rendering opponent creatures in 1v1 mode.
2.  Switch `viewMode` from `"normal"` to `"cutout"`.
3.  This aligns the rendering with the user's expectation and the multiplayer view behavior.
