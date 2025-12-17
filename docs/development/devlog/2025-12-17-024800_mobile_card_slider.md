# Mobile Card Size Slider

## Status
- [x] Locate the card size slider component (`CubeManager` and `DraftView`)
- [x] Analyze why it is hidden on small screens (`hidden` utility classes)
- [x] Modify layout to ensure it is visible on mobile
- [x] Determine if layout adjustments are needed (Reduced width on `DraftView`)
- [x] Verify implementation (Code applied)

## Context
User reported that the card size adjustment bar is missing on small screens.
The fix was applied to both the Cube Manager (pack review) and Draft View (live drafting).

## Changes
- **CubeManager.tsx**: Removed `hidden sm:flex` from the slider container. It is now always `flex`.
- **DraftView.tsx**: Removed `hidden md:flex` and adjusted width to `w-24 md:w-32` to fit better on small screens.
