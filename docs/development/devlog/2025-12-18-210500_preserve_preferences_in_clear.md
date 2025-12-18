# 2025-12-18 - Preserve User Preferences in Reset

## Overview
Refined the "Clear Session" logic in `CubeManager` to distinguish between "generation state" and "user preferences".

## Changes
- **Updated `handleReset` in `CubeManager.tsx`**:
  - REMOVED: `setCardWidth(60)`
  - REMOVED: `setViewMode('list')`
  - These values now remain untouched during a session clear, preserving the user's UI customization.
  - Generation-specific state (card lists, packs, filters, number of boxes) is still strictly reset.

## Rationale
Users were frustrated that clearing the card pool also reset their carefully adjusted UI settings (like card size slider and view mode). This change aligns with the expectation that "Clear Session" refers to the *content* of the draft session from a game perspective, not the *interface* settings.
