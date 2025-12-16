# Mobile Long-Press Card Preview

## Objective
Enhance mobile usability by allowing users to view a magnified card preview upon long-pressing (500ms) a card, instead of hover (which is disabled on mobile).

## Changes
- Modified `src/client/src/components/CardPreview.tsx`:
    - Updated `CardHoverWrapper` to include `touchstart`, `touchend`, and `touchmove` handlers.
    - Implemented a 500ms timer on touch start.
    - Added logic to cancel the long-press if the user drags/scrolls more than 10 pixels.
    - Added `onContextMenu` handler to prevent the default browser menu when a long-press triggers the preview.
    - Updated render condition to show preview if `isHovering` (desktop) OR `isLongPressing` (mobile).

## Result
On mobile devices, users can now press and hold on a card to see the full-size preview. Lifting the finger or scrolling hides the preview.
