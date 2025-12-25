
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CARDS_DIR = path.join(__dirname, '../public/cards');
const METADATA_DIR = path.join(CARDS_DIR, 'metadata');
const SETS_DIR = path.join(CARDS_DIR, 'sets');

// Ensure dirs exist
if (!fs.existsSync(METADATA_DIR)) {
  fs.mkdirSync(METADATA_DIR, { recursive: true });
}

// Ensure sets dir exists
if (!fs.existsSync(SETS_DIR)) {
  fs.mkdirSync(SETS_DIR, { recursive: true });
}

export interface ScryfallCard {
  id: string;
  name: string;
  rarity: string;
  set: string;
  set_name: string;
  layout: string;
  type_line: string;
  colors?: string[];
  edhrec_rank?: number; // Add EDHREC rank
  image_uris?: { normal: string; small?: string; large?: string; png?: string; art_crop?: string; border_crop?: string };
  card_faces?: {
    name: string;
    image_uris?: { normal: string; art_crop?: string; };
    type_line?: string;
    mana_cost?: string;
    oracle_text?: string;
  }[];
  [key: string]: any;
}

export interface ScryfallSet {
  code: string;
  name: string;
  set_type: string;
  released_at: string;
  digital: boolean;
}

export class ScryfallService {
  private cacheById = new Map<string, ScryfallCard>();
  // Map ID to Set Code to locate the file efficiently
  private idToSet = new Map<string, string>();

  constructor() {
    this.hydrateCache();
  }

  private async hydrateCache() {
    console.time('ScryfallService:hydrateCache');
    try {
      if (!fs.existsSync(METADATA_DIR)) {
        fs.mkdirSync(METADATA_DIR, { recursive: true });
      }

      const entries = fs.readdirSync(METADATA_DIR, { withFileTypes: true });

      // We will perform a migration if we find flat files
      // and index existing folders
      for (const entry of entries) {
        if (entry.isDirectory()) {
          // This is a set folder
          const setCode = entry.name;
          const setDir = path.join(METADATA_DIR, setCode);
          try {
            const cardFiles = fs.readdirSync(setDir);
            for (const file of cardFiles) {
              if (file.endsWith('.json')) {
                const id = file.replace('.json', '');
                this.idToSet.set(id, setCode);
              }
            }
          } catch (err) {
            console.error(`[ScryfallService] Error reading set dir ${setCode}`, err);
          }
        } else if (entry.isFile() && entry.name.endsWith('.json')) {
          // Legacy flat file - needs migration
          // We read it to find the set, then move it
          const oldPath = path.join(METADATA_DIR, entry.name);
          try {
            const content = fs.readFileSync(oldPath, 'utf-8');
            const card = JSON.parse(content) as ScryfallCard;

            if (card.set && card.id) {
              const setCode = card.set;
              const newDir = path.join(METADATA_DIR, setCode);
              if (!fs.existsSync(newDir)) {
                fs.mkdirSync(newDir, { recursive: true });
              }
              const newPath = path.join(newDir, `${card.id}.json`);
              fs.renameSync(oldPath, newPath);

              // Update Index
              this.idToSet.set(card.id, setCode);
              // Also update memory cache if we want, but let's keep it light
            } else {
              console.warn(`[ScryfallService] Skipping migration for invalid card file: ${entry.name}`);
            }
          } catch (e) {
            console.error(`[ScryfallService] Failed to migrate ${entry.name}`, e);
          }
        }
      }

      console.log(`[ScryfallService] Cache hydration complete. Indexed ${this.idToSet.size} cards.`);
    } catch (e) {
      console.error("Failed to hydrate cache", e);
    }
    console.timeEnd('ScryfallService:hydrateCache');
  }

  private getCachedCard(id: string): ScryfallCard | null {
    if (this.cacheById.has(id)) return this.cacheById.get(id)!;

    // Check Index to find Set
    let setCode = this.idToSet.get(id);

    // If we have an index hit, look there
    if (setCode) {
      const p = path.join(METADATA_DIR, setCode, `${id}.json`);
      if (fs.existsSync(p)) {
        try {
          const raw = fs.readFileSync(p, 'utf-8');
          const card = JSON.parse(raw);
          this.cacheById.set(id, card);
          return card;
        } catch (e) {
          console.error(`Error reading cached card ${id}`, e);
        }
      }
    } else {
      // Fallback: Check flat dir just in case hydration missed it or new file added differently
      const flatPath = path.join(METADATA_DIR, `${id}.json`);
      if (fs.existsSync(flatPath)) {
        try {
          const raw = fs.readFileSync(flatPath, 'utf-8');
          const card = JSON.parse(raw);

          // Auto-migrate on read?
          if (card.set) {
            this.saveCard(card); // This effectively migrates it by saving to new structure
            try { fs.unlinkSync(flatPath); } catch { } // Cleanup old file
          }

          this.cacheById.set(id, card);
          return card;
        } catch (e) {
          console.error(`Error reading flat cached card ${id}`, e);
        }
      }
      // One last check: try to find it in ANY subdir if index missing?
      // No, that is too slow. hydration should have caught it.
    }

    return null;
  }

  private saveCard(card: ScryfallCard) {
    if (!card.id || !card.set) return;

    this.cacheById.set(card.id, card);
    this.idToSet.set(card.id, card.set);

    const setDir = path.join(METADATA_DIR, card.set);
    if (!fs.existsSync(setDir)) {
      fs.mkdirSync(setDir, { recursive: true });
    }

    const p = path.join(setDir, `${card.id}.json`);

    // Async write
    fs.writeFile(p, JSON.stringify(card, null, 2), (err) => {
      if (err) console.error(`Error saving metadata for ${card.id}`, err);
    });
  }

  async fetchSets(): Promise<ScryfallSet[]> {
    console.log('[ScryfallService] Fetching sets...');
    try {
      const resp = await fetch('https://api.scryfall.com/sets');
      if (!resp.ok) throw new Error(`Scryfall API error: ${resp.statusText}`);
      const data = await resp.json();

      const sets = data.data
        .filter((s: any) => ['core', 'expansion', 'masters', 'draft_innovation', 'commander', 'funny', 'masterpiece', 'eternal'].includes(s.set_type))
        .map((s: any) => ({
          code: s.code,
          name: s.name,
          set_type: s.set_type,
          released_at: s.released_at,
          digital: s.digital,
          parent_set_code: s.parent_set_code,
          card_count: s.card_count
        }));

      return sets;
    } catch (e) {
      console.error('[ScryfallService] fetchSets failed', e);
      return [];
    }
  }

  async fetchSetCards(setCode: string, relatedSets: string[] = []): Promise<ScryfallCard[]> {
    const setHash = setCode.toLowerCase();
    const setCachePath = path.join(SETS_DIR, `${setHash}.json`);
    const tokensCachePath = path.join(SETS_DIR, `t${setHash}.json`);

    // Check Local Set Cache
    const isSetCached = fs.existsSync(setCachePath);
    const isTokensCached = fs.existsSync(tokensCachePath);

    if (isSetCached && isTokensCached) {
      console.log(`[ScryfallService] Loading set ${setCode} and tokens from local cache...`);
      try {
        const raw = fs.readFileSync(setCachePath, 'utf-8');
        const data = JSON.parse(raw);
        console.log(`[ScryfallService] Loaded ${data.length} cards from cache for ${setCode}.`);
        return data;
      } catch (e) {
        console.error(`[ScryfallService] Corrupt set cache for ${setCode}, refetching...`);
      }
    }

    console.log(`[ScryfallService] Fetching set ${setCode} (Set cached: ${isSetCached}, Tokens cached: ${isTokensCached})...`);

    // ... continue to fetching
    // We need to be careful: if set is cached but tokens are not, we don't want to re-fetch the set from Scryfall if we don't have to, 
    // BUT the current logic below fetches BOTH or nothing given the structure.
    // Refactoring to fetch independently or skip if cached.

    let allCards: ScryfallCard[] = [];

    try {
      // 1. Fetch Main Set Cards
      if (isSetCached) {
        const raw = fs.readFileSync(setCachePath, 'utf-8');
        allCards = JSON.parse(raw);
      } else {
        // Construct Composite Query...
        const setsToFetch = [setCode, ...relatedSets];
        const setQuery = setsToFetch.map(s => `(set:${s} (is:booster or (type:land type:basic)))`).join(' or ');
        let url = `https://api.scryfall.com/cards/search?q=(${setQuery}) unique=prints`;

        // ... fetching loop ...
        try {
          while (url) {
            console.log(`[ScryfallService] [API CALL] Requesting: ${url}`);
            const resp = await fetch(url);

            if (!resp.ok) {
              if (resp.status === 404) {
                break;
              }
              const errBody = await resp.text();
              throw new Error(`Failed to fetch set: ${resp.statusText} (${resp.status}) - ${errBody}`);
            }

            const d = await resp.json();
            if (d.data) allCards.push(...d.data);

            if (d.has_more && d.next_page) {
              url = d.next_page;
              await new Promise(res => setTimeout(res, 100));
            } else {
              url = '';
            }
          }

          // Save Set Cache
          if (allCards.length > 0) {
            if (!fs.existsSync(path.dirname(setCachePath))) fs.mkdirSync(path.dirname(setCachePath), { recursive: true });
            fs.writeFileSync(setCachePath, JSON.stringify(allCards, null, 2));

            // Smartly save individuals: only if missing from cache
            let newCount = 0;
            allCards.forEach(c => {
              if (!this.getCachedCard(c.id)) {
                this.saveCard(c);
                newCount++;
              }
            });
            console.log(`[ScryfallService] Saved set ${setCode}. New individual cards cached: ${newCount}/${allCards.length}`);
          }
        } catch (e) {
          console.error("Error fetching set", e);
          throw e;
        }
      }

      // 2. Fetch Tokens (e:tCODE) - Only if not cached
      if (!isTokensCached) {
        const tokenSetCode = `t${setCode}`.toLowerCase();
        console.log(`[ScryfallService] Fetching tokens for set (trying set:${tokenSetCode})...`);

        let tokenUrl = `https://api.scryfall.com/cards/search?q=set:${tokenSetCode} unique=prints`;
        let allTokens: ScryfallCard[] = [];

        try {
          while (tokenUrl) {
            const tResp = await fetch(tokenUrl);
            if (!tResp.ok) {
              if (tResp.status === 404) break;
              console.warn(`[ScryfallService] Token fetch warning: ${tResp.statusText}`);
              break;
            }

            const td = await tResp.json();
            if (td.data) allTokens.push(...td.data);

            if (td.has_more && td.next_page) {
              tokenUrl = td.next_page;
              await new Promise(res => setTimeout(res, 100));
            } else {
              tokenUrl = '';
            }
          }
        } catch (tokenErr) {
          console.warn("[ScryfallService] Failed to fetch tokens (non-critical)", tokenErr);
        }

        console.log(`[ScryfallService] Found ${allTokens.length} tokens for ${setCode}.`);

        // Save Token Cache
        if (allTokens.length > 0 || !isTokensCached) { // Should we save empty token file if none found to prevent refetch? Yes.
          if (!fs.existsSync(METADATA_DIR)) fs.mkdirSync(METADATA_DIR, { recursive: true });
          fs.writeFileSync(tokensCachePath, JSON.stringify(allTokens, null, 2));

          // Also cache individual tokens for metadata lookup
          allTokens.forEach(c => {
            // We might want to force save them even if cached to ensure we have them?
            // Tokens often share IDs across reprints? No, Scryfall IDs are unique.
            this.saveCard(c);
          });
          console.log(`[ScryfallService] Cached ${allTokens.length} tokens at ${tokensCachePath}`);
        }
      }

      return allCards;

    } catch (e) {
      console.error("Error fetching set", e);
      throw e;
    }
  }

  // New method to retrieve cached tokens
  async getTokensForSet(setCode: string): Promise<ScryfallCard[]> {
    const tokenSetCode = `t${setCode.toLowerCase()}`;
    const tokensCachePath = path.join(SETS_DIR, `${tokenSetCode}.json`);

    if (fs.existsSync(tokensCachePath)) {
      try {
        const raw = fs.readFileSync(tokensCachePath, 'utf-8');
        return JSON.parse(raw);
      } catch (e) {
        console.error(`[ScryfallService] Error reading token cache for ${setCode}`, e);
      }
    }

    // If not found, we could try to fetch on demand? 
    // For now, return empty.
    return [];
  }

  async fetchCollection(identifiers: { id?: string, name?: string }[]): Promise<ScryfallCard[]> {
    const results: ScryfallCard[] = [];
    const missing: { id?: string, name?: string }[] = [];

    // Check cache first
    for (const id of identifiers) {
      if (id.id) {
        const c = this.getCachedCard(id.id);
        if (c) {
          results.push(c);
        } else {
          missing.push(id);
        }
      } else {
        // Warning: Name lookup relies on API because we don't index names locally yet
        missing.push(id);
      }
    }

    if (missing.length === 0) return results;

    console.log(`[ScryfallService] Locally cached: ${results.length}. Fetching ${missing.length} missing cards from API...`);

    // Chunk requests
    const CHUNK_SIZE = 75;
    for (let i = 0; i < missing.length; i += CHUNK_SIZE) {
      const chunk = missing.slice(i, i + CHUNK_SIZE);
      try {
        const resp = await fetch('https://api.scryfall.com/cards/collection', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identifiers: chunk })
        });

        if (!resp.ok) {
          console.error(`[ScryfallService] Collection fetch failed: ${resp.status}`);
          continue;
        }

        const d = await resp.json();

        if (d.data) {
          d.data.forEach((c: ScryfallCard) => {
            this.saveCard(c);
            results.push(c);
          });
        }

        if (d.not_found && d.not_found.length > 0) {
          console.warn(`[ScryfallService] Cards not found:`, d.not_found);
        }

      } catch (e) {
        console.error("Error fetching collection chunk", e);
      }
      await new Promise(r => setTimeout(r, 75)); // Rate limiting
    }

    return results;
  }

  async getFoundationLands(): Promise<ScryfallCard[]> {
    const setCode = 'j25';
    const landsCachePath = path.join(SETS_DIR, `${setCode}_lands.json`);

    // 1. Check Cache
    if (fs.existsSync(landsCachePath)) {
      try {
        const raw = fs.readFileSync(landsCachePath, 'utf-8');
        const cards = JSON.parse(raw);
        console.log(`[ScryfallService] Loaded ${cards.length} Foundation lands from cache.`);
        return cards;
      } catch (e) {
        console.error(`[ScryfallService] Error reading Foundation lands cache`, e);
      }
    }

    // 2. Fetch from API
    console.log('[ScryfallService] Fetching Foundation (J25) lands for fallback...');
    const url = `https://api.scryfall.com/cards/search?q=e:${setCode}+type:land+type:basic+unique:prints&order=set`;

    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`Scryfall API error: ${resp.statusText}`);

      const data = await resp.json();
      const cards = data.data || [];

      if (cards.length > 0) {
        // Save Cache
        if (!fs.existsSync(SETS_DIR)) fs.mkdirSync(SETS_DIR, { recursive: true });
        fs.writeFileSync(landsCachePath, JSON.stringify(cards, null, 2));

        // Also cache individual cards
        cards.forEach((c: ScryfallCard) => this.saveCard(c));

        console.log(`[ScryfallService] Cached ${cards.length} Foundation lands.`);
      }

      return cards;
    } catch (e) {
      console.error('[ScryfallService] Failed to fetch Foundation lands', e);
      return [];
    }
  }
}
