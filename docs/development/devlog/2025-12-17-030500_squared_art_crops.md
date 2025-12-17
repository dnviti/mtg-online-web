# Squared Art Crops

## Objective
Optimize the "Full Art" display mode by switching from a rectangular card ratio to a square ratio. This focuses the view on the artwork itself (which is typically landscape/square-ish in crops) and provides a more compact, tile-like aesthetic for small thumbnails.

## Changes
- **Grid View (`PackCard`)**:
    - Dynamically switches CSS classes: uses `aspect-square` when in Art Crop mode (<200px), and `aspect-[2.5/3.5]` (standard card ratio) otherwise.
    - Creates a uniform grid of square tiles for the visual overview.
- **Stack View (`StackView`)**:
    - Dynamically adjusts inline styles:
        - `aspectRatio`: Switches between `'1/1'` and `'2.5/3.5'`.
        - `marginBottom` (for stacking overlap): Adjusted from `-125%` (for tall rectangles) to `-85%` (for squares) to maintain a consistent visible "header strip" for cards underneath.

## Result
When you slide the size down, the cards now morph into neat square tiles. This maximizes the art visibility within the small space and makes the "mosaic" feel even more deliberate and organized.
