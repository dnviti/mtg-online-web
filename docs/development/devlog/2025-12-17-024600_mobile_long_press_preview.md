# Mobile Long Press Card Preview

## Status
- [x] Research current implementation of `PackCard` and `CardPreview`
- [x] Implement long-press detection in `PackCard` (Found existing implementation in `CardPreview`)
- [x] Prevent default browser context menu on card images
- [x] Trigger preview on long-press only for small screens (or generally if touch)
- [x] Verify implementation

## Context
User reported that long-pressing a card on mobile opens the browser menu (download image context menu).
Goal: Long press should show the card preview instead.

## Implementation Details
- Modified `CardHoverWrapper` in `CardPreview.tsx` to prevent `contextmenu` event default behavior on mobile devices when an image is present.
- This ensures the custom long-press timer has time to trigger the preview without the system menu interfering.
- Logic uses `isMobile && hasImage` to target specific scenario.
