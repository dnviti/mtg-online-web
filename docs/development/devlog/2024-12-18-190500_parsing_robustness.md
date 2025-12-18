# 2024-12-18 - Parse Card Data Robustness

## Problem
The user reported issues with "placing cards onto the battlefield". Specifically, this manifested in two likely ways:
1.  Creature cards fading away instantly (dying to State-Based Actions) because their Power/Toughness was defaulted to 0/0.
2.  Cards resolving to the Graveyard instead of Battlefield because the `RulesEngine` failed to identify them as Permanents (empty `types` array), defaulting to Instant/Sorcery behavior.

## Root Cause
1.  **Missing P/T Passing**: The `server/index.ts` file was constructing the initial game state from deck cards but failing to explicitly copy `power` and `toughness` properties.
2.  **Missing Type Parsing**: The `GameManager` (and `index.ts`) relied on `typeLine` string but did not parse it into the `types` array which the `RulesEngine` strictly checks for `isPermanent` logic and invalid aura validation.

## Solution
1.  **Updated `GameManager.ts`**: Added robust parsing logic in `addCardToGame`. If `card.types` is empty, it now parses `card.typeLine` (e.g. splitting "Legendary Creature — Human") to populate `types`, `supertypes`, and `subtypes` arrays.
2.  **Updated `server/index.ts`**: Modified all game initialization flows to explicitly pass `power` and `toughness` from the source data to `gameManager.addCardToGame`.

## Outcome
Cards added to the game now have correct type metadata and base stats.
-   Creatures resolve to the battlefield correctly (identified as Permanents).
-   Creatures stay on the battlefield (Toughness > 0 prevents SBA death).
