# Pro Foil Implementation

## Objective
Implement a high-fidelity "Pro" foil effect using generic CSS techniques inspired by community "Holo" styles, creating a sophisticated rainbow and texture mapping.

## Changes
- **CSS Class `foil-holo`**:
    - Added to `src/client/src/styles/main.css`.
    - This class builds a complex multi-layered background image stack:
        - **Layer 1**: Vertical Repeating Rainbow (`0deg` linear gradient).
        - **Layer 2**: Diagonal Texture (`133deg` repeating linear gradient with hard-light/hue stops).
    - Uses `background-blend-mode: screen, hue` to mix these layers dynamically.
    - Uses `mix-blend-mode: color-dodge` to composite onto the card image.
    - Includes a custom animation `foil-shift` (15s linear infinite) that shifts the background position vertically and diagonally, creating an "always active" shimmering effect.
- **CardPreview Update**:
    - Updated `FoilOverlay` to use the `.foil-holo` class.
    - Retained the **Gaussian Circular Glare** (`radial-gradient` + `animate-spin-slow`) as a top-layer "spotlight" effect.

## Result
The foil effect is now significantly more intricate, featuring vertical color bands and diagonal textures that shift over time, mimicking the look of high-end TCG holofoils (like "Secret Rares" or "Full Arts").
