# Fix Hooks Violation and Implement Waiting State

## Issue
1.  **React Hook Error**: Users encountered "Rendered fewer hooks than expected" when the game started. This was caused by conditional returns in `GameRoom.tsx` appearing *before* hook declarations (`useState`, `useEffect`).
2.  **UX Issue**: Players who submitted their decks remained in the Deck Builder view, able to modify their decks, instead of seeing a waiting screen.

## Fixes
1.  **Refactored `GameRoom.tsx`**:
    -   Moved all `useState` and `useEffect` hooks to the top level of the component, ensuring they are always called regardless of the render logic.
    -   Encapsulated the view switching logic into a helper function `renderContent()`, which is called inside the main return statement.
2.  **Implemented Waiting Screen**:
    -   Inside `renderContent`, checking if the room is in `deck_building` status AND if the current player has `ready: true`.
    -   If ready, displays a "Deck Submitted" screen with a list of other players and their readiness status.
    -   Updated the sidebar player list to show a "• Ready" indicator.

## Verification
1.  Start a draft with multiple users (or simulate it).
2.  Complete draft and enter deck building.
3.  Submit deck as one player.
4.  Verify that the view changes to "Deck Submitted" / Waiting screen.
5.  Submit deck as the final player.
6.  Verify that the game starts automatically for everyone without crashing (React Error).
