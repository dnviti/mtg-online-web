# Persist PWA Prompt Dismissal

## Objective
Ensure the PWA install prompt honors the user's previous interactions. If the user dismisses the prompt (clicks X) or initiates the install flow, the prompt should not appear again in subsequent sessions.

## Implementation Details
1.  **Storage**: Use `localStorage` key `pwa_prompt_dismissed` (value: 'true').
2.  **Logic Update** in `PWAInstallPrompt.tsx`:
    -   On mount: Check if `localStorage.getItem('pwa_prompt_dismissed') === 'true'`. If so, return `null` immediately.
    -   On Dismiss (X click): Set `localStorage.setItem('pwa_prompt_dismissed', 'true')` and hide UI.
    -   On Install Click: Set `localStorage.setItem('pwa_prompt_dismissed', 'true')` immediately. Even if they cancel the native dialog, we respect their choice to have interacted with it once. (Or should we? The user said "after a use choice". I will assume entering the flow counts).

## Refinements
- We might want to allow re-prompting after a long time (e.g., storing a timestamp), but the request is simple: "do not show... after a use choice". I will stick to simple boolean persistence for now.

## Status
- [x] Add logic to check/set `pwa_prompt_dismissed`
- [x] Update dismissal (X button) logic
- [x] Update install logic
- **Completed**: 2025-12-18
