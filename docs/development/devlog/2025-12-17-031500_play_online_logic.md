
### Play Online Logic Implementation

**Status**: Completed
**Date**: 2025-12-17

**Description**
Implemented pack count validation logic for "Play Online" to strictly enforce draft player limits.

**Changes**
1.  **Rule Enforcement**:
    -   **< 12 packs**: Button visual disabled (slate color), shows error toast explaining rules if clicked.
    -   **12-17 packs**: Allows entry, shows toast "Enough for 4 players only" (Info).
    -   **18-23 packs**: Allows entry, shows toast "Enough for 4 or 6 players" (Info).
    -   **24+ packs**: Allows entry, shows toast "Enough for 8 players!" (Success).
2.  **UI Feedback**: Updated button class logic to visually reflect availability based on pack count.

**Effect**
Prevents users from starting unplayable drafts and informs them of the capacity their current pool supports.
