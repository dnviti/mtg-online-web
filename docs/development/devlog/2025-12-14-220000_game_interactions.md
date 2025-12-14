# Game Interactions Implementation

## Objective
Implement basic player interactions for the MTG game, including library, battlefield, and other game mechanics.

## Changes
1.  **Backend (`src/server/managers/GameManager.ts`)**:
    *   Created `GameManager` class to handle game state.
    *   Defined `GameState`, `PlayerState`, `CardInstance` interfaces.
    *   Implemented `createGame`, `handleAction` (move, tap, draw, life).
    *   Integrated with `socket.io` handlers in `server/index.ts`.

2.  **Frontend (`src/client/src/modules/game`)**:
    *   Created `GameView.tsx`: Main game board with drag-and-drop zones (Hand, Battlefield, Library, Graveyard).
    *   Created `CardComponent.tsx`: Draggable card UI with tap state.
    *   Updated `GameRoom.tsx`: Added game state handling and "Start Game (Test)" functionality.

3.  **Socket Service**:
    *   Identify `start_game` and `game_action` events.
    *   Listen for `game_update` to sync state.

## Status
-   Basic sandbox gameplay is operational.
-   Players can move cards between zones freely (DnD).
-   Tap/Untap and Life counters implemented.
-   Test deck (Mountain/Bolt) provided for quick testing.

## Next Steps
-   Implement actual rules enforcement (Stack, Priority).
-   Implement Deck Builder / Draft Integration (load actual drafted decks).
-   Improve UI/UX (animations, better card layout).
