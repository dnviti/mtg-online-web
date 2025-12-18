
# 2024-12-18 16:55:00 - Implement Server Persistence and Room Cleanup

## Description
Implemented server-side state persistence to ensure game rooms, drafts, and game states survive server restarts and network issues. Added logic to keep rooms alive for at least 8 hours after the last activity, satisfying the requirements for robustness and re-joinability.

## Key Changes
1.  **Persistence Manager**:
    - Created `PersistenceManager.ts` to save and load `rooms`, `drafts`, and `games` to/from JSON files in `./server-data`.
    - Integrated into `server/index.ts` with auto-save interval (every 5s) and save-on-shutdown.

2.  **Room Manager**:
    - Added `lastActive` timestamp to `Room` interface.
    - Updated `lastActive` on all significant interactions (join, leave, message, etc.).
    - Implemented `disconnect` logic: if players disconnect, the room is NOT deleted immediately.
    - Implemented `leaveRoom` logic: Explicit leaving (waiting phase) still removes players but preserves the room until cleanup if empty.
    - Added `cleanupRooms()` method running every 5 minutes to delete rooms inactive for > 8 hours.

## Impact
- **Reliability**: Server crashes or restarts will no longer wipe out active games or drafts.
- **User Experience**: Users can reconnect to their room even hours later (up to 8 hours), or after a server reboot, using their room code.
- **Maintenance**: `server-data` directory now contains the active state, useful for debugging.

## Status
- [x] Code implementation complete.
- [ ] Verify `server-data` folder is created and populated on run.
