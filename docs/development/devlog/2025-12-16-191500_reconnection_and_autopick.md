# 2025-12-16 - Reconnection and Auto-Pick

## Reconnection Logic
- Use `localStorage.setItem('active_room_id', roomId)` in `LobbyManager` to persist connection state.
- Upon page load, if a saved room ID exists, attempted to automatically reconnect via `rejoin_room` socket event.
- Updated `socket.on('join_room')` and `rejoin_room` on the server to update the player's socket ID mapping, canceling any pending "disconnect" timers.

## Disconnection Handling
- Updated `RoomManager` to track `socketId` and `isOffline` status for each player.
- In `index.ts`, `socket.on('disconnect')`:
  - Marks player as offline.
  - Starts a **30-second timer**.
  - If timer expires (user did not reconnect):
    - Triggers `draftManager.autoPick(roomId, playerId)`.
    - `autoPick` selects a random card from the active pack to unblock the draft flow.

## Auto-Pick Implementation
- Added `autoPick` to `DraftManager`:
  - Checks if player has an active pack.
  - Selects random index.
  - Calls `pickCard` internally to process the pick (add to pool, pass pack, etc.).
