# Redis Image Caching and Retrieval

This document outlines how card images are cached, stored in Redis (DB 1), and retrieved for use in the game client.

## Redis Structure (DB 1)

Redis DB 1 is used as the **Metadata Index** for cards.

### Key Schema
- **Sets**: `set:{setCode}` (Hash)
  - **Field**: `{scryfallId}`
  - **Value**: JSON String containing the full Card Object.

- **Set Metadata**: `sets` (Hash)
  - **Field**: `{setCode}`
  - **Value**: JSON String of Set Metadata.

### Card Object Structure (in Redis)
The stored JSON object is a normalized `ScryfallCard` extended with local path properties:

```json
{
  "id": "f6792f63-b651-497d-8aa5-cddf4cedeca8",
  "name": "Mocking Sprite",
  "set": "fdn",
  "image_uris": {
    "normal": "https://cards.scryfall.io/...",
    "art_crop": "https://cards.scryfall.io/..."
  },
  "local_path_full": "/cards/images/fdn/full/f6792f63-b651-497d-8aa5-cddf4cedeca8.jpg",
  "local_path_crop": "/cards/images/fdn/crop/f6792f63-b651-497d-8aa5-cddf4cedeca8.jpg"
}
```

## Data Flow

1.  **Ingestion (`ScryfallService`)**:
    *   When fetching cards (via API or Cache), `ScryfallService` normalizes the card data.
    *   It injects `local_path_full` and `local_path_crop` based on the convention `/cards/images/{set_code}/{full|crop}/{scryfall_id}.jpg`.
    *   It saves the enriched object to Redis DB 1.

2.  **Game Initialization (`game.handler.ts`)**:
    *   The `GameManager` or Handler requests card data via `ScryfallService.fetchCollection`.
    *   `ScryfallService` returns the Redis-cached object (including local paths).
    *   The Handler constructs the `GameCard` state, populating `imageUrl` and `imageArtCrop` from these local paths.
    *   It also embeds the full definition in `card.definition`.

3.  **Client Rendering (`CardVisual.tsx`)**:
    *   The component receives the `card` prop.
    *   It checks `card.imageUrl` (mapped to `local_path_full`) or `card.imageArtCrop` (mapped to `local_path_crop`).
    *   If present, it renders the local image.
    *   Fallbacks exist for Scryfall URIs or heuristic path construction.

## How to Get Path from Redis

To programmatically retrieve the path for a card knowing its `setCode` and `id`:

```typescript
import { StateStoreManager } from '../managers/StateStoreManager';

async function getCardPath(setCode: string, cardId: string) {
  const store = StateStoreManager.getInstance().metadataStore; // DB 1
  if (!store) return null;

  const json = await store.hget(`set:${setCode}`, cardId);
  if (json) {
    const card = JSON.parse(json);
    return {
       full: card.local_path_full,
       crop: card.local_path_crop
    };
  }
  return null;
}
```
