
### Animated Copy Button

**Status**: Completed
**Date**: 2025-12-17

**Description**
Replaced the toast notification for the copy action with a self-contained, animated button state.

**Changes**
1.  **Removed Toast Usage**: Detached `useToast` from `PackCard.tsx`.
2.  **Local State**: Implemented `copied` state in `PackCard`.
3.  **UI Feedback**:
    -   Button transitions from "Copy" (slate) to "Check" (emerald/green) on click.
    -   Added `animate-in zoom-in spin-in-12` for a satisfying "tick" animation.
    -   Button background and border glow green to confirm success.
    -   Auto-reverts after 2 seconds.

**Effect**
Provides immediate, localized feedback for the copy action without clogging the global UI with notifications.
