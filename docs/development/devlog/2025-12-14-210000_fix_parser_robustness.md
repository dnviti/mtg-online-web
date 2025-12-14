# Bug Fix: Card Parser Robustness

## User Request
"The problem is that if the scryfall id is missing, no card is retrieved so no card is generated, instead the system should be able to retrieve cards and generate packs even without scryfall id"

## Diagnosis
The `CardParserService` currently performs basic name extraction. It fails to strip set codes and collector numbers common in export formats (e.g., MTG Arena exports like `1 Shock (M20) 160`).
This causes `ScryfallService` to search for "Shock (M20) 160" as an exact name, which fails. The system relies on successful Scryfall matches to populate the card pool; without matches, the pool is empty, and generation produces 0 packs.

## Implementation Plan
1.  **Refactor `CardParserService.ts`**:
    *   Enhance regex to explicitly handle and strip:
        *   Parentheses containing text (e.g., `(M20)`).
        *   Collector numbers at the end of lines.
        *   Set codes in square brackets if present.
    *   Maintain support for `Quantity Name` format.
    *   Ensure exact name cleanup to maximize Scryfall "exact match" hits.

2.  **Verification**:
    *   Create a test input imitating Arena export.
    *   Verify via browser subagent that cards are fetched and packs are generated.

## Update Central
Update `CENTRAL.md` with this task.
