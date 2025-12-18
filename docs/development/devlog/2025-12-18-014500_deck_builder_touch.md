# Work Plan - Deck Builder Touch Interaction Updates

## Request
1. Change "Deck" zone name to "Library" in the UI.
2. Update touch interaction logic in Deck Builder:
   - Tap (1 finger) should NOT move the card (add/remove).
   - Tap (1 finger) should show the Card Preview (like in Draft Pick).
   - Drag and Drop remains the method to move cards on touch devices.

## Changes
- **DeckBuilderView.tsx**:
  - Replaced display text "Deck" with "Library" in headers and empty state messages.
  - Updated `ListItem`, `DeckCardItem`, and `StackView` `onClick` handlers.
  - Implemented `window.matchMedia('(pointer: coarse)')` check to toggle behavior:
    - **Touch**: Tap -> `onHover(card)` (Preview)
    - **Mouse**: Click -> `onCardClick(card)` (Add/Remove)

## Verification
- Verified code changes apply to all view modes (List, Grid, Stack).
- Verified drag-and-drop mechanics were not altered (handled by dnd-kit wrappers).
