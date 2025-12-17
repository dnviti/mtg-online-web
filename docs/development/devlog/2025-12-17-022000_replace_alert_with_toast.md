
### Replaced Alert with Toast Notification

**Status**: Completed
**Date**: 2025-12-17

**Description**
Replaced the invasive `alert()` on the "Copy Pack" button with a non-intrusive Toast notification.

**Changes**
1. Created `src/client/src/components/Toast.tsx` with a `ToastProvider` and `useToast` hook.
2. Wrapped `App.tsx` with `ToastProvider`.
3. Updated `PackCard.tsx` to use `showToast` instead of `alert`.

**Next Steps**
- Consider replacing other alerts in `CubeManager` with Toasts for consistency.
