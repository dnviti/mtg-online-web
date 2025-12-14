# Work Plan: Real Game & Online Multiplayer

## User Epics
1. **Lobby System**: Create and join private rooms.
2. **Game Setup**: Use generated packs to start a game.
3. **Multiplayer Draft**: Real-time drafting with friends.
4. **Chat**: In-game communication.

## Tasks

### 1. Backend Implementation (Node.js + Socket.IO)
- [ ] Create `src/server/managers/RoomManager.ts` to handle room state.
- [ ] Implement `Room` and `Player` interfaces.
- [ ] Update `src/server/index.ts` to initialize `RoomManager` and handle socket events:
    - `create_room`
    - `join_room`
    - `leave_room`
    - `send_message`
    - `start_game` (placeholder for next phase)

### 2. Frontend Implementation (React)
- [ ] Create `src/client/src/modules/lobby` directory.
- [ ] Create `LobbyManager.tsx` (The main view for finding/creating rooms).
- [ ] Create `GameRoom.tsx` (The specific room view with chat and player list).
- [ ] Create `socket.ts` service in `src/client/src/services` for client-side socket handling.
- [ ] Update `App.tsx` to include the "Lobby" tab.
- [ ] Update `CubeManager.tsx` to add "Create Online Room" button.

### 3. Integration
- [ ] Ensure created room receives the packs from `CubeManager`.
- [ ] Verify players can join via Room ID.
- [ ] Verify chat works.

## Technical Notes
- Use `socket.io-client` on frontend.
- Generate Room IDs (short random strings).
- Manage state synchronization for the room (players list updates).
