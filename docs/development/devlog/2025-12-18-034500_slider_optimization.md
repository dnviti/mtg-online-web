# Work Plan - Optimize Card Slider Performance

## Request
The user reported that resize handlers (likely sliders) were still laggy.

## Changes
- **DraftView.tsx**:
    - Introduced `localCardScale` for immediate slider feedback.
    - Used CSS Variable `--card-scale` on container to update card sizes entirely via CSS during drag.
    - Deferred `cardScale` state update (which triggers React re-renders) to `onMouseUp`.

- **DeckBuilderView.tsx**:
    - Introduced `localCardWidth` for immediate slider feedback.
    - Used CSS Variable `--card-width` on container.
    - Updated `gridTemplateColumns` to use `var(--card-width)`.
    - Deferred `cardWidth` state update to `onMouseUp`.
    - Cleaned up duplicate state declarations causing lint errors.

- **CubeManager.tsx**:
    - Introduced `localCardWidth` and CSS Variable `--card-width`.
    - Updated Grid layout to use CSS Variable.
    - Deferred state update to `onMouseUp`.

## Verification
- **Performance**: Slider dragging should now be 60fps smooth as it touches 0 React components during the drag, only updating a single CSS variable on the root container.
- **Persistence**: Releasing the slider saves the value to state and localStorage.
- **Logic**: complex logic like `useArtCrop` (which depends on specific widths) updates safely on release, preventing flicker or heavy recalculations during drag.
