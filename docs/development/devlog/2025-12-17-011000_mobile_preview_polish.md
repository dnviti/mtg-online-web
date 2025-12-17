# Mobile Preview Enhancements

## Objective
Enhance the mobile card preview with sophisticated entrance/exit animations and a premium foil effect.

## Changes
- **Refined Animations**:
    - **Entering**: Uses `scale-100 opacity-100 ease-out` to simulate the card smoothly arriving into view.
    - **Exiting**: Uses `scale-95 opacity-0 ease-in` to simulate the card receding and fading away.
    - The transition duration is set to 300ms for a fluid feel.

- **Foil Overlay**:
    - Added a multi-layered foil effect for cards with `isFoil=true`.
    - **Layer 1**: A moving pulse gradient (`bg-gradient-to-tr` with `via-white/20`) that simulates light catching the surface.
    - **Layer 2**: A static color-dodge gradient (`bg-gradient-to-br` with purple/pink/blue) to give the characteristic holographic tint.

- **Effect Implementation**:
    - The `FloatingPreview` component now orchestrates these classes based on the `isClosing` prop passed from the wrapper.

## Result
The mobile experience now feels premium, with cards gracefully popping in and out, and foils displaying a distinctive animated sheen.
