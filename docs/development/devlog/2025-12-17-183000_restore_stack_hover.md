# Restore Hover Magnified Card for Stack View

## Task
Restore the hover magnified card functionality for the stacked view in the pack generation UI, while ensuring it remains disabled for the deck building UI.

## Changes
- Modified `src/client/src/components/StackView.tsx`:
  - Imported `CardHoverWrapper`.
  - Added `disableHoverPreview` prop (default `false`).
  - Wrapped card elements with `CardHoverWrapper`, passing `preventPreview` based on the new prop and card width.
- Modified `src/client/src/modules/draft/DeckBuilderView.tsx`:
  - Passed `disableHoverPreview={true}` to `StackView` to maintain existing behavior for the deck builder (which uses a dedicated sidebar preview).

## Outcome
- Pack Generation UI (Cube Manager) now shows floating previews for cards in Stack View.
- Deck Builder UI remains unchanged (no double previews).
