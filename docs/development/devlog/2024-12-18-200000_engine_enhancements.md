# Strict Engine Enhancements: Layers, Tokens, Mulligan

## Status: Completed

## Objectives
- Implement Basic Layer System for continuous effects (P/T modifications).
- Implement Token Creation mechanism.
- Implement Mulligan System (London Rule).
- Update Game Lifecycle to include Setup/Mulligan phase.

## Logic Overview

### Layer System (`RulesEngine.recalculateLayers`)
- Implements Layer 7 (Power/Toughness) basics:
    - **Layer 7b**: Set P/T (`set_pt`).
    - **Layer 7c**: Modify P/T (`pt_boost`).
    - **Layer 7d**: Counters (`+1/+1`, `-1/-1`).
- `recalculateLayers` is called automatically whenever priority resets or actions occur.
- Modifiers with `untilEndOfTurn: true` are automatically cleared in the `cleanup` step.

### Token Creation
- New action `CREATE_TOKEN` added.
- `createToken` method constructs a CardObject on the battlefield with defined stats.
- Triggers layer recalculation immediately.

### Mulligan System
- **New Phase**: `setup`, **New Step**: `mulligan`.
- Game starts in `setup/mulligan`.
- **Logic**:
    - If a player has 0 cards and hasn't kept, they draw 7 automatically.
    - Action `MULLIGAN_DECISION`:
        - `keep: false` -> Shuffles hand into library, draws 7, increments `mulliganCount`.
        - `keep: true` -> Validates `cardsToBottom` count matches `mulliganCount`. Moves excess cards to library. Sets `handKept = true`.
- When all players keep, the engine automatically advances to `beginning/untap`.
- Supports London Mulligan rule (Draw 7, put X on bottom).

## Technical Changes
- Updated `StrictGameState` and `PlayerState` types.
- Updated `GameManager` initialization and action switching.
- Updated `RulesEngine` transition logic.

## Remaining/Next
- Frontend UI for Mulligan (Needs a Modal to Keep/Mull).
- Frontend UI for "Cards to Bottom" selection if X > 0.
- Frontend UI to visualize Tokens.
