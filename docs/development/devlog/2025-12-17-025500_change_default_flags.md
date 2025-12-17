
# 2025-12-17 Change Default Filter Flags

## Objective
Change the default state of the "Ignore Basic Lands", "Ignore Commander Sets", and "Ignore Tokens" flags from checked (true) to unchecked (false) to match user preference.

## Changes
1.  **Client-Side (`src/client/src/modules/cube/CubeManager.tsx`)**:
    *   Updated the initial state of the `filters` object.
    *   The defaults for `ignoreBasicLands`, `ignoreCommander`, and `ignoreTokens` are now `false`.
    *   This affects new users or sessions where `localStorage` does not have saved preferences.

2.  **Server-Side (`src/server/index.ts`)**:
    *   Updated the default fallback values for `filters` in the `/api/packs/generate` route.
    *   If no filters are provided in the request payload, the server now defaults these flags to `false`.

## Verification
*   Verified that the variable names match the UI labels.
*   Verified that the logic correctly implements "unchecked" by setting the boolean values to `false`.
