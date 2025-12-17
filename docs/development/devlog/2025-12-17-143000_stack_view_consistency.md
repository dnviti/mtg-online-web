# Stack View Consistency Fix

## Objective
Ensure the Stack View pack container has the same visual styling (background, border, shadow, header) as the List and Grid views.

## User Request
"the stacked view region graphic is not consistent with the other views, the container region is missing"

## Implementation
- Modified `src/client/src/components/PackCard.tsx`.
- Removed the conditional ternary operators that stripped the background and border when `viewMode === 'stack'`.
- Ensured consistent `p-4` padding for the content wrapper.
- The `StackView` component is now rendered inside the standard slate card container.

## Verification
- Code review confirms the removal of `bg-transparent border-none` overrides.
- This ensures the `bg-slate-800` class applied to the parent `div` is visible in all modes.
