# Universal Foil Animation

## Objective
Apply the high-fidelity foil animation to **all** card image instances, including the "Grid View" and "Stack View" thumbnails, not just the magnified hover preview.

## Changes
- **CardPreview.tsx**: Exported the `FoilOverlay` component so it can be reused across the application.
- **PackCard.tsx**:
    - Imported `FoilOverlay`.
    - Replaced the previous generic static foil gradient in `Grid View` with the `<FoilOverlay />` component.
- **StackView.tsx**:
    - Imported `FoilOverlay`.
    - Replaced the simple opacity layer for foil cards with the `<FoilOverlay />` component.

## Result
Now, whenever a foil card is displayed on the screen—whether as a thumbnail in a pack grid, a card in a stack pile, or a magnified preview—it consistently features the generic holographic animation and rotating glare effect.
