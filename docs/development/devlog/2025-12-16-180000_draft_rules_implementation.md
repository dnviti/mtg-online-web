# 2025-12-16 - Draft Rules and Logic Implementation

## Draft Minimum Players
- Added backend check in `index.ts` to prevent drafting with fewer than 4 players.
- Emit `draft_error` to room if condition is not met.
- Added `draft_error` listener in `GameRoom.tsx` to notify users.

## 4-Player Draft Rules (Pick 2)
- Modified `DraftManager.ts`:
  - Added `pickedInCurrentStep` to track picks within a single pack pass cycle.
  - Implemented logic in `pickCard`:
    - If 4 players: Require 2 picks before passing pack.
    - Else: Require 1 pick.
  - Logic handles pack exhaustion (if pack runs out before picks completed, it passes).

## Robustness
- Updated `rejoin_room` handler in `index.ts` to send the current `draft` state if the room is in `drafting` status. This allows users to refresh and stay in the draft flow (critical for multi-pick scenarios).
