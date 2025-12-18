# 2024-12-18 - Fix Empty Combat Step Skipping

## Problem
When a player declares 0 attackers (Skip Combat), the game correctly advances from `declare_attackers` but then proceeds to `declare_blockers` instead of skipping to the end of combat. This forces the (non-existent) defending player to declare blockers against nothing, or the active player to wait through irrelevant priority passes.

## Root Cause
The `RulesEngine.advanceStep()` method strictly followed the standard phase/step structure defined in `server/game/RulesEngine.ts`. It lacked the logic to implement Rule 508.8, which states that if no attackers are declared, the Declare Blockers and Combat Damage steps are skipped.

## Solution
Modified `RulesEngine.advanceStep()` to check for attackers before transitioning steps.
If the current phase is `combat` and the next projected step is `declare_blockers`, it checks if any cards have the `attacking` property.
If `attackers.length === 0`, it overrides `nextStep` to `end_combat`, effectively skipping the interactive combat steps.

## Outcome
Declaring 0 attackers (or passing with no attacks) now correctly transitions the game immediately to the "End of Combat" step (and then likely Main Phase 2), smoothing out the gameplay flow.
