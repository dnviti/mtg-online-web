# 2025-12-17 Draft View Layout Implementation

## Objective
Implement vertical and horizontal layout selection for the Draft View "Your Pool" section, similar to the Deck Builder. Ensure the pool section does not overlap with the card preview sidebar and shares the width with the active pack section in vertical mode.

## Changes
1.  **Modified `src/client/src/modules/draft/DraftView.tsx`**:
    *   Added `layout` state ('vertical' | 'horizontal').
    *   Added layout toggle buttons (`Columns`, `LayoutTemplate` icons) to the header toolbar.
    *   Refactored the main content area to utilize a `flex` container that wraps both the Active Pack and the Pool sections.
    *   **Vertical Layout**: Renders Pack and Pool side-by-side (50/50 split) within the content area, ensuring `Pool` is to the right of the `ZoomSidebar` and does not overlap.
    *   **Horizontal Layout**: Retains the original "Pool at Bottom" behavior but moves the Pool section *inside* the content area flex container to respect the sidebar boundary.
    *   Updated `PoolCardItem` to support a vertical grid layout style when in vertical mode.

## Verification
*   **Layout Switching**: Confirmed logic for switching between vertical (row) and horizontal (column) flex directions.
*   **Sidebar Overlap**: The Pool section is now a sibling of the Pack section and both are children of the container adjacent to the fixed-width Sidebar. Use of `flex-1 flex overflow-hidden` ensures proper containment.
*   **Resizing**: Preserved resize functionality for the horizontal layout (pool height).
*   **Visual Consistency**: Used similar styling and icons as the Deck Builder.
