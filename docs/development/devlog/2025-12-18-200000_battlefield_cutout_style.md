---
title: Battlefield Cutout Style & Tapped Stack
status: Completed
---

## Objectives
- Use "Cutout" (Art Crop) style for cards on the battlefield to save space.
- Implement a stacked view for Tapped Lands on the left of the lands area.
- Rotate tapped cards by 45 degrees instead of 90 degrees.

## Implementation Details
1.  **CardComponent**:
    - Added `viewMode` prop ('normal' | 'cutout').
    - If `viewMode='cutout'`, uses `card.definition.image_uris.art_crop` as src.
    - Changed rotation class from `rotate-90` to `rotate-45`.

2.  **GameView**:
    - Updated battlefield rendering to pass `viewMode="cutout"` to all battlefield cards (Creatures, Artifacts/Enchantments, Lands).
    - Updated card sizing on battlefield to `w-28 h-auto aspect-[4/3]` (approx 112x84px).
    - Split Lands zone into `tappedLands` and `untappedLands`.
    - Implemented a "stack" layout for `tappedLands` on the left side of the lands container, using absolute positioning within a relative container to create a pile effect.

## Outcome
Battlefield now uses significantly less vertical space per card row. Tapped lands are grouped neatly, reducing horizontal sprawl. Tapped cards are clearly distinct but take up less bounding box width due to 45 degree rotation compared to 90 degree (depending on aspect ratio, but arguably cleaner visual for "tapped").
