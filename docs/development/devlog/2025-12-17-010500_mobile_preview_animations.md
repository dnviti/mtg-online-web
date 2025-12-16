# Mobile Preview Animations

## Objective
Implement smooth "Phase In" and "Phase Out" animations for the mobile fullscreen card preview to replace the instant appear/disappear behavior.

## Changes
- Modified `src/client/src/components/CardPreview.tsx`:
    - Updated `CardHoverWrapper` to handle component unmounting with a delay (300ms) when the preview should be hidden on mobile.
    - Passed a new `isClosing` prop to `FloatingPreview` during this delay period.
    - In `FloatingPreview` (Mobile View):
        - Added `transition-all duration-300` base classes.
        - Used conditional classes:
            - Entrance: `animate-in fade-in zoom-in-95`
            - Exit: `animate-out fade-out zoom-out-95` (triggered when `isClosing` is true).
    - Fixed syntax errors introduced in previous steps (removed spaces in class names).

## Result
On mobile, the card preview now fades and zooms in smoothly when long-pressed, and fades/zooms out smoothly when released.
