# 2025-12-18 - Restore Images Subdirectory

## Overview
Corrected the cache folder structure to include the `images` subdirectory as explicitly requested by the user, fixing a previous misinterpretation.

## Revised Structure
- **Paths**:
  - Full Art: `/public/cards/images/[set]/full/[id].jpg`
  - Crop Art: `/public/cards/images/[set]/crop/[id].jpg`
  
## Changes
- **Updated `CardService.ts`**: Re-inserted `images` into the `path.join` construction for file saving.
- **Updated `PackGeneratorService.ts` (Server & Client)**: Updated the generated URLs to include the `/cards/images/...` segment.

## Compliance
This aligns the application with the user's specific requirement for folder hierarchy: `/cards/images/[set-code]/full` and `/cards/images/[set-code]/crop`.
