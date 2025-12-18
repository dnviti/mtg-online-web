# Work Plan - Finalize Pool Card Sizing

## Request
The user reported: "cards inside the 'your pool' have not consistent sizes ... and resizing it's height does not change card sizes. card height needs to match the your pool panel size".

## Analysis
The previous logic using `items-center` on the parent and `h-full`/`h-90%` on the child likely led to a broken flexbox behavior where children calculated their own intrinsic height or got stuck at an initial height, and `transition-all` might have added to the confusion or stickiness.

## Changes
- **DraftView.tsx**:
    - Removed `transition-all` from both `PoolDroppable` and `PoolCardItem`. Transitions on layout containers cause jank during drag resize and can block instant reflow.
    - Updated horizontal pool scrolling container:
        - Removed `items-center`. The default behavior aligns items to start, but since we want `h-full` to work, the container just needs to fill space.
        - Changed padding to `pb-2 pt-2` (balanced) instead of `pb-4`.
    - Updated `PoolCardItem` (Horizontal):
        - `className`: Added `h-full`, **removed `items-center`** (moved to centered justify content if needed, but flex default with no items-center is fine). Added `aspect-[2.5/3.5]` to help width calculation. Added `p-2` padding directly to the wrapper to handle spacing, allowing image to be `h-full` within that padded box.
        - Image: Changed to `h-full w-auto object-contain`. Removed `max-h-full` and `h-[90%]`.

## Result
- The `poolRef` div resizes via DOM.
- `PoolDroppable` (flex-1) fills it.
- Scroll container (flex-1) fills it.
- `PoolCardItem` wrapper (h-full) fills 100% of the Scroll container height.
- `PoolCardItem` wrapper padding (`p-2`) creates a safe zone.
- `img` (h-full) fills 100% of the wrapper's content box (calculated as `Total Height - Padding`).
- This guarantees the image height tracks the panel height 1:1.

## Verification
- Dragging the pool resize handle should now smoothly resize the cards in real-time.
- Cards should never be "too big" (overflowing) because they are strictly contained by `h-full` inside the overflow-hidden parents.
- Cards should respect aspect ratio.
