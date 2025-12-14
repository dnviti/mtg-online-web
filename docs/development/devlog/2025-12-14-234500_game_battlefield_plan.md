# Game Battlefield & Manual Mode Implementation Plan

## Goal
Implement a 3D-style battlefield and manual game logic for the MTG Draft Maker. The system should allow players to drag and drop cards freely onto the battlefield, tap cards, and manage zones (Hand, Library, Graveyard, Exile) in a manual fashion typical of virtual tabletops.

## Status: Completed

## Implemented Features
- **3D Battlefield UI**: 
    - Used CSS `perspective: 1000px` and `rotateX` to create a depth effect.
    - Cards are absolutely positioned on the battlefield based on percentage coordinates (0-100%).
    - Shadows and gradients enhance the "tabletop" feel.
- **Manual Game Logic**:
    - **Free Drag and Drop**: Players can move cards anywhere on the battlefield. Coordinates are calculated relative to the drop target.
    - **Z-Index Management**: Backend tracks a `maxZ` counter. Every move or flip brings the card to the front (`z-index` increment).
    - **Actions**:
        - **Tap/Untap**: Click to toggle (rotate 90 degrees).
        - **Flip**: Right-click to toggle face-up/face-down status.
        - **Draw**: Click library to draw.
        - **Life**: Buttons to increment/decrement life.
- **Multiplayer Synchronization**:
    - All actions (`MOVE_CARD`, `TAP_CARD`, `FLIP_CARD`, `UPDATE_LIFE`) are broadcast via Socket.IO.
    - Opponent's battlefield is rendered in a mirrored 3D perspective.

## Files Modified
- `src/client/src/modules/game/GameView.tsx`: Main UI logic.
- `src/client/src/modules/game/CardComponent.tsx`: Added context menu support.
- `src/server/managers/GameManager.ts`: Logic for actions and state management.

## Next Steps
- Test with real players to fine-tune the "feel" of dragging (maybe add grid snapping option later).
- Implement "Search Library" feature (currently just Draw).
