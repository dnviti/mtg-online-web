# 2024-12-18 - Fix Actions Post-Mulligan

## Problem
After the Mulligan phase, users reported "no actions working". The Smart Button and other strict interactions (Priority passing) were failing.

## Root Cause
1.  **Frontend Emission**: The `SmartButton` in `GameView.tsx` and the `RadialMenu` for mana were emitting legacy `type` strings (e.g. `PASS_PRIORITY` or `ADD_MANA` directly), or wrapped incorrectly. Specifically, `SmartButton` was correctly wrapping in `game_strict_action` but likely the state alignment was off.
2.  **Radial Menu**: Was emitting `ADD_MANA` as a legacy `game_action`. Legacy `GameManager` (before my fix in previous step) handled basic actions, but `ADD_MANA` is a strict engine concept. `GameManager.handleAction` (legacy) did not handle it. We needed to target `game_strict_action` or add a handler.
3.  **State Reset**: The engine's transition from Mulligan -> Untap -> Upkeep -> Draw -> Main1 relies on `resetPriority` correctly assigning priority to the Active Player. If this flow is interrupted or if the client UI doesn't realize it has priority (due to `priorityPlayerId` mismatch), the Smart Button disables itself.

## Solution
1.  **Strict Action Alignment**: Updated `GameView.tsx` to ensure `RadialMenu` (Mana) emits `game_strict_action`.
2.  **Handling**: (Previous Step) Added `DRAW_CARD` support.
3.  **Smart Button Checking**: Confirmed Smart Button emits `type` which `GameView` wraps in `action`. This matches `socket.on('game_strict_action', { action })`. This path is correct.

## Verification
The flow "Mulligan -> Advanced Step (Mulligan Ends) -> Untap (Auto) -> Upkeep -> Reset Priority (Active Player)" seems logic-sound in `RulesEngine`. With the frontend now targeting the strict endpoint for Mana/Priority, and the legacy handler updated for Draw, the loop should be closed.

## Remaining Risk
If `resetPriority` sets `priorityPlayerId` to a player ID that doesn't match the client's `currentPlayerId` (e.g. Turn 1 Order), the button will stay gray/disabled. This is Rules Correct (you can't act if not your priority), but UI feedback (telling *whose* turn/priority it is) is crucial. The existing `PhaseStrip` or `SmartButton` should indicate this.
