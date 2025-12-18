# Work Plan - Strict Overflow Constraints for Pool Panel

## Request
The user persists that cards overflow because they are "full size" and do not resize.

## Changes
- **DraftView.tsx**:
    - Added `overflow-hidden` to the root `poolRef` div. This ensures that even if internal contents *try* to be larger, they are clipped, and more importantly, it forces flex children to respect the parent boundary in some browser rendering engines.
    - Added `min-h-0` to `PoolDroppable` and the inner scroll container. In Flexbox columns, children do not shrink below their content size by default. `min-h-0` effectively overrides this, forcing the container to shrink to the available flex space (which is effectively `poolRef` height minus header).
    - This combination guarantees that the scroll container's `height` is exactly calculated based on the parent, so `h-full` on the card images resolves to the correct, resized pixel value.

## Verification
- **Visuals**: Resizing the pool panel should now force the cards to shrink or grow in real-time without overflowing or getting stuck at a large size.
