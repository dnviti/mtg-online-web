# Restructure Battlefield Layout

**Status:** Planned
**Date:** 2025-12-18
**Description:**
Restructure the battlefield view in `GameView.tsx` from a free-form absolute positioning system to a structured, 3-zone layout (Creatures, Non-Creatures, Lands) using Flex/Grid. This improves readability and organization of the board state.

**Technical Plan:**
1.  **Categorization:** In `GameView.tsx`, split the `myBattlefield` array into three logical groups:
    -   **Creatures:** Any card with 'Creature' type (including Artifact Creatures and Land Creatures).
    -   **Lands:** Any card with 'Land' type that is NOT a creature.
    -   **Others:** Artifacts, Enchantments, Planeswalkers, Battles that are neither Creatures nor Lands.
2.  **Layout:** Replace the absolute `div` rendering with a Flexbox column container (`h-full flex flex-col`).
    -   **Combat Zone (Top):** `flex-1` (takes remaining space). Used for Creatures. Layout: `flex-wrap`, centered.
    -   **Support Zone (Middle):** Fixed height or proportional. Used for Artifacts/Enchantments.
    -   **Mana Zone (Bottom):** Fixed height. Used for Lands.
3.  **Action Logic:** Ensure drag-and-drop targeting and attacking/blocking selection still functions correctly within the new layout structure.
4.  **Visuals:** Maintain the existing `perspective` and 3D transforms for card interaction (hover, attack state).
