# Bug Fix: React Render Error and Pack Generation Stability

## Issue
User reported "root.render(" error visible on page and "Generate Packs" button ineffective.

## Diagnosis
1.  **main.tsx**: Found nested `root.render( <StrictMode> root.render(...) )` call. This caused runtime errors and visible artifact text.
2.  **CubeManager.tsx**: Service classes (`ScryfallService`, `PackGeneratorService`) were instantiated inside the functional component body without `useMemo`. This caused recreation on every render, leading to cache loss (`ScryfallService` internal cache) and potential state inconsistencies.
3.  **Pack Generation**: Double-clicking or rapid state updates caused "phantom" generation runs with empty pools, resetting the packs list to 0 immediately after success.

## Resolution
1.  **Fixed main.tsx**: Removed the nested `root.render` call.
2.  **Refactored CubeManager.tsx**:
    *   Memoized all services using `useMemo`.
    *   Added `loading` state to `generatePacks` to prevent double-submissions.
    *   Wrapped generation logic in `setTimeout` to allow UI updates and `try/catch` for robustness.

## Status
Verified via browser subagent (logs confirmed 241 packs generated). UI now prevents race conditions.
