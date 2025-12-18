# Strict Rules & Blocking UI (Part 3)

## Status: Completed

## Objectives
- Integrate Strict Actions (`PLAY_LAND`, `CAST_SPELL`) with precise positioning.
- Implement Blocking UI including visual feedback (Attacking/Blocking badges, Rings).
- Implement Drag-and-Drop Targeting Logic (Spell -> Target, Blocker -> Attacker).
- Implement Visual "Targeting Tether" overlay.

## Implementation Details

### Backend (Rules Engine)
- **Positioning**: Updated `playLand` and `castSpell` to accept `{x, y}` coordinates.
- **Stack Resolution**: Updated `resolveTopStack` to respect the stored resolution position when moving cards to the battlefield.
- **Action Handling**: Updated `GameManager` to pass `position` payload to the engine.

### Frontend (GameView)
- **Drop Logic**:
  - `handleZoneDrop`: Detects drop on "Battlefield". Differentiates Land (Play) vs Spell (Cast). Calculates relative % coordinates.
  - `handleCardDrop`: Detects drop on a Card.
    - If `declare_blockers` step: Assigns blocker (drag My Creature -> Opponent Creature).
    - Else: Casts Spell with Target.
  - `handlePlayerDrop`: Detects drop on Opponent Avatar -> Cast Spell with Target Player.
- **Blocking Visualization**:
  - **Opponent Cards**: Show "ATTACKING" badge (Red Ring + Shadow) if `attacking === property`.
  - **My Cards**: Show "Blocking" badge (Blue Ring) if in local `proposedBlockers` map.
- **Targeting Tether**:
  - Implemented `tether` state (`startX`, `currentX`, etc.).
  - Added `onDrag` handler to `CardComponent` to track HTML5 DnD movement.
  - Rendered Full-screen SVG overlay with Bezier curve (`Q` command) and arrow marker.
  - Dynamic styling: Cyan (Spells) vs Blue (Blocking).

## Next Steps
- **Layer System**: Implement 7-layer P/T calculation for accurate power/toughness display.
- **Mulligan System**: Implement Strict Mulligan rules.
- **Token Creation**: Support creating tokens.
