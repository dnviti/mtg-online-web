# Resizable Draft Interface

## Status
- [x] Implement resizable bottom "Pool" panel.
- [x] Implement resizable card size slider.
- [x] Persist settings to `localStorage`.

## Technical Plan

### `src/client/src/modules/draft/DraftView.tsx`

1.  **State Initialization**:
    -   `poolHeight`: number (default ~220). Load from `localStorage.getItem('draft_poolHeight')`.
    -   `cardScale`: number (default 1 or specific width like 224px). Load from `localStorage.getItem('draft_cardScale')`.

2.  **Resize Handle**:
    -   Insert a `div` cursor-row-resize between the Main Area and the Bottom Area.
    -   Implement `onMouseDown` handler to start dragging.
    -   Implement `onMouseMove` and `onMouseUp` on the window/document to handle the resize logic.

3.  **Card Size Control**:
    -   Add a slider (`<input type="range" />`) in the Top Header area to adjust `cardScale`.
    -   Apply this scale to the card images/containers in the Main Area.

4.  **Persistence**:
    -   `useEffect` hooks to save state changes to `localStorage`.

5.  **Refactoring Styling**:
    -   Change `h-[220px]` class on the bottom panel to `style={{ height: poolHeight }}`.
    -   Update card width class `w-56` to dynamic style or class based on scale.

## UX Improvements
-   Add limit constraints (min height for pool, max height for pool).
-   Add limit constraints for card size (min visible, max huge).
