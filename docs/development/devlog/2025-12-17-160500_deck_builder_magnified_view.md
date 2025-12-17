# Deck Builder Magnified View

## Requirements
- Add a magnified card view to the `DeckBuilderView`, similar to the one in `DraftView`.
- Show card details (name, type, oracle text) when hovering over any card in the pool, deck, or land station.
- Use a persistent sidebar layout for the magnified view.

## Implementation Details

### `DeckBuilderView.tsx`

-   **State**: Added `hoveredCard` state to track the card being inspected.
-   **Layout**:
    -   Changed the layout to a 3-column flex design:
        1.  **Zoom Sidebar** (`hidden xl:flex w-80`): Shows the magnified card image and text details. Defaults to a "Hover Card" placeholder.
        2.  **Card Pool** (`flex-1`): Displays available cards.
        3.  **Deck & Lands** (`flex-1`): Displays the current deck and land controls.
-   **Interactions**:
    -   Added `onMouseEnter={() => setHoveredCard(card)}` and `onMouseLeave={() => setHoveredCard(null)}` handlers to:
        -   Cards in the Pool.
        -   Cards in the current Deck.
        -   Basic Lands in the Land Station.

## Verification
-   Verified that hovering over cards updates the sidebar image and text.
-   Verified that moving mouse away clears the preview (consistent with Draft View).
-   Layout adjusts responsively (sidebar hidden on smaller screens).
