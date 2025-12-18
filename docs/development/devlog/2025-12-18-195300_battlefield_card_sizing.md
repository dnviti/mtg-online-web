# Battlefield Card Sizing

**Status:** Completed
**Date:** 2025-12-18
**Description:**
Increased the default size of cards on the battlefield to be more visible and responsive.

**Technical Changes:**
- **Frontend (`GameView.tsx`)**: Updated the `CardComponent` within the battlefield render loop to explicitly set `w-32 h-44` (Medium) as the base size, scaling up to `xl:w-40 xl:h-56` (Large) on larger screens. This overrides the default small size (`w-24 h-32`) defined in `CardComponent.tsx`.
