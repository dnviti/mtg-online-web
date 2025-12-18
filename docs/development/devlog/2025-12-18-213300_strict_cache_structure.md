# 2025-12-18 - Restrictive Cache Structure

## Overview
Implemented strict separation of card assets into `full` and `crop` subdirectories nested under `cards/[expansion-code]/`. This update forces the application to depend entirely on the local cache for serving card images during runtime, fetching from Scryfall only during the explicit cache creation phase.

## Changes
- **Refactored `CardService.ts`**:
  - Updated `cacheImages` to save files to `public/cards/[set]/full/[id].jpg` and `public/cards/[set]/crop/[id].jpg`.
  - Removed the intermediate `images` directory layer.
  
- **Updated `PackGeneratorService.ts` (Server)**:
  - Hardcoded `image` and `imageArtCrop` properties to point to the local server paths (`/cards/[set]/full/[id].jpg` etc.), removing the fallback to Scryfall URIs.
  
- **Updated `PackGeneratorService.ts` (Client)**:
  - Aligned local image path generation with the new server structure (`/cards/[set]/...`).

## Rationale
To ensure offline availability and consistent performance, the application now treats the local cache as the authoritative source for images. This standardization simplifies asset management and prepares the system for strict air-gapped or high-performance environments where external API dependencies are undesirable during gameplay.
