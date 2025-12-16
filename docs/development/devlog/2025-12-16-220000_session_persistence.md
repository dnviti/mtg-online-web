# implementation_plan - Draft Session Persistence and Restoration

This plan addresses the issue where users are unable to reliably rejoin a draft session as a player after reloading or exiting, often re-entering as a spectator. It ensures robust session synchronization to local storage and handles player "leave" actions safely during active games.

## User Objectives
- **Session Restoring**: Automatically rejoin the correct session and player seat upon reloading the application.
- **Prevent Accidental Data Loss**: Ensure "Exiting" a room during an active draft does not destroy the player's seat, allowing them to rejoin.
- **Start New Draft**: Maintain the ability for a user to explicitly invalid/abandon an old session to start a new one (handled by creating a new room, which overwrites local storage).

## Proposed Changes

### 1. Server-Side: Safer `leaveRoom` Logic
**File**: `src/server/managers/RoomManager.ts`
- Modify `leaveRoom` method.
- **Logic**: 
    - If `room.status` is `'waiting'`, remove the player (current behavior).
    - If `room.status` is `'drafting'`, `'deck_building'`, or `'playing'`, **DO NOT** remove the player from `room.players`. Instead, mark them as `isOffline = true` (similar to a disconnect).
    - This ensures that if the user rejoins with the same `playerId`, they find their existing seat instead of being assigned a new "spectator" role.

### 2. Server-Side: Robust `rejoin_room` Handler
**File**: `src/server/index.ts`
- Update `socket.on('rejoin_room')`.
- **Change**: Implement an acknowledgement `callback` pattern consistent with other socket events.
- **Logic**:
    - Accept `{ roomId, playerId }`.
    - If successful, invoke `callback({ success: true, room, draftState })`.
    - Broadcast `room_update` to other players (to show user is back online).

### 3. Client-Side: Correct Rejoin Implementation
**File**: `src/client/src/modules/lobby/LobbyManager.tsx`
- **Fix**: In the `rejoin_room` emit call, explicitly include the `playerId`.
- **Enhancement**: Utilize the callback from the server to confirm reconnection before setting state.
- **Exit Handling**: The `handleExitRoom` function clears `localStorage`, which is correct for an explicit "Exit". However, thanks to the server-side change, if the user manually rejoins the same room code, they will reclaim their seat effectively.

## Verification Plan
1. **Test Reload**: Start a draft, refresh the browser. Verify user auto-rejoins as Player.
2. **Test Exit & Rejoin**: Start a draft, click "Exit Room". Re-enter the Room ID manually. Verify user rejoins as Player (not Spectator).
3. **Test New Draft**: Create a room, start draft. Open new tab (or exit), create NEW room. Verify new room works and old session doesn't interfere.
