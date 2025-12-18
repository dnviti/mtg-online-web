# 2024-12-18 - Fix Strict Action Payload Construction

## Problem
The user reported a server crash/error: `Rule Violation [UNKNOWN]: Cannot read properties of undefined (reading 'type')`.
This occurred when resolving lands or casting spells. The error log "UNKNOWN" indicated the server received a null/undefined `action` object within the `game_strict_action` event payload.
The server expects `socket.emit('game_strict_action', { action: { type: '...' } })`.
The client was emitting `socket.emit('game_strict_action', { type: '...' })` (missing the `action` wrapper).

## Root Cause
When refactoring for the Strict Actions, the frontend calls for `handleZoneDrop` (Battlefield), `handleCardDrop`, and `handlePlayerDrop` were updated to emit the new event name `game_strict_action`, but the payload structure was not updated to wrap the data in an `{ action: ... }` object as expected by `server/index.ts`.

## Solution
Updated `GameView.tsx` in three locations (`handleZoneDrop`, `handleCardDrop`, `handlePlayerDrop`) to correctly wrap the payload:
```typescript
socketService.socket.emit('game_strict_action', {
  action: {
    type: '...',
    ...
  }
});
```

## Outcome
Client strict actions now match the server's expected payload structure. Actions like playing lands or casting spells should now execute defined logic instead of crashing or being treated as unknown.
