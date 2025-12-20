
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

    // Check Local Set Cache
    if (fs.existsSync(setCachePath)) {
      console.log(`[ScryfallService] Loading set ${setCode} from local cache...`);
      try {
        const raw = fs.readFileSync(setCachePath, 'utf-8');
        const data = JSON.parse(raw);
        console.log(`[ScryfallService] Loaded ${data.length} cards from cache for ${setCode}.`);
        return data;
      } catch (e) {
        console.error(`[ScryfallService] Corrupt set cache for ${setCode}, refetching...`);
      }
    }

    console.log(`[ScryfallService] Fetching cards for set ${setCode} (related: ${relatedSets.join(',')}) from API...`);
    let allCards: ScryfallCard[] = [];

    // Construct Composite Query: (e:main OR e:sub1 OR e:sub2) is:booster unique=prints
    const setClause = `e:${setCode}` + relatedSets.map(s => ` OR e:${s}`).join('');
    let url = `https://api.scryfall.com/cards/search?q=(${setClause}) unique=prints is:booster`;

    try {
      while (url) {
        console.log(`[ScryfallService] [API CALL] Requesting: ${url}`);
        const resp = await fetch(url);
        console.log(`[ScryfallService] [API RESPONSE] Status: ${resp.status}`);

        if (!resp.ok) {
          if (resp.status === 404) {
            console.warn(`[ScryfallService] 404 Not Found for URL: ${url}. Assuming set has no cards.`);
            break;
          }
          const errBody = await resp.text();
          console.error(`[ScryfallService] Error fetching ${url}: ${resp.status} ${resp.statusText}`, errBody);
          throw new Error(`Failed to fetch set: ${resp.statusText} (${resp.status}) - ${errBody}`);
        }

        const d = await resp.json();

        if (d.data) {
          allCards.push(...d.data);
        }

        if (d.has_more && d.next_page) {
          url = d.next_page;
          await new Promise(res => setTimeout(res, 100)); // Respect rate limits
        } else {
          url = '';
        }
      }

      // Save Set Cache
      if (allCards.length > 0) {
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

      return allCards;

    } catch (e) {
      console.error("Error fetching set", e);
      throw e;
    }
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
}
