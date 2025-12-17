# Fix Cube Manager Sidebar Scrolling on Tablets

## Context
The user reported an issue on small tablet screens where the sticky sidebar in the Pack Generation UI (Cube Manager) cannot be scrolled to the bottom. The `max-height` of the sidebar was set to `100vh - 2rem`, which exceeds the actual visible viewport height when accounting for the application header (and potentially browser bars), causing the bottom of the sidebar (containing the critical "Generate Packs" button) to be clipped and inaccessible without scrolling the main page.

## Changes
- Modified `src/client/src/modules/cube/CubeManager.tsx` to adjust the sidebar `max-height`.
- Changed `lg:max-h-[calc(100vh-2rem)]` to `lg:max-h-[calc(100vh-10rem)]`.
- This calculation (~ 10rem) accounts for the header height (approx 5-6rem), footer height (approx 2.5rem), and margins, ensuring the sidebar fits completely within the visible viewport.
- This ensures the `overflow-y-auto` property on the sidebar triggers correctly, allowing autonomous scrolling of the configuration panel regardless of the main page scroll position.

## Verification
- Verified layout structure in `App.tsx` and proper nesting.
- The change applies to `lg` screens (desktop and horizontal tablet), where the sidebar is displayed as a sticky column.
