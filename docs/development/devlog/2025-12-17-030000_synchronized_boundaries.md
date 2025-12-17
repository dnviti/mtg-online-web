# Synchronized Display Boundaries

## Objective
Harmonize the "Full Art" visualization mode with the specific behavior of the slider and preview suppression logic.

## Changes
- **Threshold Update**: Shifted the trigger point for Art Crop visualization (full art thumbnails) from `170px` to **`200px`**.
    - This corresponds to exactly **50% of the slider range** (100px-300px), creating a predictable user interface boundary.
    - **< 200px**: Cards display as **Art Crops (Full Art)** because text would be illegible. **Hover Preview is Enabled** to show the card details.
    - **>= 200px**: Cards display as **Standard Scryfall Images** (with borders/text) because text is legible. **Hover Preview is Disabled** to prevent redundancy, as the card itself acts as the reference.

## Result
A unified "Pivot Point" at 200px. Sliding left gives you a dense, artistic mosaic with helpful popups. Sliding right gives you a readable, "tabletop" view with direct card interaction and no popup clutter.
