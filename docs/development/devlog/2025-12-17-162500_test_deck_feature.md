# Test Deck Feature Implementation

## Requirements
- Allow users to "Test Deck" directly from the Cube Manager (Pack Generator).
- Create a randomized deck from the generated pool (approx. 23 spells + 17 lands).
- Start a solo game immediately.
- Enable return to lobby.

## Implementation Details

### Client-Side Updates
- **`App.tsx`**: Passed `availableLands` to `CubeManager` to allow for proper basic land inclusion in randomized decks.
- **`CubeManager.tsx`**:
    - Added `handleStartSoloTest` function.
    - Logic: Flattens generated packs, separates lands/spells, shuffles and picks 23 spells, adds 17 basic lands (using `availableLands` if available).
    - Emits `start_solo_test` socket event with the constructed deck.
    - On success, saves room ID to `localStorage` and navigates to the Lobby tab using `onGoToLobby`.
    - Added "Test Solo" button to the UI next to "Play Online".
- **`LobbyManager.tsx`**: Existing `rejoin_room` logic (triggered on mount via `localStorage`) handles picking up the active session.

### Server-Side Updates
- **`src/server/index.ts`**:
    - Updated `rejoin_room` handler to emit `game_update` if the room status is `playing`. This ensures that when the client navigates to the lobby and "rejoins" the solo session, the game board is correctly rendered.

## User Flow
1. User generates packs in Cube Manager.
2. User clicks "Test Solo".
3. System builds a random deck and creates a solo room on the server.
4. UI switches to "Online Lobby" tab.
5. Lobby Manager detects the active session and loads the Game Room.
6. User plays the game.
7. User can click "Leave Room" icon in the sidebar to return to the Lobby creation screen.
