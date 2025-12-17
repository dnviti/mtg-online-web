# Mild Foil Animation

## Objective
Reduce the intensity of foil effects to make the static appearance identical to non-foil cards (as requested), while keeping the animation "mildly visible" rather than dominating.

## Changes
- Modified `FoilOverlay` in `src/client/src/components/CardPreview.tsx`:
    - **Removed Static Gloss**: Deleted the `bg-white/5 mix-blend-screen` layer. This ensures the base brightness of foil cards matches the standard "Universal Gloss" shared with non-foils.
    - **Softened Circular Glare**:
        - Reduced the white intensity in the radial gradient from `0.5` to `0.25`.
        - Reduced the layer opacity from `80` to `25`.
        - This makes the rotating white sheen subtle and ghostly rather than a bright spotlight.
    - *Retained*: The low-opacity rolling rainbow layer (`opacity-30`) to provide the necessary color play.

## Result
Foil cards now look cleaner and less washed out, matching the visual weight of normal cards, but possess a delicate, rotating shimmer that catches the eye without distracting from the art.
