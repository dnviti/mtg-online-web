# Cube Manager Sticky Sidebar

## Objective
Update the `CubeManager` layout to make the left-side settings/controls panel sticky. This allows the user to access controls (Generate, Reset, etc.) while scrolling through a long list of generated packs on the right.

## Changes
- Modified `src/client/src/modules/cube/CubeManager.tsx`:
    - Added `sticky top-4` to the left column wrapper.
    - Added `self-start` to ensure the sticky element doesn't stretch to the full height of the container (which would negate stickiness).
    - Added `max-h-[calc(100vh-2rem)]` and `overflow-y-auto` to the left panel to ensure its content remains accessible if it exceeds the viewport height.
    - Added `custom-scrollbar` styling for consistent aesthetics.

## Result
The left panel now follows the user's scroll position, improving usability for large pack generations.
