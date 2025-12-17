# Intelligent Preview Suppression

## Objective
Prevent the card preview popup from appearing when the user hovers over a card that is already displayed at a significantly large size on the screen (e.g., in a large grid view), reducing UI clutter.

## Changes
- Modified `CardHoverWrapper` in `src/client/src/components/CardPreview.tsx`:
    - Updated `handleMouseEnter` to inspect the dimensions of the hovered element using `getBoundingClientRect`.
    - Implemented a threshold check: `Width > 240px` AND `Height > 300px`.
    - **Logic**:
        - **Large Grid Items**: If a card in the grid is rendered wider than 240px and taller than 300px, the hover preview is suppressed.
        - **List Items**: Even if a list row is wide (e.g., 800px), its height is small (e.g., 40px), so the preview **will still appear**.
        - **Small Thumbnails**: Small grid items or stack views usually fall below this threshold, ensuring the preview appears when needed.

## Result
The system now intelligently hides the preview when it is redundant, creating a cleaner experience on large desktop screens while maintaining necessary functionality for smaller thumbnails and list views.
