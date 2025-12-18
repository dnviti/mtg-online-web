# Work Plan - Stack View Sorting & Slider Updates

## Request
1.  **Slider Adjustment**: Decrease the scale of sliders globally.
    *   New Min (0%) should be smaller (~50% of previous min?).
    *   New Max (100%) should be equivalent to old 50%.
2.  **Stack View Default Sort**: "Order for Color and Mana Cost" by default everywhere.
3.  **Deck Builder Sorting**: Add UI to change sort order manually in Deck Builder.

## Changes
- **StackView.tsx**:
  - Refactored to support dynamic `groupBy` logic (Type, Color, CMC, Rarity).
  - Implemented categorization logic for Color, CMC, and Rarity.
  - Set default `groupBy` to `'color'` (sorts by Color groups, then CMC within groups).
  - Fixed syntax errors from previous edit.

- **DeckBuilderView.tsx**:
  - Added `groupBy` state (default `'color'`).
  - Added "Sort:" dropdown to toolbar when in Stack View.
  - Updated `CardsDisplay` to pass sorting preferences.
  - Updated Slider range to `min="60" max="200"` (Default `60`).

- **CubeManager.tsx**:
  - Updated Slider range to `min="60" max="200"`.
  - Updated default `cardWidth` to `60`.

- **DraftView.tsx**:
  - Updated Slider range to `min="0.35" max="1.0"`.
  - Updated default `cardScale` to `0.35`.

## Verification
- Verified `StackView` defaults to Color grouping in `CubeManager` (implicitly via default prop).
- Verified Deck Builder has sorting controls.
- Verified all sliders allow for much smaller card sizes.
