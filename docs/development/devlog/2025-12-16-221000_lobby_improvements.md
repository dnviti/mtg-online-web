# implementation_plan - Lobby Improvements and Kick Functionality

This plan addresses user feedback regarding the draft resumption experience, exit button placement, and host management controls.

## User Objectives
1.  **Resume Draft on Re-entry**: Ensure that manually joining a room (after exiting) correctly restores the draft view if a draft is in progress.
2.  **Exit Button Placement**: Move the "Exit Room" button to be near the player's name in the lobby sidebar.
3.  **Kick Player**: Allow the Host to kick players from the room.

## Proposed Changes

### 1. Server-Side: Kick Functionality
**File**: `src/server/managers/RoomManager.ts`
- **Method**: `kickPlayer(roomId, playerId)`
- **Logic**: 
    - Remove the player from `room.players`.
    - If the game is active (drafting/playing), this is a destructive action. We will assume for now it removes them completely (or marks offline? "Kick" usually implies removal). 
    - *Decision*: If kicked, they are removed. If the game breaks, that's the host's responsibility.

**File**: `src/server/index.ts`
- **Event**: `kick_player`
- **Logic**:
    - Verify requester is Host.
    - Call `roomManager.kickPlayer`.
    - Broadcast `room_update`.
    - Emit `kicked` event to the target socket (to force them to client-side exit).

### 2. Client-Side: Re-entry Logic Fix
**File**: `src/client/src/modules/lobby/GameRoom.tsx`
- **Logic**: Ensure `GameRoom` correctly initializes or updates `draftState` when receiving new props.
- Add a `useEffect` to update local `draftState` if `initialDraftState` prop changes (though `key` change on component might be better, we'll use `useEffect`).

### 3. Client-Side: UI Updates
**File**: `src/client/src/modules/lobby/GameRoom.tsx`
- **Sidebar**:
    - Update the player list rendering.
    - If `p.id === currentPlayerId`, show an **Exit/LogOut** button next to the name.
    - If `isMeHost` and `p.id !== me`, show a **Kick/Ban** button next to the name.
- **Handlers**:
    - `handleKick(targetId)`: Warning confirmation -> Emit `kick_player`.
    - `handleExit()`: Trigger the existing `onExit`.

## Verification Plan
1.  **Test Kick**: Host kicks a player. Player should be removed from list and client should revert to lobby (via socket event).
2.  **Test Exit**: Click new Exit button in sidebar. Should leave room.
3.  **Test Re-join**: Join the room code again. Should immediately load the Draft View (not the Lobby View).
