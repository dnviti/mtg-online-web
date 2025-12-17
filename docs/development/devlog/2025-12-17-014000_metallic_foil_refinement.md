# Metallic Foil Refinement

## Objective
Adjust the foil effect to prioritize "visible shimmer" over "color tinting," preventing the effect from washing out the card's original colors.

## Changes
- Modified `FoilOverlay` in `src/client/src/components/CardPreview.tsx`:
    - **Reduced Saturation**: Lowered the opacity of the rolling rainbow layer from `60` down to `30`. This keeps the dynamic color shift but makes it much more subtle, preventing it from overpowering the artwork.
    - **Increased Shimmer**: Added a strong `via-white/40` diagonal glare layer with `mix-blend-overlay` and `opacity-80`. This adds a bright, metallic "pop" that moves (`animate-pulse`) across the card, simulating high-gloss reflection.
    - **Screen Gloss**: Changed the top finish layer to `mix-blend-screen` with `white/5`. This adds a neutral brightness that lifts the metallic look without shifting the hue.

## Result
The foil effect now looks like a highly reflective metallic surface (the "effect" is visible) rather than a colored filter, preserving the integrity of the original card art.
