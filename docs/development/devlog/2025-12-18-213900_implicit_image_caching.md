# 2025-12-18 - Implicit Image Caching

## Overview
To solve the issue of missing images when generating packs from local servers, we have implemented implicit image caching directly within the API routes.

## Changes
- **Updated `server/index.ts`**:
  - `GET /api/sets/:code/cards`: Now calls `cardService.cacheImages(cards)` before returning the response. This ensures that when a user fetches a set, all necessary full art and art crop images are downloaded to the server's cache immediately.
  - `POST /api/cards/parse`: Now calls `cardService.cacheImages(uniqueCards)` on the resolved unique cards before building the expanded list.

## Impact
- **Positive**: Guaranteed image availability. When the client receives the card list, the images are guaranteed to optionally exist or be in the process of finishing (though we await completion, ensuring existence).
- **Performance**: The "Fetching set..." or "Parsing list..." steps in the UI will take longer initially (proportional to image download speed), but subsequent requests will be instant as `cacheImages` skips existing files.
- **Reliability**: Eliminates 404 errors for images when using the strictly local `PackGenerator` URLs.

## Rationale
The application now defaults to `useLocalImages = true` effectively by hardcoding local paths in the generator. Therefore, the server MUST ensure those files exist before the client tries to render them.
