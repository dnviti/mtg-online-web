# Work Plan - Set Default Slider Values to Minimum

## Request
Set the default value for card size sliders to their minimum setting across all views:
1. Cube Manager (Draft Management)
2. Draft View (Online Draft Pick)
3. Deck Builder

## Changes
- **CubeManager.tsx**: Changed default `cardWidth` from `140` to `100`.
- **DraftView.tsx**: Changed default `cardScale` from `0.7` to `0.5`.
- **DeckBuilderView.tsx**: Changed default `cardWidth` from `150` to `100`.

## Verification
- Verified that the new default values match the `min` attribute of the respective range inputs.
- Verified that no other sliders exist in the codebase.
