# View Scale Slider

## Objective
Provide the user with granular control over card thumbnail sizes across the application, ensuring consistency between Grid and Stack views.

## Changes
- **CubeManager**:
    - Added a new `cardWidth` state variable, persisted to `localStorage` (default `140px`).
    - Introduced a **Range Slider** in the top-right control toolbar (visible on desktop) allowing adjustment from 100px to 300px.
    - Passed `cardWidth` down to `PackCard`.
- **PackCard (Grid View)**:
    - Replaced the responsive `grid-cols-*` logic with a `flex flex-wrap` layout.
    - Each card container now receives an explicit `style={{ width: cardWidth }}`.
- **StackView (Stack View)**:
    - Accepted `cardWidth` prop.
    - Applied `style={{ width: cardWidth }}` to the column containers, dynamically ensuring that stacks resize in sync with the grid view setting.

## Result
Users can now drag a slider to instantly resize all card thumbnails on the screen. This allows for customized density—make cards huge to admire the art, or tiny to see the entire cube/pool at a glance—with perfect size synchronization between the different view modes.
