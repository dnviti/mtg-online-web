
# 2025-12-17 Left Sidebar Max Width

## Objective
Limit the left sidebar in the Cube Manager to a maximum width of 400px on large screens to prevent it from becoming excessively wide on high-resolution displays.

## Changes
1.  **Layout Refactor (`src/client/src/modules/cube/CubeManager.tsx`)**:
    *   Change the main container from a CSS Grid (`grid-cols-12`) to a Flexbox layout (`flex-col lg:flex-row`).
    *   Set the left column width to `lg:w-1/3` with a strict `lg:max-w-[400px]` constraint.
    *   Set the right column to `flex-1` to take up remaining space.

## Rationale
The previous `lg:col-span-4` (33% width) scaled indefinitely on large screens (e.g., 2560px wide -> ~850px sidebar), which wastes space and stretches control inputs. A max-width constraint ensures the controls remain compact while the main content area (packs display) benefits from the extra screen real estate.
