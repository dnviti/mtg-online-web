# Dynamic Art Cropping

## Objective
Automatically switch card visualizations to "Full Art" (Art Crop) mode when the thumbnail size is reduced below a readability threshold, maximizing the visual impact of the artwork when text is too small to read.

## Changes
- **Backend (Client & Server)**:
    - Updated `DraftCard` interface to include `imageArtCrop`.
    - Modified parsing services (`PackGeneratorService`) to extract and populate `imageArtCrop` from Scryfall data.
- **Frontend (UI)**:
    - **PackCard (Grid View)**: Implemented a conditional check: if `cardWidth < 170px`, the image source switches to `imageArtCrop`.
    - **StackView (Deck/Collection)**: Applied the same logic.
- **Visuals**:
    - The `object-cover` CSS property ensures the rectangular art crop fills the entire card frame, creating a "borderless/full-art" look.
    - The **Foil Overlay** and **Rarity Stripe** remain visible on top of the art crop, maintaining game state clarity.

## Result
As you slide the size slider down, the cards seamlessly transform from standard cards (with borders and text) to vibrant, full-art thumbnails. This creates a stunning "mosaic" effect for the cube overview and deck stacks, solving the issue of illegible text at small scales.
