# Explicit Preview Suppression

## Objective
Enforce strict preview suppression when card sizes are large (`>= 200px`), regardless of element visibility, overlap, or DOM layout quirks. This ensures that in Stack View, where cards overlap, no stray previews are triggered for cards that are ostensibly "big enough" to be read directly.

## Changes
- **CardPreview (`CardHoverWrapper`)**:
    - Added an optional `preventPreview?: boolean` prop.
    - Updated `handleMouseEnter` to immediately return if `preventPreview` is true, bypassing any DOM size checks that might be inaccurate for obscured elements.
- **PackCard (Grid View)**:
    - Passed `preventPreview={cardWidth >= 200}` to the wrapper.
- **StackView (Stack View)**:
    - Passed `preventPreview={cardWidth >= 200}` to the wrapper.

## Result
Total consistency: if your slider is set to 200/300, floating previews are globally disabled for those views. This specifically fixes the issue where overlapping cards in a stack might have triggered previews unnecessarily.
