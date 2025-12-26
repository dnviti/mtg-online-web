# Fix Opponent Lands and Rotation (Refined)

**Date:** 2025-12-27
**Status:** In Progress
**Description:** Refined goal to match opponent land stacking *exactly* to player land stacking.

## Updates
User feedback indicates the previous fix was insufficient. They want exact parity.

## Revised Plan
1.  **Refactor Opponent Lands Loop:**
    - Mirror the structure of the player's land loop (lines 1216-1238).
    - Use container `div` with calculated height: `96 + (group.length - 1) * 25`.
    - Position inner cards with `top: index * 25`.
    - Use `width: 24` (tail wind `w-24`) to match.
