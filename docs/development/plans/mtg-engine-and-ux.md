
# Implementation Plan: MTG Rules Engine & High-Velocity UX

## Objective
Implement a strict Magic: The Gathering rules engine (Backend) and a "Rich Input" high-velocity user experience (Frontend). The goal is to enforce 100% of the Comprehensive Rules on the server while allowing fluid, gesture-based actions on the client.

**Reference:** MagicCompRules 20251114.txt

---

## PART 1: THE RULES ENGINE (Server-Side Logic)

### A. Game Setup & Initialization (CR 103)
The engine must execute this sequence automatically before the first turn:

1.  **Deck Validation**: Verify decks meet format requirements (e.g., 60 cards min).
2.  **Life Initialization**: Set Life Totals to 20.
3.  **The Mulligan Process (CR 103.5)**:
    - **Initial Draw**: Both players draw 7 cards.
    - **Decision Loop**: Prompt players in turn order: "Keep Hand" or "Mulligan".
    - **Execution**: If Mulligan, shuffle hand into library and draw 7 new cards.
    - **London Rule**: For each Mulligan (N), user must select N cards to bottom.
    - **Concurrency**: Decisions sequential, Shuffles/Draws simultaneous.

### B. The Turn Structure State Machine (CR 500)
Strict phase cycle. Priority (CR 117) must be passed by both players to advance.

1.  **Beginning Phase (CR 501)**
    - **Untap Step**: AP untaps all permanents. No Priority.
    - **Upkeep Step**: Triggers go on stack. AP Priority.
    - **Draw Step**: AP draws. Triggers. AP Priority.

2.  **Pre-Combat Main Phase (CR 505)**
    - AP may Play Land (Special Action, 1/turn, Stack empty).
    - AP may Cast Sorcery/Creature/Artifact/Enchantment/Planeswalker.

3.  **Combat Phase (CR 506)**
    - **Start of Combat**: Triggers. Priority.
    - **Declare Attackers (CR 508)**:
        - AP selects attackers & targets (Player/Planeswalker).
        - Engine validates restrictions & taps attackers.
        - Triggers. AP Priority.
    - **Declare Blockers (CR 509)**:
        - DP assign blockers.
        - Engine validates (Flying, Menace, etc.).
        - Damage Ordering (if multi-blocked).
        - Triggers. AP Priority.
    - **Combat Damage (CR 510)**:
        - AP assigns damage (Lethal to 1st, then rest).
        - Damage dealt simultaneously.
        - Priority Check.
    - **End of Combat**: Priority Check.

4.  **Post-Combat Main Phase**
    - Identical to Pre-Combat Main.

5.  **Ending Phase (CR 512)**
    - **End Step**: Triggers. Priority.
    - **Cleanup Step (CR 514)**:
        - Discard to hand size.
        - Remove marked damage.
        - No Priority (unless trigger occurs).

### C. The Interaction Core: Priority & The Stack (CR 405 & 117)
LIFO (Last-In, First-Out) Array.

-   **Priority Passing (CR 117.3d)**: Game advances only when all players pass on empty stack.
-   **Response Window**: After cast, AP gets priority. If AP passes -> DP gets priority. If DP passes -> Resolve.
-   **State-Based Actions (The Referee Check - CR 704)**: Checked BEFORE every priority gain.
    -   **Lethal Damage**: Damage >= Toughness -> Graveyard.
    -   **0 Toughness**: Toughness <= 0 -> Graveyard.
    -   **Legend Rule**: Duplicate legendary -> Controller chooses capture.
    -   **Aura Check**: Invalid attachment -> Graveyard.

### D. Manual Mana Engine (CR 106)
-   **Production**: Tap Land -> Add color to **Floating Pool**.
-   **Spending**: Click symbol in pool to pay costs.
-   **Emptying**: Pool empties at end of every Step/Phase.

### E. Developer Notes & Edge Cases
-   **Layer System (CR 613)**: Must implement 7-Layer system (Copy, Control, Text, Type, Color, Ability, P/T).
-   **Token Generation**: Spawn game object with stats.
-   **Failure States**: Insufficient mana -> Bounce, Warning Flash.

---

## PART 2: THE "HIGH-VELOCITY" UX (Frontend Specification)

### 1. The "Smart" Priority Button
Context-aware button (Bottom Right).
-   **Green ("Pass")**: Stack empty. clicking passes/advances.
-   **Orange ("Resolve")**: Stack has object. Click resolves top.
-   **Red ("Damage/Block")**: Mandatory manual assignment waiting.
-   **Blue ("Choice")**: Modal choice required.
-   **"Yield" Toggle**: Auto-pass priority until End Step (unless response needed).

### 2. Gesture Controls (Mouse/Touch)
-   **Swipe-to-Tap**: Drag line across background/cards. Intersected lands toggle & add mana.
-   **Combat Swipes**:
    -   Attack: Swipe Up/Forward.
    -   Cancel Attack: Swipe Down/Back.
    -   Block: Drag blocker onto attacker.
-   **Targeting Tether**: Visual "rope" (Bezier curve) from source to target.

### 3. Contextual Radial Menus
**Scenario**: User taps Dual Land.
-   **Interaction**: Pie menu spawns under cursor.
-   **Action**: Slide toward symbol to select. Minimal travel.

### 4. Visualizing "The Stack"
Vertical list of tiles on screen edge.
-   **Hover/Long-press**: Show source card.
-   **Targeting**: Tiles must be valid targets for spells.

### 5. The "Inspector" Overlay
Long-press/Right-click on card.
-   **Display**: High-Res Art + Oracle Text.
-   **Live Math**: Show Net Power/Toughness (Base + Layers).

---

## Task Breakdown & Status

### Backend (Rules Engine)
- [x] **Core Structures**: `StrictGameState`, Phase, Step Types.
- [x] **State Machine Baseline**: Phase advancement logic.
- [x] **Priority Logic**: Passing, resolving, resetting.
- [x] **Basic Actions**: Play Land, Cast Spell.
- [x] **Stack Resolution**: Resolving Spells to Zones.
- [x] **SBAs Implementation**: Basic (Lethal, 0 Toughness, Legend).
- [ ] **Advanced SBAs**: Aura Validity check.
- [ ] **Manual Mana Engine**: Floating Pool Logic.
- [ ] **Game Setup**: Mulligan (London), Deck Validation.
- [ ] **Combat Phase Detail**: Declare Attackers/Blockers steps & validation.
- [ ] **Layer System**: Implement 7-layer P/T calculation.

### Frontend (High-Velocity UX)
- [x] **Game View**: Render State Types.
- [x] **Phase Strip**: Visual progress.
- [x] **Smart Button**: Basic States (Green/Orange/Red).
- [x] **Gesture Engine**: Swipe-to-Tap.
- [x] **Stack Visualization**: Basic Component.
- [ ] **Gesture Polish**: Combat Swipes, Targeting Tether.
- [ ] **Smart Button Advanced**: "Yield" Toggle.
- [ ] **Radial Menus**: Pie Menu for Dual Lands/Modes.
- [ ] **Inspector Overlay**: Live Math & Details.
