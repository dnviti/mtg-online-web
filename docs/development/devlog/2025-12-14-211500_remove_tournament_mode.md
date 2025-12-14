# Cleanup: Remove Tournament Mode

## Status: Completed

## Summary
Removed the "Tournament Mode" view and "Editor Mode" toggle from the Cube Manager. The user requested a simplified interface that lists packs without grouping them into "Boxes".

## Changes
1.  **CubeManager.tsx**:
    *   Removed `tournamentMode` state and setter.
    *   Removed usage of `TournamentPackView` component.
    *   Removed the "Tournament Mode / Editor Mode" toggle button.
    *   Simplified rendering to always show the pack list (grid/list/stack view) directly.
    *   Removed unsused `TournamentPackView` import and icon imports.

## Impact
*   The UI is now streamlined for the "Host" to just see generated packs.
*   The `TournamentPackView` component is no longer used but file remains for now.
