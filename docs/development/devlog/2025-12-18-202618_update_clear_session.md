# 2025-12-18 - Clear Session Logic Update

## Overview
Based on user feedback, the "Clear Session" functionality in `CubeManager` has been enhanced to be more comprehensive.

## Changes
- **Updated `handleReset` in `CubeManager.tsx`**:
  - Now resets ALL component state to default values, not just removing persistence keys.
  - Resets `filters`, `genSettings`, `sourceMode`, `numBoxes`, `cardWidth`, and `searchTerm` in addition to input text and generated data.
  - Ensures a true "start from scratch" experience.
  - Relies on existing `useEffect` hooks to propagate the reset state to `localStorage`.

## Rationale
The previous implementation only cleared the generated content but left user configurations (filters, settings) intact. The user requested a full reset to start a new generation from scratch, implying all previous choices should be wiped.
