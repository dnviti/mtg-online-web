# Work Plan - Optimize Resize Performance

## Request
The user reported that the resize functionality was laggy, slow, and inconsistent.

## Changes
- **Refactoring Strategy**:
    - Removed React state updates from the `mousemove` event loop.
    - Used `useRef` to track `sidebarWidth` and `poolHeight` values.
    - Used `requestAnimationFrame` to throttle DOM updates directly during resizing.
    - Only triggered React state updates (re-renders) on `mouseup`.

- **DraftView.tsx**:
    - Implemented `resizingState` ref.
    - Modified `handleMouseDown` to initiate direct DOM resizing.
    - Modified `onMouseMove` to update element styles directly.
    - Modified `onMouseUp` to sync final size to React state.
    - Applied refs to Sidebar and Pool resizing areas.

- **DeckBuilderView.tsx**:
    - Implemented identical ref-based + requestAnimationFrame resizing logic.
    - Fixed several HTML nesting errors introduced during the complex refactoring process.

## Verification
- **Performance**: Resizing should now be smooth (60fps) as it avoids React reconciliation during the drag.
- **Consistency**: The handle should no longer "slip" because the visual update is faster.
- **Persistence**: The final size is still saved to `state` (and thus `localStorage`) after release.
