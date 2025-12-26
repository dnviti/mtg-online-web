# Fix Opponent Lands and Rotation

**Date:** 2025-12-27
**Status:** Planned
**Description:** Fixing bugs with opponent lands (stacking, hover) and card orientation.

## Issues
1.  **Opponent Lands Bug:** Stacked lands move to the right on hover, breaking the visual layout.
2.  **Rotation:** Opponent cards are rotated 180 degrees (upside down for the user).

## Plan
1.  **Rotation:** Remove `rotate(180deg)` from opponent card styles in `GameView.tsx`.
2.  **Lands Stacking:**
    *   Remove `group-hover:translate-x-4`.
    *   Simplify stacking offsets to be vertical-only or tighter diagonal to prevent "broken" look.
    *   Ensure z-index logic is sound.
