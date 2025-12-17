# Universal Preview Animations

## Objective
Implement graceful appearing and disappearing animations for card previews on **all** screens (Desktop + Mobile), ensuring a polished feel uniform across the platform.

## Changes
- Modified `src/client/src/components/CardPreview.tsx`:
    - **CardHoverWrapper**: Updated the logic for `shouldShow` state management. Removed the `isMobile` restriction on the exit delay. Now, **all devices** respect the 300ms unmount timeout, giving the exit animation time to play before the component is removed from the DOM.
    - **FloatingPreview (Desktop Mode)**:
        - Added `transition-all duration-300` to the desktop container's inner div.
        - Applied dynamic classes based on `isClosing`:
            - **Entering**: `scale-100 opacity-100 ease-out`
            - **Exiting**: `scale-95 opacity-0 ease-in`
        - This effectively replicates the "pop-in / pop-out" animation that was previously mobile-only.
    - Fixed duplicated syntax errors introduced during the update logic.

## Result
On desktop, hovering over a card now triggers a smooth scale-up phase-in. When the mouse leaves, the card preview shrinks slightly and fades out gracefully rather than disappearing instantly. This matches the mobile long-press behavior.
