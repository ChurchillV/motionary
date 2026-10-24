/**
 * Data access. Uses Supabase (service role, server-side only) when configured.
 * Without Supabase it falls back to a local JSON store in .local-data/ so the
 * app and scripts run on a laptop before the database exists. The local store
 * is for development only: one process at a time is safest.
 */
import fs from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config, hasSupabase } from "./config";
import { LANGUAGES, ttsProviderFor } from "./languages";
import { normalizeForMatch } from "./text";

// ---------- Row types ----------

export type Kind = "gesture" | "item" | "other";
export type ConceptRow = {
  concept_id: string;
  english_gloss: string;
  kind: Kind;
  emoji: string | null;
  aliases: string[];
  search_terms: string[];
  embedding?: number[] | null;
};
export type GifStatus = "candidate" | "screened_out" | "approved" | "rejected";
export type GifRow = {
  gif_id: string;
  provider: "giphy" | "noto" | "emoji";
  provider_id: string | null;
  url_mp4: string | null;
  url_webp: string | null;
  url_gif: string | null;
  width: number | null;
  height: number | null;
  has_text: boolean | null;
  qa_score: number | null;
  qa_notes: string | null;
  status: GifStatus;
};
export type ConceptGifRow = { concept_id: string; gif_id: string; rank: number };
export type TranslationRow = {
  concept_id: string;
  lang_code: string;
  form: string;
  romanization: string | null;
  ipa: string | null;
  example_target: string | null;
  example_en: string | null;
  source: "lexicon" | "model";
  confidence: "low" | "medium" | "high";
  verified?: boolean;
};
export type LexiconRow = { lang_code: string; english: string; form: string; form_normalized: string; notes: string | null };
export type InputCacheRow = { lang_code: string; text_normalized: string; concept_id: string; candidates: unknown };
export type AudioClipRow = {
  concept_id: string;
  lang_code: string;
  kind: "word" | "sentence";
  text_hash: string;
  provider: "gemini";
  storage_path: string;
  duration_ms: number | null;
};
type GiphyCacheRow = { cache_key: string; response: unknown; fetched_at: string };
type CurationRow = { concept_id: string; reason: string | null; queued_at: string };
type LanguageRow = { lang_code: string; name: string; script: string | null; has_lexicon: boolean; tts_provider: string };

const CONCEPT_COLS = "concept_id, english_gloss, kind, emoji, aliases, search_terms";

// ---------- Supabase ----------

let sb: SupabaseClient | null = null;
function supa(): SupabaseClient | null {
  if (!hasSupabase()) return null;
  sb ??= createClient(config.supabaseUrl, config.supabaseServiceKey, { auth: { persistSession: false } });
  return sb;
}

function check<T>(res: { data: T; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
}

// ---------- Local JSON store ----------

const LOCAL_DIR = path.join(process.cwd(), ".local-data");
type Tables = {
  languages: LanguageRow[];
  concepts: ConceptRow[];
  gifs: GifRow[];
  concept_gifs: ConceptGifRow[];
  translations: TranslationRow[];
  lexicon_entries: LexiconRow[];
  input_cache: InputCacheRow[];
  audio_clips: AudioClipRow[];
  giphy_cache: GiphyCacheRow[];
  curation_queue: CurationRow[];
};
type TableName = keyof Tables;

class LocalStore {
  private data = new Map<TableName, unknown[]>();
  private mtimes = new Map<TableName, number>();
  private dirty = new Set<TableName>();
  private timer: NodeJS.Timeout | null = null;
  private writable = true;

  private file(t: TableName) {
    return path.join(LOCAL_DIR, `${t}.json`);
  }

  table<T extends TableName>(t: T): Tables[T] {
    const f = this.file(t);
    let mtime = -1;
    try {
      mtime = fs.statSync(f).mtimeMs;
    } catch {}
    if (!this.data.has(t) || (mtime !== -1 && mtime !== this.mtimes.get(t) && !this.dirty.has(t))) {
      let rows: unknown[] = [];
      try {
        rows = JSON.parse(fs.readFileSync(f, "utf8"));
      } catch {}
      this.data.set(t, rows);
      this.mtimes.set(t, mtime);
      if (rows.length === 0) this.seed(t);
    }
    return this.data.get(t) as Tables[T];
  }

  touch(t: TableName) {
    this.dirty.add(t);
    this.timer ??= setTimeout(() => this.flush(), 150);
  }

  flush() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (!this.writable) return this.dirty.clear();
    try {
      fs.mkdirSync(LOCAL_DIR, { recursive: true });
      for (const t of this.dirty) {
        const f = this.file(t);
        fs.writeFileSync(f, JSON.stringify(this.data.get(t) ?? []));
        this.mtimes.set(t, fs.statSync(f).mtimeMs);
      }
    } catch (e) {
      this.writable = false;
      console.warn("[db] local store is read-only; keeping data in memory only:", (e as Error).message);
    }
    this.dirty.clear();
  }

  /** First run without Supabase: load languages and the seed concept list. */
  private seed(t: TableName) {
    if (t === "languages") {
      this.data.set(
        t,
        LANGUAGES.map((l) => ({
          lang_code: l.code, name: l.name, script: l.script, has_lexicon: false, tts_provider: ttsProviderFor(l.code),
        })),
      );
      this.touch(t);
    }
    if (t === "concepts") {
      try {
        const csv = fs.readFileSync(path.join(process.cwd(), "data", "seed-concepts.csv"), "utf8");
        this.data.set(t, parseSeedCsv(csv));
        this.touch(t);
      } catch {}
    }
  }
}

const local = new LocalStore();

/** Parse data/seed-concepts.csv: concept_id,english_gloss,kind[,emoji,aliases(pipe-separated)]. */
export function parseSeedCsv(csv: string): ConceptRow[] {
  const lines = csv.replace(/\r/g, "").split("\n").filter((l) => l.trim());
  const header = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    const get = (k: string) => (cells[header.indexOf(k)] ?? "").trim();
    return {
      concept_id: get("concept_id"),
      english_gloss: get("english_gloss"),
      kind: (get("kind") || "item") as Kind,
      emoji: get("emoji") || null,
      aliases: get("aliases") ? get("aliases").split("|").map((a) => a.trim().toLowerCase()).filter(Boolean) : [],
      search_terms: [],
    };
  });
}

export function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      out.push(cur);
      cur = "";
    }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

/** Trigram similarity, close to pg_trgm's similarity(). */
export function trigramSimilarity(a: string, b: string): number {
  const grams = (s: string) => {
    const set = new Set<string>();
    for (const w of s.split(/\s+/).filter(Boolean)) {
      const p = `  ${w} `;
      for (let i = 0; i < p.length - 2; i++) set.add(p.slice(i, i + 3));
    }
    return set;
  };
  const ga = grams(a), gb = grams(b);
  if (!ga.size || !gb.size) return 0;
  let shared = 0;
  for (const g of ga) if (gb.has(g)) shared++;
  return shared / (ga.size + gb.size - shared);
}

const uuid = () => crypto.randomUUID();
const nowIso = () => new Date().toISOString();

// ---------- Repository ----------

export const repo = {
  mode: (): "supabase" | "local" => (supa() ? "supabase" : "local"),
  flush: () => local.flush(),

  // ----- languages -----
  async hasLexicon(lang: string): Promise<boolean> {
    const s = supa();
    if (s) {
      const data = check(await s.from("languages").select("has_lexicon").eq("lang_code", lang).maybeSingle(), "languages");
      return !!data?.has_lexicon;
    }
    return !!local.table("languages").find((l) => l.lang_code === lang)?.has_lexicon;
  },

  async setHasLexicon(lang: string, value: boolean) {
    const s = supa();
    if (s) return void check(await s.from("languages").update({ has_lexicon: value }).eq("lang_code", lang), "languages");
    const row = local.table("languages").find((l) => l.lang_code === lang);
    if (row) row.has_lexicon = value;
    local.touch("languages");
  },

  // ----- concepts -----
  async getConcept(id: string): Promise<ConceptRow | null> {
    const s = supa();
    if (s) return check(await s.from("concepts").select(CONCEPT_COLS).eq("concept_id", id).maybeSingle(), "concepts");
    return local.table("concepts").find((c) => c.concept_id === id) ?? null;
  },

  async listConcepts(opts: { withEmbedding?: boolean } = {}): Promise<ConceptRow[]> {
    const s = supa();
    if (s) {
      const cols = opts.withEmbedding ? `${CONCEPT_COLS}, embedding` : CONCEPT_COLS;
      const rows: ConceptRow[] = [];
      for (let from = 0; ; from += 1000) {
        const page = check(
          await s.from("concepts").select(cols).order("concept_id").range(from, from + 999),
          "concepts",
        ) as unknown as ConceptRow[];
        rows.push(...page);
        if (page.length < 1000) break;
      }
      return rows;
    }
    return local.table("concepts");
  },

  async conceptsMissingEmbedding(): Promise<ConceptRow[]> {
    const s = supa();
    if (s) return check(await s.from("concepts").select(CONCEPT_COLS).is("embedding", null), "concepts") as ConceptRow[];
    return local.table("concepts").filter((c) => !c.embedding?.length);
  },

  /** Concept whose alias list contains the term ("waving" → WAVE). Ids are matched by getConcept. */
  async findConceptByAlias(term: string): Promise<ConceptRow | null> {
    const t = normalizeForMatch(term);
    if (!t) return null;
    const s = supa();
    if (s) {
      const rows = check(await s.from("concepts").select(CONCEPT_COLS).contains("aliases", [t]).limit(1), "concepts");
      return (rows?.[0] as ConceptRow) ?? null;
    }
    return local.table("concepts").find((c) => c.aliases?.includes(t)) ?? null;
  },

  /** Insert concepts that don't exist yet; existing rows are left alone. */
  async insertConceptsIfMissing(rows: ConceptRow[]): Promise<number> {
    const s = supa();
    if (s) {
      const data = check(
        await s.from("concepts").upsert(rows, { onConflict: "concept_id", ignoreDuplicates: true }).select("concept_id"),
        "concepts",
      );
      return data?.length ?? 0;
    }
    const table = local.table("concepts");
    const have = new Set(table.map((c) => c.concept_id));
    const fresh = rows.filter((r) => !have.has(r.concept_id));
    table.push(...fresh);
    local.touch("concepts");
    return fresh.length;
  },

  async updateConcept(id: string, patch: Partial<ConceptRow>) {
    const s = supa();
    if (s) return void check(await s.from("concepts").update(patch).eq("concept_id", id), "concepts");
    const row = local.table("concepts").find((c) => c.concept_id === id);
    if (row) Object.assign(row, patch);
    local.touch("concepts");
  },

  async matchConcepts(embedding: number[], count: number, minSimilarity: number) {
    const s = supa();
    if (s) {
      return check(
        await s.rpc("match_concepts", {
          query_embedding: embedding,
          match_count: count,
          min_similarity: minSimilarity,
        }),
        "match_concepts",
      ) as { concept_id: string; similarity: number }[];
    }
    return local
      .table("concepts")
      .filter((c) => c.embedding?.length)
      .map((c) => ({ concept_id: c.concept_id, similarity: cosine(embedding, c.embedding!) }))
      .filter((m) => m.similarity >= minSimilarity)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, count);
  },

  async countEmbedded(): Promise<number> {
    const s = supa();
    if (s) {
      const res = await s.from("concepts").select("concept_id", { count: "exact", head: true }).not("embedding", "is", null);
      return res.count ?? 0;
    }
    return local.table("concepts").filter((c) => c.embedding?.length).length;
  },

  // ----- gifs -----
  /** Approved visuals for a concept, best rank first. */
  async approvedGifsFor(conceptId: string): Promise<(GifRow & { rank: number })[]> {
    const s = supa();
    if (s) {
      const rows = check(
        await s
          .from("concept_gifs")
          .select("rank, gifs!inner(*)")
          .eq("concept_id", conceptId)
          .eq("gifs.status", "approved")
          .order("rank"),
        "concept_gifs",
      ) as unknown as { rank: number; gifs: GifRow }[];
      return rows.map((r) => ({ ...r.gifs, rank: r.rank }));
    }
    const gifs = new Map(local.table("gifs").map((g) => [g.gif_id, g]));
    return local
      .table("concept_gifs")
      .filter((cg) => cg.concept_id === conceptId && gifs.get(cg.gif_id)?.status === "approved")
      .sort((a, b) => a.rank - b.rank)
      .map((cg) => ({ ...gifs.get(cg.gif_id)!, rank: cg.rank }));
  },

  /** Concept ids that have at least one approved visual. */
  async conceptsWithApproved(): Promise<Set<string>> {
    const s = supa();
    if (s) {
      const ids = new Set<string>();
      for (let from = 0; ; from += 1000) {
        const page = check(
          await s.from("concept_gifs").select("concept_id, gifs!inner(status)").eq("gifs.status", "approved").range(from, from + 999),
          "concept_gifs",
        ) as unknown as { concept_id: string }[];
        page.forEach((r) => ids.add(r.concept_id));
        if (page.length < 1000) break;
      }
      return ids;
    }
    const approved = new Set(local.table("gifs").filter((g) => g.status === "approved").map((g) => g.gif_id));
    return new Set(local.table("concept_gifs").filter((cg) => approved.has(cg.gif_id)).map((cg) => cg.concept_id));
  },

  /** Insert a gif (or return the existing one with the same provider id). */
  async upsertGif(row: Omit<GifRow, "gif_id" | "status"> & { status?: GifStatus }): Promise<string> {
    const s = supa();
    if (s) {
      const existing = check(
        await s.from("gifs").select("gif_id").eq("provider", row.provider).eq("provider_id", row.provider_id).maybeSingle(),
        "gifs",
      );
      if (existing) return existing.gif_id as string;
      const data = check(await s.from("gifs").insert({ status: "candidate", ...row }).select("gif_id").single(), "gifs");
      return data!.gif_id as string;
    }
    const table = local.table("gifs");
    const existing = table.find((g) => g.provider === row.provider && g.provider_id === row.provider_id);
    if (existing) return existing.gif_id;
    const gif: GifRow = { gif_id: uuid(), status: "candidate", ...row };
    table.push(gif);
    local.touch("gifs");
    return gif.gif_id;
  },

  async linkConceptGif(conceptId: string, gifId: string, rank: number) {
    const s = supa();
    if (s) {
      return void check(
        await s.from("concept_gifs").upsert({ concept_id: conceptId, gif_id: gifId, rank }, { onConflict: "concept_id,gif_id", ignoreDuplicates: true }),
        "concept_gifs",
      );
    }
    const table = local.table("concept_gifs");
    if (!table.some((r) => r.concept_id === conceptId && r.gif_id === gifId)) {
      table.push({ concept_id: conceptId, gif_id: gifId, rank });
      local.touch("concept_gifs");
    }
  },

  async updateGif(gifId: string, patch: Partial<GifRow>) {
    const s = supa();
    if (s) return void check(await s.from("gifs").update(patch).eq("gif_id", gifId), "gifs");
    const row = local.table("gifs").find((g) => g.gif_id === gifId);
    if (row) Object.assign(row, patch);
    local.touch("gifs");
  },

  /** All gifs linked to a concept, with their link rank. */
  async gifsFor(conceptId: string): Promise<(GifRow & { rank: number })[]> {
    const s = supa();
    if (s) {
      const rows = check(
        await s.from("concept_gifs").select("rank, gifs!inner(*)").eq("concept_id", conceptId).order("rank"),
        "concept_gifs",
      ) as unknown as { rank: number; gifs: GifRow }[];
      return rows.map((r) => ({ ...r.gifs, rank: r.rank }));
    }
    const gifs = new Map(local.table("gifs").map((g) => [g.gif_id, g]));
    return local
      .table("concept_gifs")
      .filter((cg) => cg.concept_id === conceptId && gifs.has(cg.gif_id))
      .sort((a, b) => a.rank - b.rank)
      .map((cg) => ({ ...gifs.get(cg.gif_id)!, rank: cg.rank }));
  },

  /** Candidates (status 'candidate') not yet screened, with their concept. */
  async unscreenedCandidates(limit: number): Promise<{ gif: GifRow; concept: ConceptRow }[]> {
    const s = supa();
    if (s) {
      const rows = check(
        await s
          .from("concept_gifs")
          .select(`gifs!inner(*), concepts!inner(${CONCEPT_COLS})`)
          .eq("gifs.status", "candidate")
          .eq("gifs.provider", "giphy")
          .is("gifs.qa_score", null)
          .limit(limit),
        "concept_gifs",
      ) as unknown as { gifs: GifRow; concepts: ConceptRow }[];
      return rows.map((r) => ({ gif: r.gifs, concept: r.concepts }));
    }
    const concepts = new Map(local.table("concepts").map((c) => [c.concept_id, c]));
    const gifs = new Map(local.table("gifs").map((g) => [g.gif_id, g]));
    return local
      .table("concept_gifs")
      .map((cg) => ({ gif: gifs.get(cg.gif_id)!, concept: concepts.get(cg.concept_id)! }))
      .filter((r) => r.gif && r.concept && r.gif.status === "candidate" && r.gif.provider === "giphy" && r.gif.qa_score == null)
      .slice(0, limit);
  },

  /** Approve one gif for a concept and reject its other candidates. */
  async approveGif(conceptId: string, gifId: string) {
    const all = await this.gifsFor(conceptId);
    for (const g of all) {
      if (g.gif_id === gifId) await this.updateGif(g.gif_id, { status: "approved" });
      else if (g.status !== "approved") await this.updateGif(g.gif_id, { status: "rejected" });
    }
    const s = supa();
    const approvedCount = all.filter((g) => g.status === "approved" && g.gif_id !== gifId).length;
    if (s) {
      check(await s.from("concept_gifs").update({ rank: approvedCount }).eq("concept_id", conceptId).eq("gif_id", gifId), "concept_gifs");
      check(await s.from("curation_queue").delete().eq("concept_id", conceptId), "curation_queue");
      return;
    }
    const link = local.table("concept_gifs").find((cg) => cg.concept_id === conceptId && cg.gif_id === gifId);
    if (link) link.rank = approvedCount;
    local.touch("concept_gifs");
    const q = local.table("curation_queue");
    const i = q.findIndex((r) => r.concept_id === conceptId);
    if (i !== -1) {
      q.splice(i, 1);
      local.touch("curation_queue");
    }
  },

  async rejectCandidatesFor(conceptId: string) {
    for (const g of await this.gifsFor(conceptId)) {
      if (g.status === "candidate") await this.updateGif(g.gif_id, { status: "rejected" });
    }
  },

  async countConcepts(): Promise<number> {
    const s = supa();
    if (s) return (await s.from("concepts").select("concept_id", { count: "exact", head: true })).count ?? 0;
    return local.table("concepts").length;
  },

  // ----- translations -----
  async getTranslation(conceptId: string, lang: string): Promise<TranslationRow | null> {
    const s = supa();
    if (s) {
      return check(
        await s.from("translations").select("*").eq("concept_id", conceptId).eq("lang_code", lang).maybeSingle(),
        "translations",
      );
    }
    return local.table("translations").find((t) => t.concept_id === conceptId && t.lang_code === lang) ?? null;
  },

  async upsertTranslation(row: TranslationRow) {
    const s = supa();
    if (s) return void check(await s.from("translations").upsert(row, { onConflict: "concept_id,lang_code" }), "translations");
    const table = local.table("translations");
    const i = table.findIndex((t) => t.concept_id === row.concept_id && t.lang_code === row.lang_code);
    if (i === -1) table.push(row);
    else table[i] = row;
    local.touch("translations");
  },

  async listTranslations(lang?: string): Promise<TranslationRow[]> {
    const s = supa();
    if (s) {
      let q = s.from("translations").select("*");
      if (lang) q = q.eq("lang_code", lang);
      return check(await q, "translations") as TranslationRow[];
    }
    return local.table("translations").filter((t) => !lang || t.lang_code === lang);
  },

  // ----- lexicon -----
  async lexiconByEnglish(lang: string, term: string, limit = 30): Promise<LexiconRow[]> {
    const t = term.toLowerCase().trim();
    if (!t) return [];
    const s = supa();
    if (s) {
      return check(
        await s.from("lexicon_entries").select("*").eq("lang_code", lang).ilike("english", `%${t.replace(/[%_]/g, "")}%`).limit(limit),
        "lexicon_entries",
      ) as LexiconRow[];
    }
    return local
      .table("lexicon_entries")
      .filter((r) => r.lang_code === lang && r.english.toLowerCase().includes(t))
      .slice(0, limit);
  },

  /** Exact match on form_normalized, then fuzzy (trigram ≥ minSim), up to `limit`. */
  async lexiconLookup(lang: string, normalized: string, minSim = 0.4, limit = 10): Promise<LexiconRow[]> {
    const s = supa();
    if (s) {
      const exact = check(
        await s.from("lexicon_entries").select("*").eq("lang_code", lang).eq("form_normalized", normalized).limit(limit),
        "lexicon_entries",
      ) as LexiconRow[];
      if (exact.length) return exact;
      return check(
        await s.rpc("match_lexicon", { p_lang: lang, p_query: normalized, p_min_similarity: minSim, p_limit: limit }),
        "match_lexicon",
      ) as LexiconRow[];
    }
    const rows = local.table("lexicon_entries").filter((r) => r.lang_code === lang);
    const exact = rows.filter((r) => r.form_normalized === normalized);
    if (exact.length) return exact.slice(0, limit);
    return rows
      .map((r) => ({ r, sim: trigramSimilarity(r.form_normalized, normalized) }))
      .filter((x) => x.sim >= minSim)
      .sort((a, b) => b.sim - a.sim)
      .slice(0, limit)
      .map((x) => x.r);
  },

  async replaceLexicon(lang: string, rows: LexiconRow[]) {
    const s = supa();
    if (s) {
      check(await s.from("lexicon_entries").delete().eq("lang_code", lang), "lexicon_entries");
      for (let i = 0; i < rows.length; i += 500) {
        check(await s.from("lexicon_entries").insert(rows.slice(i, i + 500)), "lexicon_entries");
      }
      return;
    }
    const table = local.table("lexicon_entries");
    const kept = table.filter((r) => r.lang_code !== lang);
    table.length = 0;
    table.push(...kept, ...rows);
    local.touch("lexicon_entries");
  },

  // ----- input cache -----
  async getInputCache(lang: string, textNormalized: string): Promise<InputCacheRow | null> {
    const s = supa();
    if (s) {
      return check(
        await s.from("input_cache").select("*").eq("lang_code", lang).eq("text_normalized", textNormalized).maybeSingle(),
        "input_cache",
      );
    }
    return local.table("input_cache").find((r) => r.lang_code === lang && r.text_normalized === textNormalized) ?? null;
  },

  async setInputCache(row: InputCacheRow) {
    const s = supa();
    if (s) return void check(await s.from("input_cache").upsert(row, { onConflict: "lang_code,text_normalized" }), "input_cache");
    const table = local.table("input_cache");
    const i = table.findIndex((r) => r.lang_code === row.lang_code && r.text_normalized === row.text_normalized);
    if (i === -1) table.push(row);
    else table[i] = row;
    local.touch("input_cache");
  },

  // ----- audio -----
  async getAudioClip(conceptId: string, lang: string, kind: "word" | "sentence"): Promise<AudioClipRow | null> {
    const s = supa();
    if (s) {
      return check(
        await s.from("audio_clips").select("*").eq("concept_id", conceptId).eq("lang_code", lang).eq("kind", kind).maybeSingle(),
        "audio_clips",
      );
    }
    return local.table("audio_clips").find((r) => r.concept_id === conceptId && r.lang_code === lang && r.kind === kind) ?? null;
  },

  async upsertAudioClip(row: AudioClipRow) {
    const s = supa();
    if (s) return void check(await s.from("audio_clips").upsert(row, { onConflict: "concept_id,lang_code,kind" }), "audio_clips");
    const table = local.table("audio_clips");
    const i = table.findIndex((r) => r.concept_id === row.concept_id && r.lang_code === row.lang_code && r.kind === row.kind);
    if (i === -1) table.push(row);
    else table[i] = row;
    local.touch("audio_clips");
  },

  // ----- storage (audio clips, Noto files) -----
  async uploadFile(storagePath: string, body: Buffer, contentType: string): Promise<void> {
    const s = supa();
    if (s) {
      const { error } = await s.storage.from(config.storageBucket).upload(storagePath, body, { contentType, upsert: true });
      if (error) throw new Error(`storage upload: ${error.message}`);
      return;
    }
    const file = path.join(LOCAL_DIR, "storage", storagePath);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, body);
  },

  publicUrl(storagePath: string): string {
    const s = supa();
    if (s) return s.storage.from(config.storageBucket).getPublicUrl(storagePath).data.publicUrl;
    return `/api/storage/${storagePath.split("/").map(encodeURIComponent).join("/")}`;
  },

  /** Local mode only: read a stored file (served by /api/storage). */
  readLocalFile(storagePath: string): Buffer | null {
    const root = path.join(LOCAL_DIR, "storage");
    const file = path.resolve(root, storagePath);
    if (!file.startsWith(root + path.sep)) return null;
    try {
      return fs.readFileSync(file);
    } catch {
      return null;
    }
  },

  // ----- giphy cache -----
  async getGiphyCache(key: string): Promise<GiphyCacheRow | null> {
    const s = supa();
    if (s) return check(await s.from("giphy_cache").select("*").eq("cache_key", key).maybeSingle(), "giphy_cache");
    return local.table("giphy_cache").find((r) => r.cache_key === key) ?? null;
  },

  async setGiphyCache(key: string, response: unknown) {
    const row = { cache_key: key, response, fetched_at: nowIso() };
    const s = supa();
    if (s) return void check(await s.from("giphy_cache").upsert(row, { onConflict: "cache_key" }), "giphy_cache");
    const table = local.table("giphy_cache");
    const i = table.findIndex((r) => r.cache_key === key);
    if (i === -1) table.push(row);
    else table[i] = row;
    local.touch("giphy_cache");
  },

  // ----- curation queue -----
  async queueCuration(conceptId: string, reason: string) {
    const s = supa();
    if (s) {
      return void check(
        await s.from("curation_queue").upsert({ concept_id: conceptId, reason }, { onConflict: "concept_id", ignoreDuplicates: true }),
        "curation_queue",
      );
    }
    const table = local.table("curation_queue");
    if (!table.some((r) => r.concept_id === conceptId)) {
      table.push({ concept_id: conceptId, reason, queued_at: nowIso() });
      local.touch("curation_queue");
    }
  },

  async listCurationQueue(): Promise<{ concept_id: string; reason: string | null }[]> {
    const s = supa();
    if (s) return check(await s.from("curation_queue").select("concept_id, reason").order("queued_at"), "curation_queue") ?? [];
    return local.table("curation_queue");
  },
};
