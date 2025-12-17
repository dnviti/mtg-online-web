# Customizable Deck Builder Layout

## Request
The user wants to customize the Deck Builder interface with the following features:
1.  **Layout Modes**:
    *   **Vertical View (Default)**: The current 3-column layout ([Zoom] | [Pool] | [Deck + Lands]).
    *   **Horizontal View**: A new layout where Pool is above the Deck. Land Station should be to the left of the Card Pool in this mode.
2.  **Land Station Updates**:
    *   Remove "(Unlimited)" text.
    *   Increase container height.
    *   Integrate proper Land Advisor into the Land Station container to save space.

## Design
### New Layout State
- State: `layout: 'vertical' | 'horizontal'`
- Toggle: A button group or switch to change layouts.

### Component Structure
I will extract the core sections into render functions or variables to move them around easily.
- `renderZoomSidebar()`
- `renderPool()`
- `renderDeck()`
- `renderLandStation()` (This will now include the Land Advisor inside it)

### Horizontal Layout Grid
Structure:
```
[Zoom Sidebar (Fixed Left)] | [Main Content (Flex Column)]
                              |
                              |-- [Top Row (Flex Row)]
                              |    |-- [Land Station (width fixed or flex)]
                              |    |-- [Pool (Flex 1)]
                              |
                              |-- [Bottom Row (Flex 1)]
                                   |-- [Deck]
```

### Vertical Layout Grid (Current)
Structure:
```
[Zoom Sidebar] | [Pool] | [Deck + Land Station]
```
*Note: In current layout, Land Station is stacked vertically with Deck in the 3rd column. User is fine with "exactly how is it now" for vertical.*

### Land Station Refactoring
- Combine `Advice Panel` and `Land Station` div.
- Remove `(Unlimited)`.
- Increase height (e.g., `h-64` or `min-h-[200px]`).

## Implementation Steps
1.  Read `DeckBuilderView.tsx` (already read).
2.  Refactor to extract render helper functions for clear modularity.
3.  Add `layout` state and toggle UI.
4.  Implement CSS grids/flex layouts for both modes.
5.  Modify Land Station to include Advisor and styling updates.
