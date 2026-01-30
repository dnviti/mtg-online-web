
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { StateStoreManager } from '../managers/StateStoreManager';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CARDS_DIR = path.join(__dirname, '../public/cards');
const METADATA_DIR = path.join(CARDS_DIR, 'metadata');
const SETS_DIR = path.join(CARDS_DIR, 'sets');

// Ensure dirs exist
if (!fs.existsSync(METADATA_DIR)) {
  fs.mkdirSync(METADATA_DIR, { recursive: true });
}
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
  edhrec_rank?: number;
  loyalty?: string;  // Planeswalker starting loyalty (e.g., "3")
  power?: string;    // Creature power
  toughness?: string; // Creature toughness
  defense?: string;  // Battle defense
  oracle_text?: string;
  mana_cost?: string;
  keywords?: string[];
  image_uris?: { normal: string; small?: string; large?: string; png?: string; art_crop?: string; border_crop?: string };
  card_faces?: {
    name: string;
    image_uris?: { normal: string; art_crop?: string; };
    type_line?: string;
    mana_cost?: string;
    oracle_text?: string;
    loyalty?: string;  // For double-faced planeswalkers
    power?: string;
    toughness?: string;
  }[];
  // Local Path Extensions
  local_path_full?: string;
  local_path_crop?: string;
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
  private cacheByName = new Map<string, ScryfallCard[]>();
  private idToSet = new Map<string, string>();

  private get metadataStore() {
    return StateStoreManager.getInstance().metadataStore;
  }

  constructor() {
    this.hydrateCache();
  }

  private async fetchWithRetry(url: string, options: any = {}, retries = 3, backoff = 1000): Promise<Response> {
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 10000); // 10s timeout per attempt
      const response = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(id);
      if (!response.ok && response.status >= 500 && retries > 0) {
        throw new Error(response.statusText);
      }
      return response;
    } catch (e) {
      if (retries > 0) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn(`[ScryfallService] Fetch failed (${msg}). Retrying in ${backoff}ms...`);
        await new Promise(r => setTimeout(r, backoff));
        return this.fetchWithRetry(url, options, retries - 1, backoff * 2);
      }
      throw e;
    }
  }

  private async hydrateCache() {
    console.time('ScryfallService:hydrateCache');
    try {
      // Hydrate ID->Set Map from FS (Fastest reliable startup)
      // We could ideally start with Redis if persistent, but FS is the ultimate backup.
      if (fs.existsSync(METADATA_DIR)) {
        const entries = fs.readdirSync(METADATA_DIR, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const setCode = entry.name;
            const setDir = path.join(METADATA_DIR, setCode);
            try {
              const files = fs.readdirSync(setDir);
              for (const f of files) {
                if (f.endsWith('.json')) {
                  const id = f.replace('.json', '');
                  this.idToSet.set(id, setCode);
                }
              }
            } catch { }
          }
        }
      }

      // Also index Sets Caches for names (fastest name hydration)
      if (fs.existsSync(SETS_DIR)) {
        const setFiles = fs.readdirSync(SETS_DIR);
        for (const file of setFiles) {
          if (file.endsWith('.json') && !file.startsWith('t') && !file.endsWith('_info.json') && file !== 'all_sets.json') {
            try {
              const content = fs.readFileSync(path.join(SETS_DIR, file), 'utf-8');
              const cards = JSON.parse(content) as ScryfallCard[];
              cards.forEach(c => {
                this.indexCardByName(c);
                if (c.id && c.set) this.idToSet.set(c.id, c.set);
              });
            } catch (e) { }
          }
        }
      }
      console.log(`[ScryfallService] Cache hydration complete. Indexed ${this.idToSet.size} IDs.`);
    } catch (e) {
      console.error("Failed to hydrate cache", e);
    }
    console.timeEnd('ScryfallService:hydrateCache');
  }

  private indexCardByName(card: ScryfallCard) {
    if (!card.name) return;
    const key = card.name.toLowerCase();
    const existing = this.cacheByName.get(key) || [];
    if (!existing.find(e => e.id === card.id)) {
      existing.push(card);
      this.cacheByName.set(key, existing);
    }
  }

  /**
   * Retrieves a card. Prioritizes Redis Cache.
   */
  async getCachedCard(id: string): Promise<ScryfallCard | null> {
    // 1. In-Memory Cache (Fastest)
    if (this.cacheById.has(id)) return this.cacheById.get(id)!;

    const setCode = this.idToSet.get(id);
    const store = this.metadataStore;

    // 2. Redis Cache
    if (store && setCode) {
      try {
        const json = await store.hget(`set:${setCode}`, id);
        if (json) {
          const card = JSON.parse(json);
          // IMPORTANT: Always normalize to ensure local_path_full/crop are set
          this.normalizeCard(card, setCode);
          this.cacheById.set(id, card);
          return card;
        }
      } catch (e) {
        console.warn(`[ScryfallService] Redis read failed for ${id}`, e);
      }
    }

    // 3. Local FS Cache (Fallback)
    if (setCode) {
      const p = path.join(METADATA_DIR, setCode, `${id}.json`);
      if (fs.existsSync(p)) {
        try {
          const card = JSON.parse(fs.readFileSync(p, 'utf-8'));
          this.normalizeCard(card, setCode);
          this.cacheById.set(id, card);
          // Repair Redis if missing
          if (store) this.saveCardToRedis(card).catch(console.error);
          return card;
        } catch { }
      }
    }

    return null;
  }

  private normalizeCard(card: ScryfallCard, forcedSetCode?: string): ScryfallCard {
    if (!card) return card;

    // 1. Fix Set Code if needed
    if (forcedSetCode && card.set !== forcedSetCode) {
      card.set = forcedSetCode;
    }
    // Heuristic: If set has space, it's a name, not a code. But we might not knw the code here?
    // We rely on forcedSetCode usually.

    // 2. Inject Paths
    if (card.set && card.id) {
      if (!card.local_path_full) card.local_path_full = `/cards/images/${card.set}/full/${card.id}.jpg`;
      if (!card.local_path_crop) card.local_path_crop = `/cards/images/${card.set}/crop/${card.id}.jpg`;
    }
    return card;
  }

  private async saveCard(card: ScryfallCard) {
    if (!card.id || !card.set) return;

    this.normalizeCard(card);

    // Memory
    this.cacheById.set(card.id, card);
    this.idToSet.set(card.id, card.set);
    this.indexCardByName(card);

    // Redis
    await this.saveCardToRedis(card);

    // File System (Persistence)
    const setDir = path.join(METADATA_DIR, card.set);
    if (!fs.existsSync(setDir)) fs.mkdirSync(setDir, { recursive: true });

    fs.writeFile(path.join(setDir, `${card.id}.json`), JSON.stringify(card, null, 2), (err) => {
      if (err) console.error(`Error saving FS metadata for ${card.id}`, err);
    });
  }

  private async saveCardToRedis(card: ScryfallCard) {
    const store = this.metadataStore;
    if (store) {
      // Index by Set (Main Metadata)
      await store.hset(`set:${card.set}`, card.id, JSON.stringify(card));
      // Index ID->Set Mapping (for lookups without known set)
      await store.hset(`card_indexes`, card.id, card.set);
    }
  }

  async cacheCards(cards: ScryfallCard[]): Promise<void> {
    let newCount = 0;
    // We should check existence first to avoid redundant writes?
    // For bulk speed, maybe just write all efficiently?
    // Parallel writes?
    for (const card of cards) {
      if (!this.idToSet.has(card.id)) {
        await this.saveCard(card);
        newCount++;
      } else {
        // Even if known, update Redis to ensure indexing?
        // Only if we want to ensure consistency.
        // Let's rely on idToSet map to gate repeated writes.
      }
    }
    if (newCount > 0) console.log(`[ScryfallService] Cached ${newCount} new cards.`);
  }

  searchLocal(query: string): ScryfallCard[] {
    const q = query.toLowerCase().trim();
    if (!q) return [];
    const results: ScryfallCard[] = [];
    const seenIds = new Set<string>();

    for (const [name, cards] of this.cacheByName.entries()) {
      if (name.includes(q)) {
        cards.forEach(c => {
          if (!seenIds.has(c.id)) {
            seenIds.add(c.id);
            results.push(c);
          }
        });
      }
    }
    return results;
  }

  async cacheSetsMetadata(setCodes: string[]): Promise<void> {
    const uniqueSets = Array.from(new Set(setCodes.map(s => s.toLowerCase())));
    const store = this.metadataStore;
    let setsCached = 0;

    for (const code of uniqueSets) {
      // Check Redis
      if (store) {
        try {
          const cached = await store.hget('sets', code);
          if (cached) continue; // Already have metadata
        } catch { }
      }

      // Check FS
      const setInfoPath = path.join(SETS_DIR, `${code}_info.json`);
      if (!fs.existsSync(setInfoPath)) {
        try {
          const resp = await this.fetchWithRetry(`https://api.scryfall.com/sets/${code}`);
          if (resp.ok) {
            const data = await resp.json();
            fs.writeFileSync(setInfoPath, JSON.stringify(data, null, 2));
            // Save to Redis
            if (store) {
              await store.hset('sets', code, JSON.stringify(data));
            }
            setsCached++;
          }
        } catch (e) {
          console.error(`[ScryfallService] Failed to cache set info for ${code}`, e);
        }
      } else {
        // FS exists, maybe hydrate Redis?
        if (store) {
          try {
            const raw = fs.readFileSync(setInfoPath, 'utf-8');
            await store.hset('sets', code, raw);
          } catch { }
        }
      }
    }

    if (setsCached > 0) {
      console.log(`[ScryfallService] Cached metadata for ${setsCached} new sets.`);
    }
  }

  async fetchSets(): Promise<ScryfallSet[]> {
    const store = this.metadataStore;
    // Try Redis
    if (store) {
      try {
        const all = await store.hgetall('sets');
        const sets = Object.values(all).map(s => JSON.parse(s));
        if (sets.length > 50) return sets; // Assume valid cache if substantial
      } catch (e) { }
    }

    console.log('[ScryfallService] Fetching sets from API...');
    try {
      const resp = await this.fetchWithRetry('https://api.scryfall.com/sets');
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

      // Cache to Redis
      if (store) {
        for (const s of sets) {
          await store.hset('sets', s.code, JSON.stringify(s));
        }
      }

      // Cache to FS
      const setsListPath = path.join(SETS_DIR, 'all_sets.json');
      fs.writeFileSync(setsListPath, JSON.stringify(sets, null, 2));

      return sets;
    } catch (e) {
      console.error('[ScryfallService] fetchSets failed', e);
      return [];
    }
  }

  async fetchSetCards(setCode: string, relatedSets: string[] = []): Promise<ScryfallCard[]> {
    const store = this.metadataStore;

    // 1. Try Redis
    if (store) {
      try {
        const allMap = await store.hgetall(`set:${setCode}`);
        const cards = Object.values(allMap).map(s => JSON.parse(s));
        if (cards.length > 0) {
          console.log(`[ScryfallService] Loaded set ${setCode} from Redis (${cards.length} cards).`);
          // Hydrate memory maps
          cards.forEach(c => {
            this.cacheById.set(c.id, c);
            this.idToSet.set(c.id, c.set);
            this.indexCardByName(c);
          });
          return cards;
        }
      } catch (e) { }
    }

    // 2. Try FS Cache key
    // ... (Existing logic adapted to use saveCard -> Redis)
    const setHash = setCode.toLowerCase();
    const setCachePath = path.join(SETS_DIR, `${setHash}.json`);

    if (fs.existsSync(setCachePath)) {
      try {
        const cards = JSON.parse(fs.readFileSync(setCachePath, 'utf-8'));
        console.log(`[ScryfallService] Loaded set ${setCode} from FS cache.`);

        // Ensure paths are populated and Set Code is correct
        const enrichedCards = cards.map((c: ScryfallCard) => this.normalizeCard(c, setCode));

        // Populate Redis
        if (store) {
          for (const c of enrichedCards) await this.saveCardToRedis(c);
        }
        enrichedCards.forEach((c: ScryfallCard) => {
          this.cacheById.set(c.id, c);
          this.idToSet.set(c.id, c.set);
          this.indexCardByName(c);
        });
        return enrichedCards;
      } catch { }
    }

    // 3. API Fetch
    console.log(`[ScryfallService] Fetching set ${setCode} from API...`);
    let allCards: ScryfallCard[] = [];
    const setsToFetch = [setCode, ...relatedSets];
    // Note: "is:booster" might limit special cards, but assuming existing logic was correct for intent
    const setQuery = setsToFetch.map(s => `(set:${s} (is:booster or (type:land type:basic)))`).join(' or ');
    let url = `https://api.scryfall.com/cards/search?q=(${setQuery}) unique=prints`;

    try {
      while (url) {
        const resp = await this.fetchWithRetry(url);
        if (!resp.ok) break;
        const d = await resp.json();
        if (d.data) allCards.push(...d.data);
        url = d.has_more ? d.next_page : '';
        await new Promise(r => setTimeout(r, 100)); // Rate limit
      }
    } catch (e) {
      console.error("Fetch set failed", e);
    }

    if (allCards.length > 0) {
      // Save using saveCard to populate Redis & FS
      fs.writeFileSync(setCachePath, JSON.stringify(allCards, null, 2));
      for (const c of allCards) {
        await this.saveCard(c);
      }
    }
    return allCards;
  }

  // Re-implement others similarly or rely on basic cache
  async fetchCollection(identifiers: { id?: string, name?: string, set?: string }[]): Promise<ScryfallCard[]> {
    const results: ScryfallCard[] = [];
    const missing: { id?: string, name?: string, set?: string }[] = [];

    for (const id of identifiers) {
      if (id.id) {
        // Use async getCachedCard which checks Redis
        const c = await this.getCachedCard(id.id);
        if (c) results.push(c);
        else missing.push(id);
      } else if (id.name && id.set) {
        // Check local cache for Set + Name match (crucial for custom sets)
        const cached = await this.searchLocal(`${id.name} set:${id.set}`);
        const exact = cached.find(c => c.name.toLowerCase() === id.name!.toLowerCase() && (c.set === id.set?.toLowerCase() || c.set_name?.toLowerCase() === id.set?.toLowerCase()));

        if (exact) results.push(exact);
        else missing.push(id);
      } else {
        missing.push(id);
      }
    }

    if (missing.length === 0) return results;

    // Fetch missing from API
    // ... (Same Logic but use await this.saveCard(c))
    console.log(`[ScryfallService] Fetching ${missing.length} missing cards...`);
    const CHUNK_SIZE = 75;
    for (let i = 0; i < missing.length; i += CHUNK_SIZE) {
      const chunk = missing.slice(i, i + CHUNK_SIZE);
      try {
        const resp = await this.fetchWithRetry('https://api.scryfall.com/cards/collection', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identifiers: chunk })
        });
        const d = await resp.json();
        if (d.data) {
          for (const c of d.data) {
            await this.saveCard(c);
            results.push(c);
          }
        }
      } catch (e) { console.error(e); }
    }
    return results;
  }

  // Keep getTokensForSet / getFoundationLands but update to use saveCard
  async getTokensForSet(setCode: string): Promise<ScryfallCard[]> {
    const tokenSetCode = `t${setCode}`.toLowerCase();

    // Redis Check
    const store = this.metadataStore;
    if (store) {
      try {
        const allMap = await store.hgetall(`set:${tokenSetCode}`);
        const cards = Object.values(allMap).map(s => JSON.parse(s));
        if (cards.length > 0) {
          // Normalize to ensure local_path_full/crop are set
          cards.forEach(c => this.normalizeCard(c));
          return cards;
        }
      } catch (e) { }
    }

    // FS Check
    const tokensCachePath = path.join(SETS_DIR, `${tokenSetCode}.json`);
    if (fs.existsSync(tokensCachePath)) {
      try {
        const cards = JSON.parse(fs.readFileSync(tokensCachePath, 'utf-8'));
        // Normalize to ensure local_path_full/crop are set
        cards.forEach((c: ScryfallCard) => this.normalizeCard(c));
        if (store) { for (const c of cards) await this.saveCardToRedis(c); }
        return cards;
      } catch { }
    }

    // Fetch
    console.log(`[ScryfallService] Fetching tokens for set (set:${tokenSetCode})...`);
    let tokenUrl = `https://api.scryfall.com/cards/search?q=set:${tokenSetCode} unique=prints`;
    let allTokens: ScryfallCard[] = [];

    try {
      while (tokenUrl) {
        const tResp = await this.fetchWithRetry(tokenUrl);
        if (!tResp.ok) {
          if (tResp.status === 404) break;
          break;
        }

        const td = await tResp.json();
        if (td.data) allTokens.push(...td.data);

        tokenUrl = td.has_more ? td.next_page : '';
        await new Promise(res => setTimeout(res, 100));
      }
    } catch (tokenErr) {
      console.warn("[ScryfallService] Failed to fetch tokens", tokenErr);
    }

    if (allTokens.length > 0) {
      fs.writeFileSync(tokensCachePath, JSON.stringify(allTokens, null, 2));
      for (const c of allTokens) await this.saveCard(c);
    }

    return allTokens;
  }

  async getFoundationLands(): Promise<ScryfallCard[]> {
    const setCode = 'j25';
    // Reuse Redis/FS logic by checking cache manually or effectively behaving like a set fetch
    // But we need Unique By Name filtering here?
    // Let's check Redis first for ALL j25 lands.

    const store = this.metadataStore;
    if (store) {
      try {
        const allMap = await store.hgetall(`set:${setCode}`);
        const cards = Object.values(allMap).map(s => JSON.parse(s));
        // Filter for lands if mixed set? j25 is a set.
        // We only want Basic Lands.
        const lands = cards.filter((c: ScryfallCard) => c.type_line.includes('Basic Land'));
        if (lands.length > 0) {
          // Normalize to ensure local_path_full/crop are set
          lands.forEach(c => this.normalizeCard(c));
          return lands;
        }
      } catch (e) { }
    }

    const landsCachePath = path.join(SETS_DIR, `${setCode}_lands.json`);

    if (fs.existsSync(landsCachePath)) {
      try {
        const cards = JSON.parse(fs.readFileSync(landsCachePath, 'utf-8'));
        // Normalize to ensure local_path_full/crop are set
        cards.forEach((c: ScryfallCard) => this.normalizeCard(c));
        if (store) { for (const c of cards) await this.saveCardToRedis(c); }
        return cards;
      } catch { }
    }

    console.log('[ScryfallService] Fetching Foundation (J25) lands...');
    const url = `https://api.scryfall.com/cards/search?q=e:${setCode}+type:land+type:basic+unique:prints&order=set`;

    try {
      const resp = await this.fetchWithRetry(url);
      if (!resp.ok) return [];

      const data = await resp.json();
      let cards = data.data || [];

      const uniqueNameMap = new Map();
      cards.forEach((c: ScryfallCard) => {
        if (!uniqueNameMap.has(c.name)) uniqueNameMap.set(c.name, c);
      });
      cards = Array.from(uniqueNameMap.values());

      if (cards.length > 0) {
        fs.writeFileSync(landsCachePath, JSON.stringify(cards, null, 2));
        for (const c of cards) await this.saveCard(c);
      }
      return cards;
    } catch (e) {
      console.error('[ScryfallService] Failed to fetch Foundation lands', e);
      return [];
    }
  }

  /**
   * Find a matching token from a list of cached tokens based on characteristics.
   * Used by OracleEffectResolver to create real Scryfall tokens instead of generic ones.
   *
   * @param cachedTokens - Pre-cached tokens from the set (from game state)
   * @param criteria - Token characteristics to match against
   * @returns Matching token or null if not found
   */
  findMatchingToken(
    cachedTokens: ScryfallCard[],
    criteria: {
      name?: string;
      power?: string | number;
      toughness?: string | number;
      subtypes?: string[];
      colors?: string[];
      isCreature?: boolean;
      isArtifact?: boolean;
    }
  ): ScryfallCard | null {
    if (!cachedTokens || cachedTokens.length === 0) return null;

    const { name, power, toughness, subtypes, colors, isCreature, isArtifact } = criteria;

    // Normalize power/toughness to strings for comparison
    const targetPower = power?.toString();
    const targetToughness = toughness?.toString();

    // Score-based matching to find the best match
    let bestMatch: ScryfallCard | null = null;
    let bestScore = 0;

    for (const token of cachedTokens) {
      let score = 0;
      const tokenTypeLine = (token.type_line || '').toLowerCase();
      const tokenFace = token.card_faces?.[0];

      // Get token characteristics from root or card_faces (cast to any for extended properties)
      const face = tokenFace as any;
      const tokenPower = token.power ?? face?.power;
      const tokenToughness = token.toughness ?? face?.toughness;
      const tokenColors = token.colors || face?.colors || [];
      const tokenName = token.name || face?.name || '';

      // Type check
      if (isCreature !== undefined) {
        const isTokenCreature = tokenTypeLine.includes('creature');
        if (isCreature !== isTokenCreature) continue;
      }

      if (isArtifact !== undefined) {
        const isTokenArtifact = tokenTypeLine.includes('artifact');
        if (isArtifact && !isTokenArtifact) continue;
      }

      // Name match (highest priority)
      if (name) {
        const normalizedName = name.toLowerCase().trim();
        const normalizedTokenName = tokenName.toLowerCase().trim();
        if (normalizedTokenName === normalizedName) {
          score += 100; // Exact name match
        } else if (normalizedTokenName.includes(normalizedName) || normalizedName.includes(normalizedTokenName)) {
          score += 50; // Partial name match
        }
      }

      // Power/toughness match
      if (targetPower !== undefined && tokenPower !== undefined) {
        if (tokenPower === targetPower) score += 30;
      }
      if (targetToughness !== undefined && tokenToughness !== undefined) {
        if (tokenToughness === targetToughness) score += 30;
      }

      // Subtype match
      if (subtypes && subtypes.length > 0) {
        for (const subtype of subtypes) {
          if (tokenTypeLine.includes(subtype.toLowerCase())) {
            score += 20;
          }
        }
      }

      // Color match
      if (colors && colors.length > 0) {
        const matchingColors = colors.filter(c => tokenColors.includes(c));
        score += matchingColors.length * 10;

        // Penalty for extra colors
        const extraColors = tokenColors.filter((c: string) => !colors.includes(c));
        score -= extraColors.length * 5;
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = token;
      }
    }

    // Only return if we have a reasonable match (at least power/toughness or name)
    if (bestScore >= 30) {
      console.log(`[ScryfallService] Found matching token: ${bestMatch?.name} (score: ${bestScore})`);
      return bestMatch;
    }

    return null;
  }

  /**
   * Find a specific common token type (Treasure, Food, Clue, Blood, etc.)
   * These tokens are standardized across sets.
   */
  findCommonToken(
    cachedTokens: ScryfallCard[],
    tokenType: 'Treasure' | 'Food' | 'Clue' | 'Blood' | 'Map' | 'Powerstone'
  ): ScryfallCard | null {
    if (!cachedTokens || cachedTokens.length === 0) return null;

    const token = cachedTokens.find(t => {
      const name = t.name || t.card_faces?.[0]?.name || '';
      return name.toLowerCase() === tokenType.toLowerCase();
    });

    if (token) {
      console.log(`[ScryfallService] Found ${tokenType} token from cache`);
    }

    return token || null;
  }

}
