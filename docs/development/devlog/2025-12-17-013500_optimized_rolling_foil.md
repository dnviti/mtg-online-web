# Optimized Rolling Rainbow Foil

## Objective
Update the foil effect to use a "continuous rainbow" and a "milder white background" as specifically requested.

## Changes
- Modified `FoilOverlay` in `src/client/src/components/CardPreview.tsx`:
    - **Continuous Rainbow**: Updated the gradient to encompass the full spectrum (`red` -> `yellow` -> `green` -> `blue` -> `purple` -> `red`) over a linear gradient. This seamless loop ensures the rolling animation (`animate-bg-roll`) is smooth and continuously colorful.
    - **Milder White Background**: Removed the heavy soft-light and pulse layers. Replaced them with a very subtle `white/5` overlay using `mix-blend-overlay`. This brightens the foil slightly without washing out the colors.
    - **Color Dodge**: Applied `mix-blend-color-dodge` to the container to ensure the rainbow colors interact vibrantly with the underlying card art.

## Result
Foil cards now feature a smooth, full-spectrum rainbow scrolling effect that feels high-quality and "magical," with a balanced brightness level.
