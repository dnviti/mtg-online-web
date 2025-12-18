# 2024-12-18 - Fix GameManager logging TypeError

## Problem
The user reported a server crash with `TypeError: Cannot read properties of undefined (reading 'type')`. This occurred in the `GameManager.handleStrictAction` catch block when attempting to log `action.type` during an error condition, implying that `action` itself might be undefined or causing access issues in that context, or the error handling was too aggressive on a malformed payload.

## Root Cause
The `catch(e)` block blindly accessed `action.type` to log the rule violation context. If `action` was null or undefined (which could happen if validation failed earlier or weird payloads arrived), this access threw the new error. Although `handleStrictAction` generally checks inputs, robust error logging should not crash.

## Solution
Updated the catch block in `src/server/managers/GameManager.ts` to use optional chaining `action?.type` and provide a fallback string `'UNKNOWN'`.

## Outcome
Server will now safely log "Rule Violation [UNKNOWN]" instead of crashing if the action payload is malformed during an error scenario.
