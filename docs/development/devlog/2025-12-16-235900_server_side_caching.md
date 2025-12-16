# Plan: Server-Side Caching of Bulk Data

## Objective
Implement server-side caching of both card images and metadata upon bulk parsing, ensuring the application relies on local assets rather than external Scryfall URLs.

## Implementation Steps

1.  **Refactor Server Architecture (`CardService.ts`)**
    *   Update storage paths to `public/cards/images` (previously `public/cards`) and `public/cards/metadata`.
    *   Implement `cacheMetadata` to save JSON files alongside images.

2.  **Update API Endpoint (`index.ts`)**
    *   Modify `POST /api/cards/cache` to handle metadata saving in addition to image downloading.
    *   Update static file serving to map `/cards` to `public/cards`, making images accessible at `/cards/images/{id}.jpg`.

3.  **Update Client Logic (`CubeManager.tsx`, `PackGeneratorService.ts`, `LobbyManager.tsx`)**
    *   **Generation**: Pass a flag (`useLocalImages`) to the generator service.
    *   **Url Construction**: Generator now produces URLs like `${origin}/cards/images/{id}.jpg` when the flag is set.
    *   **Triggers**: `CubeManager` immediately sends parsed data to the server for caching before generating packs.
    *   **Consistency**: `LobbyManager` updated to look for images in the new `/cards/images` path for multiplayer sessions.

## Impact
*   **Performance**: Initial "Parse Bulk" takes slightly longer (due to server cache call), but subsequent interactions are instant and local.
*   **Reliability**: Application works offline or without Scryfall after initial parse.
*   **Precision**: Metadata is now persisted as individual JSONs on the backend, ready for future complex backend algorithms.
