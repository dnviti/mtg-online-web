# Update Deck Auto-Fill Logic

## Request
The user requested that the "Auto-Fill" (Add Lands) button in the Deck Builder behave exactly like clicking individual lands in the Land Station. Specifically, lands should be added as individual card entries in the deck list so they can be viewed and removed one by one, rather than just updating a counter.

## Implementation Plan
1.  Modify `applySuggestion` function in `src/client/src/modules/draft/DeckBuilderView.tsx`.
2.  Check if `availableBasicLands` is populated (indicating the graphical Land Station is active).
3.  If active, iterate through the suggested land counts.
4.  For each count, find the corresponding land card object in `availableBasicLands`.
5.  Generate unique card objects (with unique IDs) for each land instance, replicating the logic of `addLandToDeck`.
6.  Add these new land objects to the `deck` state.
7.  Retain the old counter-based logic as a fallback if `availableBasicLands` is empty.

## Status
- [x] Analyzed `DeckBuilderView.tsx` to understand current `applySuggestion` vs `addLandToDeck` logic.
- [x] Refactored `applySuggestion` to implement the new behavior.
- [x] Verified ID generation and state updates match existing patterns.
