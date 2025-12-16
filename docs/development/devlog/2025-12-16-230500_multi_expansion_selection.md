# Multi-Expansion Selection

## Objective
Enhanced the "From Expansion" pack generation feature in the Cube Manager to allow users to select multiple expansions and use a searchable interface.

## Implementation Details
1.  **Searchable Interface**: Replaced the simple set dropdown with a dedicated set selection UI featuring a search input for fuzzy filtering by set name or code.
2.  **Multi-Select Capability**: Users can now check multiple sets from the filtered list.
3.  **Frontend State Refactor**: Migrated `selectedSet` (string) to `selectedSets` (string array) in `CubeManager.tsx`.
4.  **Fetch Logic Update**: Updated `fetchAndParse` to iterate through all selected sets, fetching card data for each sequentially and combining the results into the parse pool.
5.  **Generation Logic**: The existing `generateBoosterBox` logic now naturally consumes the combined pool of cards from multiple sets, effectively allowing for "Chaos Drafts" or custom mixed-set environments based on the user's selection.

## Status
Completed. The Cube Manager UI now supports advanced set selection scenarios.
