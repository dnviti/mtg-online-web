# Land Advice and Unlimited Deck Building

## Requirements
1.  **Unlimited Timer**: The deck building phase should have an unlimited duration for now.
2.  **Land Advice Algorithm**:
    - Suggest a mana base aiming for a total of 17 lands (including those already picked in the deck).
    - Calculate the number of basic lands needed based on the color distribution (mana symbols) of the non-land cards in the deck.
    - Provide a UI to view and apply these suggestions.

## Implementation Details

### `DeckBuilderView.tsx`

-   **Timer disabled**: `useState<string>("Unlimited")` is used effectively to remove the countdown mechanism.
-   **Land Suggestion Algorithm**:
    -   Target total lands: 17.
    -   `existingLands` calculated from cards in `deck` with type `Land`.
    -   `landsNeeded` = `max(0, 17 - existingLands)`.
    -   Scans `mana_cost` of non-land cards to build a frequency map of colored mana symbols (`{W}`, `{U}`, etc.).
    -   Distributes `landsNeeded` proportionally to the symbol counts.
    -   Handles remainders by allocating them to the colors with the highest symbol counts.
    -   Returns `null` if no colored symbols or `landsNeeded` is 0.
-   **UI**:
    -   A panel "Land Advisor (Target: 17)" is added above the Land Station.
    -   Displays the calculated basic land distribution (e.g., "P: 3, I: 2").
    -   "Auto-Fill" button applies these counts to the `lands` state directly.

## Verification
-   Verified manually that adding/removing cards updates the suggestion logic.
-   "Unlimited" timer is displayed correctly.
-   Lint errors resolved.
