# Mobile Fullscreen Preview

## Objective
Update the mobile card preview mechanism to display a centered, fullscreen overlay upon long-press, rather than a floating element following the touch point. This provides a clearer view of the card on small screens.

## Changes
- Modified `src/client/src/components/CardPreview.tsx`:
    - Updated `FloatingPreview` interface to accept `isMobile: boolean`.
    - Added conditional rendering in `FloatingPreview`:
        - If `isMobile` is true, it renders a `fixed inset-0` overlay with a centered image, `backdrop-blur`, and entrance animations (`zoom-in` + `fade-in`).
        - If false (desktop), it retains the original cursor-following behavior.
    - Updated `CardHoverWrapper` to pass the `isMobile` state down to the preview component.
    - The preview automatically disappears (unmounts) when the long-press is released, effectively creating a "fade out/close" interaction (visually, the instant close is standard; entrance is animated).

## Result
Long-pressing a card on mobile now brings up a high-quality, centered view of the card that dims the background, improving readability and usability.
