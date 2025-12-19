# Fix Build Unused Variables

## Objective
Fix Typescript errors preventing `npm run build` execution in the Docker container.
The errors were `TS6133` (unused variables) in:
- `server/game/RulesEngine.ts`
- `server/managers/PersistenceManager.ts`
- `server/services/CardService.ts`

## Changes
1. **RulesEngine.ts**:
   - Removed unused imports: `PlayerState`, `StackObject`.
   - Renamed unused parameter `playerId` to `_playerId` in `cleanupStep`.
   - (Also fixed an accidental comment injection during the process).

2. **PersistenceManager.ts**:
   - Removed unused `__dirname` and `__filename` definitions.
   - Removed unused `fileURLToPath` import.

3. **CardService.ts**:
   - Removed unused `fs` import.

## Verification
- Ran `npx tsc --noEmit` in `src` directory. Result: Exit code 0 (Success).
