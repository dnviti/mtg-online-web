# General Card Visibility Boost

## Objective
Add a mild white overlay to all magnified card previews (both mobile and desktop) to improve visibility against dark backgrounds, as requested.

## Changes
- Modified `src/client/src/components/CardPreview.tsx`:
    - Inserted a `<div className="absolute inset-0 bg-white/10 pointer-events-none mix-blend-overlay" />` into the `FloatingPreview` component.
    - This overlay is applied to **every** card, regardless of finish (Foil/Normal) or device type.
    - It sits immediately on top of the image but below the Foil effects, ensuring it brightens the base art without washing out the holographic details.

## Result
All card previews now have slightly lifted blacks and increased brightness, making them "pop" more against the dark UI backdrops.
