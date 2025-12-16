# Host Disconnect Pause Logic

## Objective
Ensure the game pauses for all players when the Host disconnects, preventing auto-pick logic from advancing the game state. enable players to leave cleanly.

## Changes
1.  **Server (`src/server/index.ts`)**:
    *   Refactored socket handlers.
    *   Implemented `startAutoPickTimer` / `stopAllRoomTimers` helpers.
    *   Updated `disconnect` handler: Checks if disconnected player is passed host. If true, pauses game (stops all timers).
    *   Updated `join_room` / `rejoin_room`: Resumes game (restarts timers) if Host reconnects.
    *   Added `leave_room` event handler to properly remove players from room state.

2.  **Frontend (`src/client/src/modules/lobby/LobbyManager.tsx`)**:
    *   Updated `handleExitRoom` to emit `leave_room` event, preventing "ghost" connections.

3.  **Frontend (`src/client/src/modules/lobby/GameRoom.tsx`)**:
    *   Fixed build error (unused variable `setGameState`) by adding `game_update` listener.
    *   Verified "Game Paused" overlay logic exists and works with the new server state (`isHostOffline`).

## Result
Host disconnection now effectively pauses the draft flow. Reconnection resumes it. Players can leave safely.
