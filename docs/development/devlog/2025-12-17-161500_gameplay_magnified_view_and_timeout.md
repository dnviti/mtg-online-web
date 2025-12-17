# Gameplay Magnified View Details Update

## Requirements
- Display detailed card information (Oracle Text, Type Line, Mana Cost) in the magnified view on the battlefield.

## Implementation Details

### Data Model Updates
- **`CardInstance` Interface**: Added optional fields `typeLine`, `oracleText`, and `manaCost` to both client (`src/client/src/types/game.ts`) and server (`src/server/managers/GameManager.ts`) definitions.
- **`DraftCard` Interface**: Added `oracleText` and `manaCost` to the server-side interface (`PackGeneratorService.ts`).

### Logic Updates
- **`PackGeneratorService.ts`**: Updated `processCards` to map `oracle_text` and `mana_cost` from Scryfall data to `DraftCard`.
- **`src/server/index.ts`**: Updated all `addCardToGame` calls (timeout handling, player ready, solo test, start game) to pass the new fields from the draft card/deck source to the `CardInstance`.

### UI Updates (`GameView.tsx`)
- Updated the **Zoom Sidebar** to conditionally render:
    - **Mana Cost**: Displayed in a monospace font.
    - **Type Line**: Displayed in emerald color with uppercase styling.
    - **Oracle Text**: Displayed in a formatted block with proper whitespace handling.
- Replaced undefined `cardIsCreature` helper with an inline check.

## Verification
- Hovering over a card in the game view now shows not just the image but also the text details, which is crucial for readability of complex cards.
