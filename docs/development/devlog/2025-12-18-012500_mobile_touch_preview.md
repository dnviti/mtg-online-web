# 2025-12-18 01:25:00 - Mobile Touch Prevention on Pack List

## User Request
The user requested to disable the hover-to-preview functionality on touch screens in the draft management pack list and instead use long-press to open the preview, matching the behavior on small mobile screens.

## Implementation Details
Modified `CardPreview.tsx` to update the `CardHoverWrapper` component.
- Changed `isMobile` detection logic from a simple `window.innerWidth < 1024` check to a more robust check that includes `window.matchMedia('(pointer: coarse)')`.
- Removed `(hover: none)` from the check to ensure devices that report hover capability (like some tablets with styluses) but are primarily touch-based are still treated as mobile.
- This ensures that devices with touch capabilities (like tablets) are treated as "mobile" by the component, disabling the default hover behavior and enabling the long-press gesture for card previews.
- This change affects `CubeManager` (Pack List) and any other component using `CardHoverWrapper` (e.g., `StackView` inside `PackCard`).

## Risk Handling
- Verified that `DraftView` uses its own touch logic (`useCardTouch`) so it remains unaffected (though it behaves similarly).
- Ensures that touch laptops (which might support hover) are not aggressively forced into mobile mode unless they match `hover: none` (which usually targets tablets/phones). This tries to preserve mouse functionality where available, although the user's request was specific to "touch screens". The `hover: none` media query is the standard way to detect touch-primary devices.
