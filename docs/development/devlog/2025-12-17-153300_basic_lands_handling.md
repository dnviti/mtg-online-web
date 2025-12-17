# Basic Lands Handling

## Requirements
- Upon draft room creation, basic lands from the selected sets must be cached and loaded.
- During deck building, players must have access to an infinite number of these basic lands matching the selected sets.

## Implementation Details

### Server-Side
- **Pack Generation**: Updated `/api/packs/generate` to extract unique basic lands from the processed card pool and return them in the response: `{ packs, basicLands }`.
- **Room Management**: Updated `RoomManager` and `Room` interface to store `basicLands` array.
- **Socket Events**: Updated `create_room` event handler to accept `basicLands` and pass them to the room creation logic.

### Client-Side
- **State Management**: Added `availableLands` state to `App.tsx` with local storage persistence to persist lands between generation and lobby creation.
- **Cube Manager**: Updated `handleGenerate` to parse the new API response and update specific state.
- **Lobby Manager**:
    - Enhanced `handleCreateRoom` to include basic lands in the server-side image caching request.
    - Updated `create_room` socket emission to send the basic lands to the server.
- **Deck Builder**:
    - Added a "Land Station" UI component.
    - If specific basic lands are available, it displays a horizontal scrollable gallery of the unique land arts.
    - Clicking a land adds a unique copy (with a specific ID) to the deck, allowing for infinite copies.
    - Preserved fallback to generic land counters if no specific lands are available.

## Verification
- Verified flow from pack generation -> lobby -> room -> deck builder.
- Validated that lands are deduplicated by Scryfall ID to ensure unique arts are offered.
