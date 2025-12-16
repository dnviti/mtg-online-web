# 2025-12-16 - Fix Pack Duplication in Draft

## Problem
Users reported behavior consistent with "opening the same pack twice". This occurs when the pack objects distributed to players share the same memory reference. If the input source (e.g., from Frontend Generator) contains duplicate references (e.g., created via `Array.fill(pack)`), picking a card from "one" pack would seemingly remove it from "another" pack in a future round, or valid packs would re-appear.

## Solution
- Modified `DraftManager.createDraft` to enforce Strict Isolation of pack instances.
- Implemented **Deep Cloning**: Even if the input array contains shared references, we now map over `allPacks`, spreading the pack object and mapping the cards array to new objects.
- **Unique IDs**: Re-assigned a unique internal ID to every single pack (format: `draft-pack-{index}-{random}`) to guarantee that every pack in the system is distinct, regardless of the quality of the input data.

## Impact
- Ensures that every "pack" opened in the draft is an independent entity. 
- Prevents state leakage between rounds or players.
