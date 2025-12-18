# Work Plan - Persist Resize State

## Request
The user wants resized areas (sidebar and pool) to be remembered (persisted) so they reopen with the same sizes.

## Changes
- **DraftView.tsx**:
    - Updated initialization of `sidebarWidth` state to read from `localStorage.getItem('draft_sidebarWidth')`.
    - Added `useEffect` to save `sidebarWidth` to `localStorage` whenever it changes.
    - Verified `poolHeight` persistence logic already exists.

- **DeckBuilderView.tsx**:
    - Updated initialization of `sidebarWidth` and `poolHeightPercent` to read from `localStorage` keys `deck_sidebarWidth` and `deck_poolHeightPercent`.
    - Added `useEffect` hooks to persist both values to `localStorage`.
    - Added `useEffect` to imports (fixed lint error).

## Verification
- **Test**: Refreshing the page after resizing the sidebar or pool panel should restore the previous dimensions exactly.
