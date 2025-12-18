# Work Plan - Card Preview Threshold Update

## Request
- **Card Preview**: Change the trigger to show the full card to the what now is the new 50% (130px) instead of 200px.

## Changes
- **PackCard.tsx**: Updated logic to `cardWidth < 130` for art crop usage and `cardWidth >= 130` for hover preview prevention.
- **StackView.tsx**: Updated logic to `cardWidth < 130` and `cardWidth >= 130` respectively.

## Verification
- Verified code changes in `PackCard.tsx` and `StackView.tsx` via `replace_file_content` outputs.
- `DeckBuilderView.tsx` was already updated in previous step.
