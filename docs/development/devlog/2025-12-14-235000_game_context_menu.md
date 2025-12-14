# Game Context Menu & Immersion Update Plan

## Goal
Implement a robust, video-game-style context menu for the battlefield and cards. This menu will allow players to perform advanced manual actions required for MTG, such as creating tokens and managing counters, while eliminating "browser-like" feel.

## Status: Completed

## Implemented Features
- **Custom Game Context Menu**:
    - Replaces default browser context menu.
    - Dark, video-game themed UI with glassmorphism.
    - Animated entrance (fade/zoom).
- **Functionality**:
    - **Global (Background)**:
        - "Create Token" (Default 1/1, 2/2, Treasure).
    - **Card Specific**:
        - "Tap / Untap"
        - "Flip Face Up / Down"
        - "Add Counter" (Submenu: +1/+1, -1/-1, Loyalty)
        - "Clone (Copy)" (Creates an exact token copy of the card)
        - "Delete Object" (Removing tokens or cards)
- **Backend Logic**:
    - `GameManager` now handles:
        - `ADD_COUNTER`: Adds/removes counters logic.
        - `CREATE_TOKEN`: Generates new token instances with specific stats/art.
        - `DELETE_CARD`: Removes objects from the game.
- **Frontend Integration**:
    - `GameView` manages menu state (position, target).
    - `CardComponent` triggers menu only on itself, bubbling prevented.
    - Hand cards also support right-click menus.

## Files Modified
- `src/client/src/modules/game/GameContextMenu.tsx`: New component.
- `src/client/src/modules/game/GameView.tsx`: Integrated menu.
- `src/server/managers/GameManager.ts`: Added token/counter handlers.

## Next Steps
- Add sounds for menu open/click.
- Add more token types or a token editor.
