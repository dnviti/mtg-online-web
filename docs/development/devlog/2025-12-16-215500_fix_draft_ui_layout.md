# Fix Draft UI Layout Consistency

## Objective
Fix the layout inconsistency where the "Waiting for next pack..." screen and other views in the Draft interface do not fully occupy the screen width, causing the UI to look collapsed or disconnected from the global sidebars.

## Changes
1.  **DraftView.tsx**: Added `flex-1` and `w-full` to the root container. This ensures the component expands to fill the available space in the `GameRoom` flex container, maintaining the full-screen layout even when content (like the "waiting" message) is minimal.
2.  **DeckBuilderView.tsx**: Added `flex-1` and `w-full` to the root container for consistency and to ensure the deck builder also behaves correctly within the main layout.

## Verification
-   The `DraftView` should now stretch to fill the area between the left edge (or internal Zoom sidebar) and the right Lobby/Chat sidebar in `GameRoom`.
-   The "Waiting for next pack..." message will remain centered within this full-height, full-width area, with the background gradient covering the entire zone.
