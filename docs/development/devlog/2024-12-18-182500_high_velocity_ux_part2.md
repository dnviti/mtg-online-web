# High Velocity UX & Strict Engine (Part 2)

## Status: Completed

## Objectives
- Implement "Manual Mana Engine" allowing players to add mana to their pool via interaction.
- Implement "Strict Combat Engine" supporting `DECLARE_ATTACKERS` and `DECLARE_BLOCKERS` phases and validation.
- Implement "High Velocity UX" with Swipe-to-Tap and Swipe-to-Attack gestures.
- Enhance `GameView` with Mana Pool display and visual feedback for combat declarations.
- Contextualize `SmartButton` to handle complex actions like declaring specific attackers.

## Implementation Details

### Backend (Rules Engine)
- **Mana System**: Added `addMana` method to `RulesEngine` and `manaPool` to `PlayerState`. Implemented `emptyManaPools` logic on step transition.
- **Combat Logic**: Implemented `declareAttackers` (checking summoning sickness, tapping, setting attacking target) and `declareBlockers` logic.
- **Action Handling**: Updated `GameManager` to handle `ADD_MANA` and auto-generate mana when tapping Basic Lands via `TAP_CARD` action (legacy compatibility wrapper).

### Frontend (GameView)
- **Mana Pool UI**: Added a compact Mana Pool display in the player life area, showing WUBRGC counts.
- **Gesture Manager Upgrade**: Enhanced `GestureManager` to detect swipe direction:
  - **Slash (Horizontal)**: Tap Card.
  - **Thrust (Vertical Up)**: Attack (if in combat step).
  - **Thrust (Vertical Down)**: Cancel Attack.
- **Combat Visuals**: Implemented `proposedAttackers` local state. Cards proposed to attack are visually lifted (`translateY(-40px)`) and glow red (`box-shadow`, `ring`).
- **Smart Button**: Updated to accept `contextData`. In `declare_attackers` step, it displays "Attack with N" and sends the list of proposed attackers.

### Type Synchronization
- Synced `CardInstance` (Client) with `CardObject` (Server) to include `attacking` and `blocking` fields.

## Next Steps
- Verify Multiplayer Sync (Socket events are already in place).
- Implement "Blocking" UI (similar to Attacking but for defenders).
- Implement "Order Blockers" / "Damage Assignment" if strict compliance is enforced (currently simplified to auto-damage).
