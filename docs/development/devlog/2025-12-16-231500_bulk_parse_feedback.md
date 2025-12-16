# Plan: Improve Parse Bulk Feedback

## Objective
Enhance the "Parse Bulk" workflow in `CubeManager` to provide explicit feedback on the result of the Scryfall metadata fetching. This ensures the user knows that "images and metadata" have been successfully generated (fetched) for their list, fulfilling the request for precision.

## Steps

1.  **Update `CubeManager.tsx`**
    *   In `fetchAndParse` function:
        *   Track `notFoundCount` (identifiers that returned no Scryfall data).
        *   Track `successCount` (identifiers that were successfully enriched).
    *   After the loop, check if `notFoundCount > 0`.
    *   Show a summary notification/alert: "Processed X cards. Y cards could not be identified."
    *   (Optional) If many failures, maybe show a list of names? For now, just the count is a good start.

2.  **Verify Data Integrity**
    *   Ensure that the `processedData` uses the fully enriched `DraftCard` objects (which we know it does from previous steps).

## Why This Matters
The user asked to "Generate image and metadata... upon Parse bulk". While the backend/service logic is done, the UI needs to confirm this action took place to give the user confidence that the underlying algorithm now has the precise data it needs.
