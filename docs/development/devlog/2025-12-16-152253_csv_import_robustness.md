
# CSV Import Robustness Update

## Background
The user provided a specific CSV format associated with typical automated imports. The requirement was to extract relevant information (Quantity, Name, Finish, Scryfall ID) while ignoring other fields (such as Condition, Date Added, etc.).

## Changes
- Refactored `src/client/src/services/CardParserService.ts` to implement dynamic header parsing.
- The `parse` method now:
  - Detects if the first line is a CSV header containing "Quantity" and "Name".
  - Maps columns to indices based on the header.
  - Specifically looks for `Quantity`, `Name`, `Finish`, and `Scryfall ID` (checking common variations like 'scryfall_id', 'id', 'uuid').
  - Uses strictly mapped columns if a header is detected, ensuring other fields are ignored as requested.
  - Falls back gracefully to previous generic parsing logic if no matching header is found, preserving backward compatibility with Arena/MTGO exports and simple lists.

## Verification
- Verified manually via a test script that the provided CSV content parses correctly into the `CardIdentifier` memory structure.
- The extraction correctly identifies Quantity, Name, Finish (Normal/Foil), and Scryfall UUID.

## Next Steps
- Ensure the frontend `CubeManager` works seamlessly with this update (no changes needed there as it uses the service).
