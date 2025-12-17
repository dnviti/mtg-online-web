# Refined Preview Suppression

## Objective
Tune the "Smart Preview Suppression" logic to better align with the Stack View's behavior. In Stack View, hovering a card causes it to "pop" to the front (`z-index` shift), making the card fully visible in-place. Because of this, showing a floating preview is redundant and distracting once the card is large enough to be read directly.

## Changes
- Modified `handleMouseEnter` in `src/client/src/components/CardPreview.tsx`:
    - Lowered the suppression threshold from `>240x300` to `>200x270`.
    - **Logic**:
        - Cards sized via the slider to be larger than **200px** wide are now considered "readable" (especially since the 'Art Crop' mode turns off at 170px, leaving a range of 170-199 where preview is explicitly ON for text, and 200+ where it's suppressed).
        - This effectively disables the popup in Stack View for medium-to-large settings, relying on the native "pop-to-front" hover effect for inspection.

## Result
A cleaner, less jittery drafting experience where large cards simply "lift up" for inspection, while smaller cards still get the helpful magnified popup.
