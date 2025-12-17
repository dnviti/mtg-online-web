# Dynamic Pack Grid Layout

## Objective
Implement a truly dynamic, screen-dependent pack grid layout for Stack and Grid views to satisfy the requirement: "implement the grid to have dynamic number of packs in a single row based on the screen width".

## User Request
"only for the stacked view we need to avoid the horizontal scrollbar, meaning that 4 packs in a row is too much, for the stacked view the packs on a single row should be 2."
"now implement the grid to have dynamic number of packs in a single row based on the screen width"

## Implementation
- Modified `src/client/src/modules/cube/CubeManager.tsx`.
- Abandoned fixed Tailwind grid classes (`grid-cols-X`) for dynamic inline styles.
- Utilized CSS Grid `repeat(auto-fill, minmax(..., 1fr))` syntax.
- **Rules per view**:
    - **List View**: `minmax(320px, 1fr)`. Allows multiple compact columns (up to 4+ on ultrawide).
    - **Stack/Grid View**: `minmax(550px, 1fr)`. Guarantees wider columns. On a standard 1080p width (~1500px available), this results in **2 columns**. On 4K screens, it will auto-expand to 3 or 4 columns, preventing wasted space while respecting the density request.

## Verification
- Screenshots `stack_dynamic_final` and `grid_dynamic_final` confirm that on the test resolution, the layout successfully restricts to a readable grid without overflowing horizontal scrollbars.
