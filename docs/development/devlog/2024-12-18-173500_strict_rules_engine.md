
# 2024-12-18 17:35:00 - Strict Rules Engine Implementation

## Description
Implemented a comprehensive Magic: The Gathering rules engine (Core Logic) to replace the sandbox mode with strict rules enforcement. This includes a State Machine for Turn Structure, Priority System, Stack, and State-Based Actions.

## Key Changes
1.  **Core Types**: Created `src/server/game/types.ts` defining `Phase`, `Step`, `StrictGameState`, `StackObject`, etc.
2.  **Rules Engine**: Created `src/server/game/RulesEngine.ts` implementing:
    - **Turn Structure**: Untap, Upkeep, Draw, Main, Combat (Steps), End.
    - **Priority System**: Passing priority, stack resolution, phase transition.
    - **Actions**: `playLand`, `castSpell` with validation.
    - **State-Based Actions**: Lethal damage, Zero toughness, Player loss checks.
3.  **Game Manager Refactor**:
    - Updated `GameManager.ts` to use `StrictGameState`.
    - Implemented `handleStrictAction` to delegate to `RulesEngine`.
    - Retained `handleAction` for legacy/sandbox/admin support.
4.  **Socket Handling**:
    - Added `game_strict_action` event listener in `server/index.ts`.

## Next Steps
- Client-side integration: The frontend needs to be updated to visualize the Phases, Stack, and Priority (Pass Button).
- Move from "Sandbox" UI to "Rules Enforcement" UI.
