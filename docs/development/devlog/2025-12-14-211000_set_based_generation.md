# Enhancement: Set-Based Pack Generation

## Status: Completed

## Summary
Implemented the ability to fetch entire sets from Scryfall and generate booster boxes.

## Changes
1.  **ScryfallService**:
    *   Added `fetchSets()` to retrieve expansion sets.
    *   Added `fetchSetCards(setCode)` to retrieve all cards from a set.
2.  **PackGeneratorService**:
    *   Added `generateBoosterBox()` to generate packs without depleting the pool.
    *   Added `buildTokenizedPack()` for probabilistic generation (R/M + 3U + 10C).
3.  **CubeManager UI**:
    *   Added Toggle for "Custom List" vs "From Expansion".
    *   Added Set Selection Dropdown.
    *   Added "Number of Boxes" input.
    *   Integrated new service methods.

## Usage
1.  Select "From Expansion" tab.
2.  Choose a set (e.g., "Vintage Masters").
3.  Choose number of boxes (default 3).
4.  Click "Fetch Set".
5.  Click "Generate Packs".
