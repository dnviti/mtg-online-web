# Work Plan - Fix Sidebar Resize Animation Lag

## Request
The user reported that the left sidebar resize was laggy because of an animation.

## Changes
- **DraftView.tsx**:
    - Identified that `transition-all` class was present on the sidebar container.
    - Removed `transition-all` class. This class forces the browser to interpolate the width over 300ms every time javascript updates it (60 times a second), causing severe visual lag and "fighting" between the cursor and the element.
    - Verified that resize logic uses the previously implemented `requestAnimationFrame` + `ref` approach, which is optimal.

- **DeckBuilderView.tsx**:
    - Verified that no `transition` class was present on the corresponding sidebar element.

## Verification
- **Performance**: Sidebar resizing should now be instant and track the mouse 1:1 without "slipping" or lag.
