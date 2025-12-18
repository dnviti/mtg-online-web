---
title: Organized Caching Subdirectories
status: Completed
---

## Objectives
- Organize cached images within edition folders into distinct subdirectories: `art_full` (normal) and `art_crop` (crop).
- Update Server (`CardService`) to save images to these new paths.
- Update Client (`PackGeneratorService`) to construct paths referencing these new subdirectories.

## Implementation Details
1.  **Server (`CardService.ts`)**:
    - Changed normal image save path to: `[imagesDir]/[setCode]/art_full/[uuid].jpg`
    - Changed art crop save path to: `[imagesDir]/[setCode]/art_crop/[uuid].jpg`
    - Note: Extension is standardized to `.jpg` for simplicity.

2.  **Client (`PackGeneratorService.ts`)**:
    - Updated `image` property to use `.../[setCode]/art_full/[id].jpg`
    - Updated `imageArtCrop` property to use `.../[setCode]/art_crop/[id].jpg`

## Migration Note
- Existing cached images in the root of `[setCode]` folder will be ignored by the new logic.
- Users will need to re-parse or re-import sets/cubes to populate the new folder structure. This is an intentional breaking change for cleaner organization.

## Outcome
Filesystem is now cleaner with clear separation between full card art and crop art.
