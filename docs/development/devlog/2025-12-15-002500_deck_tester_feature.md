# Deck Tester Feature Implementation

## Objective
Create a way to add a cards list to generate a deck and directly enter the game ui to test the imported deck, using the same exact game and battlefield of the draft.

## Implementation Details

### Frontend
1.  **DeckTester Component (`src/client/src/modules/tester/DeckTester.tsx`)**:
    - Created a new component that allows users to input a deck list (text area or file upload).
    - Reused `CardParserService` and `ScryfallService` to parse the list and fetch card data.
    - Implemented image caching logic (sending to `/api/cards/cache`).
    - Connects to socket and emits `start_solo_test`.
    - Upon success, switches view to `GameRoom` with the received `room` and `game` state.

2.  **App Integration (`src/client/src/App.tsx`)**:
    - Added a new "Deck Tester" tab to the main navigation.
    - Uses the `Play` icon from lucide-react.

3.  **GameRoom Enhancement (`src/client/src/modules/lobby/GameRoom.tsx`)**:
    - Added `initialGameState` prop to allow initializing the `GameView` immediately without waiting for a socket update (handling potential race conditions or state sync delays).

### Backend
1.  **Socket Event (`src/server/index.ts`)**:
    - Added `start_solo_test` event handler.
    - Creates a room with status `playing`.
    - Initializes a game instance.
    - Adds cards from the provided deck list to the game (library zone).
    - Emits `room_update` and `game_update` to the client.

## Outcome
The user can now navigate to "Deck Tester", paste a deck list, and immediately enter the 3D Game View to test interactions on the battlefield. This reuses the entire Draft Game infrastructure, ensuring consistency.
