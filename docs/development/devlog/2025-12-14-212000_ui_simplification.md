# Enhancement: UI Simplification for Set Generation

## Status: Completed

## Summary
Refined the Cube Manager UI to hide redundant options when generating packs from an entire expansion set.

## Changes
1.  **CubeManager.tsx**:
    *   **Conditional Rendering**: The "Card Source" options (Chaos Draft vs Split by Expansion) are now **hidden** when "From Expansion" mode is selected.
    *   **Automatic State Handling**:
        *   Selecting "From Expansion" automatically sets generation mode to `by_set`.
        *   Selecting "Custom List" resets generation mode to `mixed` (user can still change it).
    *   **Rationale**: Using an entire set implies preserving its structure (one set), whereas a custom list is often a cube (chaos) or a collection of specific sets where the user might want explicitly mixed packs.

## Impact
*   Reduces visual noise for the user when they simply want to draft a specific set.
*   Prevents invalid configurations (e.g., selecting "Chaos Draft" for a single set, which technically works but is confusing in context of "Set Generation").
