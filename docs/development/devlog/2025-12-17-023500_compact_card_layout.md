# Compact Card Layout

## Objective
Slightly resize the card visualizations in both Grid and Stack views to allow more cards to fit on the screen, creating a denser and more "compact" interface as requested.

## Changes
- **Pack Grid View** (`src/client/src/components/PackCard.tsx`):
    - Increased the column density across all breakpoints:
        - Base: `grid-cols-2` -> `grid-cols-3`
        - Small: `grid-cols-3` -> `grid-cols-4`
        - Medium: `grid-cols-4` -> `grid-cols-5`
        - Large: `grid-cols-5` -> `grid-cols-6`
    - This reduces the individual card width, making them visually smaller.
- **Stack / Deck View** (`src/client/src/components/StackView.tsx`):
    - Reduced the fixed width of each stack column from `w-44` (176px) to `w-36` (144px).

## Result
Cards appear slightly smaller ("a little more smaller"), providing a broader overview of the pool and deck without requiring as much scrolling. This works in tandem with the "Smart Preview Suppression" (which will likely now re-enable previews for these smaller cards, aiding readability).
