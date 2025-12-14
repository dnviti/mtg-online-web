# Enhancement Plan: True 3D Game Area

The goal is to transform the game area into a "really 3D game" experience using CSS 3D transforms.

## Objectives
1.  **Immersive 3D Table**: Create a convincing 3D perspective of a table where cards are placed.
2.  **Card Physics Simulation**: Visuals should simulate cards having weight, thickness, and position in 3D space.
3.  **Dynamic Camera/View**: Fix the viewing angle to be consistent with a player sitting at a table.

## Implementation Steps

### 1. Scene Setup (GameView.tsx)
-   Create a "Scene" container with high `perspective` (e.g., `1200px` to `2000px`).
-   Create a "World" container that holds the table and other elements, allowing for global rotation if needed.
-   Implement a "TableSurface" div that is rotated `rotateX(40-60deg)` to simulate a flat surface viewed from an angle.

### 2. Battlefield Enchancement
-   The player's battlefield should be the bottom half of the table.
-   The opponent's battlefield should be the top half.
-   Use `transform-style: preserve-3d` extensively.
-   Add a grid/mat texture to the table surface to enhance the depth perception.

### 3. Card 3D Component (CardComponent.tsx)
-   Refactor `CardComponent` to use a 3D structure.
-   Add a container for 3D positioning (`translate3d`).
-   Add a visual "lift" when dragging or hovering (`translateZ`).
-   Enhance the shadow to be on the "table" surface, separating from the card when lifting.
    -   *Implementation Note*: The shadow might need to be a separate element `after` the card or a separate div to stay on the table plane while the card lifts.

### 4. Lighting and Atmosphere
-   Add a "Light Source" effect (radial gradient overlay).
-   Adjust colors to be darker/moodier, fitting the "Dark Gaming UI" aesthetic.

## Tech Stack
-   CSS via Tailwind + Inline Styles for dynamic coordinates.
-   React for state/rendering.

## Execution Order
1.  Refactor `GameView.tsx` layout to standard CSS 3D Scene structure.
2.  Update `CardComponent.tsx` to handle 3D props (tilt, lift).
3.  Fine-tune values for perspective and rotation.
