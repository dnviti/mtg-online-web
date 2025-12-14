# Draft & Deck Building Phase

## Objective
Implement the "Draft Phase" (Pack Passing) and "Deck Building Phase" (Pool + Lands) logic and UI, bridging the gap between Lobby and Game.

## Changes
1.  **Backend - Draft Logic (`src/server/managers/DraftManager.ts`)**:
    *   Implemented `DraftManager` class.
    *   Handles pack distribution (3 packs per player).
    *   Implements `pickCard` logic with queue-based passing (Left-Right-Left).
    *   Manages pack rounds (Wait for everyone to finish Pack 1 before opening Pack 2).
    *   Transitions to `deck_building` status upon completion.

2.  **Server Integration (`src/server/index.ts`)**:
    *   Added handlers for `start_draft` and `pick_card`.
    *   Broadcasts `draft_update` events.

3.  **Frontend - Draft UI (`src/client/src/modules/draft/DraftView.tsx`)**:
    *   Displays active booster pack.
    *   Timer (visual only for now).
    *   Click-to-pick interaction.
    *   Preview of drafted pool.

4.  **Frontend - Deck Builder UI (`src/client/src/modules/draft/DeckBuilderView.tsx`)**:
    *   **Split View**: Card Pool vs. Current Deck.
    *   **Drag/Click**: Click card to move between pool and deck.
    *   **Land Station**: Add basic lands (Plains, Island, Swamp, Mountain, Forest) with unlimited supply.
    *   **Submit**: Sends deck to server (via `player_ready` - *Note: Server integration for deck storage pending final game start logic*).

5.  **Integration (`GameRoom.tsx`)**:
    *   Added routing based on room status: `waiting` -> `drafting` -> `deck_building` -> `game`.
    *   Added "Start Real Draft" button to lobby.

## Status
-   **Drafting**: Fully functional loop. Players pick cards, pass packs, and proceed through 3 rounds.
-   **Deck Building**: UI is ready. Players can filter, build, and add lands.
-   **Next**: Need to finalize the "All players ready" logic in `deck_building` to trigger the actual `start_game` using the submitted decks. Currently, submitting triggers a placeholder event.

## To Verify
-   Check passing direction (Left/Right).
-   Verify Basic Land addition works correctly in the final deck object.
