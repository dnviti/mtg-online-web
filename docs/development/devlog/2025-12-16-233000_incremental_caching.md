# Incremental Data Caching

## Objective
Enable caching of card data to the server incrementally per set when multiple sets are selected, rather than sending a single massive payload at the end. avoiding `PayloadTooLargeError`.

## Implementation Details
1.  **Helper Function**: Created `cacheCardsToServer` helper within `fetchAndParse` to handle server communication for a chunk of cards.
2.  **Incremental Loop**: Modified the set fetching loop to call `cacheCardsToServer` immediately after receiving data for each set.
3.  **UI Feedback**: Updated progress text to clearly indicate when the system is "Caching [Set Name]..." to the server.
4.  **Error Handling**: Added try/catch within the caching helper to prevent a single cache failure from aborting the entire fetch process (logs error to console).

## Status
Completed. Large multi-set fetches should now be robust against body size limits.
