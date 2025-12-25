# Update Scryfall Filter Logic

## Status
Completed

## Description
Updated `ScryfallService.ts` to use a more complex filter query that includes basic lands alongside booster cards for each set.
Filter: `(set:CODE (is:booster or (type:land type:basic)))`

## Changes
- Modified `fetchSetCards` in `src/server/services/ScryfallService.ts`.
