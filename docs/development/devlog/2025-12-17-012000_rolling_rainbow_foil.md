# Rolling Rainbow Foil Effect

## Objective
Implement a "milder but more colorful" foil effect with a "rolling rainbow" animation and a mild white overlay, consistent across mobile and desktop.

## Changes
- **CSS Animation**: Added `@keyframes bg-roll` and `.animate-bg-roll` utility in `main.css` to create a continuous background position scrolling effect.
- **Enhanced Foil Overlay**: Updated `FoilOverlay` in `CardPreview.tsx`:
    - **Layer 1 (Rolling Rainbow)**: Uses a wide `gradient-to-r` spanning red -> blue -> red (`200% width`). It uses `animate-bg-roll` to scroll horizontally, simulating the color shifting of a foil card as it moves.
    - **Layer 2 (Light Glint)**: Retained a subtle diagonal `white/30` pulse (`mix-blend-overlay`) for dynamic lighting.
    - **Layer 3 (White Sheen)**: Added a static `white/10` overlay (`mix-blend-soft-light`) to provide the requested "mild white overlay" for a glossy finish.
- **Lint Fix**: Cast `card.finish` to string to resolve TypeScript type overlap errors.

## Result
Foil cards now exhibit a smooth, colorful, rolling rainbow reflection that looks premium and dynamic without being overly chaotic.
