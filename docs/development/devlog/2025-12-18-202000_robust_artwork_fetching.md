---
title: Robust Artwork Fetching
status: Completed
---

## Objectives
- Improve `CardComponent` logic to find the "Art Crop" URL more reliably.
- Handle standard cards and double-faced cards (using the first face's art crop).
- Ensure "Cutout Mode" in Battlefield consistently renders the Art Crop instead of the full card.

## Implementation Details
1.  **CardComponent Update**:
    - Refactored the `imageSrc` resolution logic.
    - Explicitly checks `card.definition.image_uris.art_crop`.
    - Fallback checks `card.definition.card_faces[0].image_uris.art_crop`.
    - Final fallback remains `card.imageUrl` (full card).

## Verification
- Verified against the logic used in `DeckBuilderView` (which relies on a `normal` image but logic is similar).
- This ensures consistency with the user's request to match the "deck building ui" behavior where crop works.

## Outcome
Battlefield cards should now reliably display the zoomed-in art crop, matching the square aspect ratio container perfectly without showing text borders.
