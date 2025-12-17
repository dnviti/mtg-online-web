# Circular Foil Animation

## Objective
Replace the linear "pulsing" glare with a "gaussian circular animation" to provide a smoother, rotating metallic sheen.

## Changes
- **CSS Animation**: Added `.animate-spin-slow` in `main.css` to rotate elements over an 8-second loop.
- **Foil Component** (`src/client/src/components/CardPreview.tsx`):
    - Removed the pulsing linear gradient.
    - Added a **rotating radial gradient**:
        - Positioned with `absolute inset-[-50%]` to create a canvas larger than the card.
        - Uses a white radial gradient (`rgba(255,255,255,0.5) 0% -> transparent 60%`) centered on this larger canvas.
        - The `animate-spin-slow` class rotates this entire large gradient layer around the center of the card.
    - This creates an effect where a soft "spotlight" or "sheen" continually drifts across the card surface in a circular pattern, simulating light moving over a holographic texture.

## Result
The foil glare is now a soft, rotating circular highlight, giving a distinctly different and more sophisticated "gaussian" light play compared to the previous linear pulse.
