# Entrance Animation Fix

## Objective
Ensure the card preview plays the "scale-up fade-in" animation when it first appears (mounting), not just when disappearing.

## Changes
- Modified `FloatingPreview` in `src/client/src/components/CardPreview.tsx`:
    - Introduced a generic `isMounted` state initialized to `false`.
    - Added a `useEffect` that sets `isMounted` to `true` on the next animation frame after mount.
    - Updated CSS logic to check a combined `isActive` state (`isMounted && !isClosing`).
    - **Logic**:
        - **Mount (0ms)**: `isActive` is false `->` `opacity-0 scale-95`.
        - **Next Frame (~16ms)**: `isMounted` becomes true `->` `isActive` becomes true `->` `transition-all` triggers to `opacity-100 scale-100`.
        - **Unmount Trigger**: `isClosing` becomes true `->` `isActive` becomes false `->` Transitions back to `opacity-0 scale-95`.

## Result
The card preview now smoothly "pops in" from 95% scale and 0 opacity every time it is triggered, providing a consistent, high-quality feel to the UI interactions.
