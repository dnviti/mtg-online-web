# Implement Restart Game

**Status:** Completed
**Date:** 2025-12-18
**Description:**
Implemented a development feature to reset the current game state while preserving the players' decks. This allows for rapid iteration and testing of the game board mechanics without needing to re-draft or recreate the lobby.

**Technical Reference:**
- **Backend:** Added `restartGame` method to `GameManager.ts`. This method resets all game variables (turn count, phase, life totals, etc.), moves all cards back to the library (removing tokens), and clears the stack and temporary states.
- **Frontend:** Added a "Restart Game" button (using `RotateCcw` icon) to the `GameView.tsx` interface in the right-hand control panel. The button includes a confirmation dialog to prevent accidental resets.
