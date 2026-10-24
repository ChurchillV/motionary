# Build Instructions: Comprehensible Input App (GIF-first)

You are building a hackathon web app. **Pitch: translating languages through comprehensible input in a more fun, expressive way, to make learning fun and more relatable.** Every word comes with a playful looping GIF, spoken audio and a simple example, so learners understand it from the picture and sound rather than from a dictionary definition.

For the hackathon, the app supports popular languages (e.g. Spanish, French, German, Italian, Portuguese, Japanese, Korean, Mandarin), all well covered by Gemma and Gemini TTS. The design is language-agnostic, so more languages can be added later.

A learner types a basic word or short phrase in any supported language, picks a source and a target language, and the app shows the translation, a romanization if relevant, a simple example sentence, and a looping GIF that acts out the word (gesture) or shows it (item).

Translation is **any-to-any through a language-independent concept**: source text → concept (e.g. `WAVE`) → target text. English is just one more language. The visual is keyed by concept, so it is the same whichever direction the learner goes.

Read this whole file before writing code. Work milestone by milestone (section 11) and keep the demo path working after every milestone.

---

## 1. Scope

**In scope**
- Two-way, any-to-any translation: English → another language, another language → English, and between two non-English languages (e.g. Spanish → French). Output: target word, romanization, IPA (when available), example sentence, confidence level.
- "Did you mean" candidates when a source word maps to more than one concept.
- An on-screen character palette for languages with special characters.
- One visual per word: a curated GIPHY GIF (gestures) or sticker (items). Backup: Noto Animated Emoji. Last resort: static emoji.
- Gesture + item combos (e.g. "eat apple") shown side by side.
- An offline curation pipeline that builds the GIF library before the demo.
- An internal admin page for picking GIFs.
- **Fun and expressiveness come first:** lively card animations, playful GIFs, friendly copy. When choosing between two ways to build something, pick the one that feels more delightful to a learner.
- **Audio:** pronunciation of the target word and the example sentence (section 9A), with a clear "synthetic voice" label.

**Out of scope (do not build unless asked)**
- 3D avatars, text-to-motion models, video generation, anything needing a GPU.
- User accounts, payments, social features.
- Speech input (saying a word instead of typing it) until every milestone including M5 and the stretch goals is done. It is the final extra goal, M6 (section 11).
- Tenor (its API was shut down on 30 June 2026). Do not add it.

---

## 2. Ground rules

1. **Never re-host GIPHY media.** Store GIPHY IDs and their URLs only. Noto emoji files may be self-hosted (CC BY 4.0).
2. **Always show "Powered by GIPHY"** wherever GIPHY content appears. Credit Noto Emoji (CC BY 4.0) on an About page.
3. **No live unscreened GIFs in the main flow.** Live GIPHY search is a fallback only, always with `rating=g`, and its results are cached.
4. **Secrets live in environment variables only.** Never commit keys. Server-side calls only; the browser never sees the Gemini key or the Supabase service role key.
5. **Respect the GIPHY beta limit: 100 calls per hour.** Every GIPHY call goes through one rate-limited, cached client.
6. **Validate every model response** with Zod before using it. On invalid JSON, retry once with a repair prompt, then fall back gracefully.
7. **Keep dependencies to the stack in section 3.** Ask before adding anything significant.
8. **Verify external API details** (model IDs, response field names, URL patterns) against current official docs before relying on them. Values marked `VERIFY` below are best-known, not guaranteed.

---

## 3. Stack

| Layer | Choice |
| --- | --- |
| App | Next.js (App Router) + TypeScript + React |
| Styling / motion | Tailwind CSS + Framer Motion |
| Validation | Zod |
| LLM SDK | `@google/genai` (Gemini API) |
| Translation model | `gemma-4-31b-it` (fallback: `gemma-4-26b-a4b-it`) |
| Embeddings | `gemini-embedding-2` (VERIFY output dimension; set the `vector(N)` size to match) |
| Vision screening | Current Gemini Flash model (VERIFY exact model ID in the models list) |
| Database | Supabase Postgres + `pgvector` |
| Storage | Supabase Storage (Noto emoji files only) |
| Audio | Gemini TTS, `gemini-3.8-flash-tts` (~130 languages; VERIFY model ID and language list). No other speech provider and no self-hosted services. |
| Scripts | TypeScript run with `tsx` |
| Hosting | Vercel |

---

## 4. Environment variables

Create `.env.example` with exactly these keys:

```bash
# Google AI Studio (Gemma, embeddings, vision screening)
GEMINI_API_KEY=

# Model IDs (override without code changes)
GEMMA_MODEL=gemma-4-31b-it
GEMMA_FALLBACK_MODEL=gemma-4-26b-a4b-it
EMBEDDING_MODEL=gemini-embedding-2
VISION_MODEL=

# GIPHY developer dashboard
GIPHY_API_KEY=
GIPHY_CALLS_PER_HOUR=100

# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Audio
TTS_MODEL=gemini-3.8-flash-tts

# Admin page protection (simple shared secret for the hackathon)
ADMIN_PASSWORD=
```

---

## 5. Repository layout

```
/app
  /page.tsx                 # Learner UI: input, language picker, word card
  /about/page.tsx           # Attribution and credits
  /admin/curate/page.tsx    # GIF pick grid (password protected)
  /api/lookup/route.ts      # Main endpoint
  /api/admin/approve/route.ts
  /api/audio/route.ts       # On-demand audio generation (section 9A)
/components
  WordCard.tsx
  GifPlayer.tsx
  EmojiFallback.tsx
  LanguagePicker.tsx        # "from" and "to" pickers + swap button
  CharacterPalette.tsx
  AlternativeChips.tsx
  ConfidenceBadge.tsx
  GiphyAttribution.tsx
  AudioButton.tsx
/lib
  gemini.ts                 # Client, translate(), embed(), screenGif()
  giphy.ts                  # Rate-limited, cached search client
  noto.ts                   # Emoji → Noto asset URLs
  lookup.ts                 # Concept resolution logic (section 8)
  schemas.ts                # Zod schemas
  prompts.ts                # Prompt templates
  db.ts                     # Supabase server client
  audio.ts                  # Provider routing, caching, storage upload
/scripts
  01-seed-concepts.ts
  02-enrich-concepts.ts
  03-search-giphy.ts
  04-screen-candidates.ts
  05-noto-fallback.ts
  06-import-lexicon.ts      # Optional (see section 10)
  07-embed-concepts.ts
  08-pregenerate-audio.ts
/data
  seed-concepts.csv
  gestures.json             # The fixed gesture ID list Gemma may choose from
  tts-coverage.json         # Which provider covers each language (section 9A)
  lexicons/<iso639-3>.csv   # Optional word lists
/supabase/migrations
  0001_init.sql
```

---

## 6. Data model

Create `supabase/migrations/0001_init.sql`:

```sql
create extension if not exists vector;

create table languages (
  lang_code    text primary key,          -- ISO 639-3
  name         text not null,
  script       text,
  has_lexicon  boolean default false,
  tts_provider text check (tts_provider in ('gemini','none')) default 'none'
);

create table concepts (
  concept_id     text primary key,        -- e.g. 'WAVE', 'APPLE'
  english_gloss  text not null,
  kind           text not null check (kind in ('gesture','item','other')),
  emoji          text,
  aliases        text[] default '{}',
  search_terms   text[] default '{}',
  embedding      vector(768),             -- VERIFY dimension
  created_at     timestamptz default now()
);

create table gifs (
  gif_id       uuid primary key default gen_random_uuid(),
  provider     text not null check (provider in ('giphy','noto','emoji')),
  provider_id  text,                      -- GIPHY id or emoji codepoint
  url_mp4      text,
  url_webp     text,
  url_gif      text,
  width        int,
  height       int,
  has_text     boolean,
  qa_score     int,                       -- 1-5 from vision screening
  qa_notes     text,
  status       text not null default 'candidate'
               check (status in ('candidate','screened_out','approved','rejected')),
  created_at   timestamptz default now(),
  unique (provider, provider_id)
);

create table concept_gifs (
  concept_id  text references concepts on delete cascade,
  gif_id      uuid references gifs on delete cascade,
  rank        int default 0,
  primary key (concept_id, gif_id)
);

create table translations (
  concept_id      text references concepts on delete cascade,
  lang_code       text references languages,
  form            text not null,
  romanization    text,
  ipa             text,
  example_target  text,
  example_en      text,
  source          text check (source in ('lexicon','model')),
  confidence      text check (confidence in ('low','medium','high')),
  verified        boolean default false,
  created_at      timestamptz default now(),
  primary key (concept_id, lang_code)
);

create extension if not exists pg_trgm;

create table lexicon_entries (
  lang_code        text references languages,
  english          text not null,
  form             text not null,
  form_normalized  text not null,         -- lowercase, diacritics stripped, punctuation removed
  notes            text
);
create index on lexicon_entries (lang_code, lower(english));
create index on lexicon_entries (lang_code, form_normalized);
create index on lexicon_entries using gin (form_normalized gin_trgm_ops);  -- fuzzy reverse lookup

-- Cache of resolved inputs in any language: (language, normalised text) → concept
create table input_cache (
  lang_code        text references languages,
  text_normalized  text not null,
  concept_id       text references concepts,
  candidates       jsonb,                 -- alternatives when ambiguous
  created_at       timestamptz default now(),
  primary key (lang_code, text_normalized)
);

create table audio_clips (
  concept_id   text references concepts on delete cascade,
  lang_code    text references languages,
  kind         text not null check (kind in ('word','sentence')),
  text_hash    text not null,            -- sha256 of the exact text spoken; regenerate if the text changes
  provider     text not null check (provider in ('gemini')),
  storage_path text not null,            -- Supabase Storage path (e.g. audio/que/WATER/word-<hash>.mp3)
  duration_ms  int,
  created_at   timestamptz default now(),
  primary key (concept_id, lang_code, kind)
);

create table giphy_cache (
  cache_key   text primary key,           -- endpoint + query + params
  response    jsonb not null,
  fetched_at  timestamptz default now()
);

create table curation_queue (
  concept_id  text primary key,
  reason      text,
  queued_at   timestamptz default now()
);

-- Nearest-concept search
create or replace function match_concepts(query_embedding vector(768), match_count int, min_similarity float)
returns table (concept_id text, similarity float)
language sql stable as $$
  select concept_id, 1 - (embedding <=> query_embedding) as similarity
  from concepts
  where embedding is not null
    and 1 - (embedding <=> query_embedding) >= min_similarity
  order by embedding <=> query_embedding
  limit match_count;
$$;
```

---

## 7. Main API: `POST /api/lookup`

**Request**
```json
{ "text": "wave", "source_lang": "eng", "target_lang": "que" }
```

Any supported ISO 639-3 code is valid on either side, including `eng`. `source_lang` and `target_lang` must differ.

**Response**
```json
{
  "concept_id": "WAVE",
  "source": { "lang": "eng", "text": "wave", "matched_form": "wave" },
  "target_lang": "que",
  "alternatives": [
    { "concept_id": "WAVE_WATER", "english_gloss": "wave (of the sea)" }
  ],
  "english_gloss": "wave (greet with a raised hand)",
  "kind": "gesture",
  "target": { "form": "...", "romanization": null, "ipa": "..." },
  "example": { "target": "...", "english": "She waves hello." },
  "confidence": "medium",
  "translation_source": "lexicon",
  "visuals": [
    {
      "provider": "giphy",
      "mp4": "https://...",
      "webp": "https://...",
      "width": 480,
      "height": 270,
      "role": "gesture"
    }
  ],
  "emoji": "👋",
  "audio": {
    "word":     { "url": "https://.../word-ab12.mp3", "provider": "gemini", "synthetic": true },
    "sentence": null
  },
  "attribution": ["giphy"]
}
```

For combos ("eat apple"), `visuals` holds two entries with `role: "gesture"` and `role: "item"`.

**Behaviour**
1. Normalise input (trim, lowercase, strip diacritics for matching only, max 40 characters). Reject empty input with 400.
2. **Resolve** the source text to a concept (section 8a). Check `input_cache` first; on a miss, call Gemma and cache the result.
3. If the user picked an alternative, the client re-sends with `"concept_id"` set; skip step 2.
4. **Render** the concept in the target language (section 8b). Check `translations` for (concept, target_lang) first; on a miss, call Gemma and cache.
   - If `target_lang` is `eng`, the English form and example come from the concept itself; one cheap call or none.
5. Resolve the visual (section 9) from the concept.
5b. Attach audio (section 9A): return cached clip URLs if present. Never block the response on generating audio; if a clip is missing, return `null` and let the client call `/api/audio`.
6. Return. Target latency: under 4 seconds fully uncached (two model calls), under 300 ms cached.

---

## 8. Gemma calls: resolve, then render

Translation is two small calls through the concept, never one direct source→target call. This keeps every direction consistent, lets each half be cached and reused (a concept rendered in Quechua once serves English→Quechua, Ainu→Quechua and so on), and makes errors easy to trace.

### 8a. Resolve: source text → concept

**Word lists are optional** for popular languages; Gemma translates them reliably on its own. If a lexicon exists for a language, use it as below; if not, skip straight to the model call.

**Before calling the model** (only if a lexicon exists), look the input up in the source language's lexicon:
- `source_lang = eng`: match `lexicon_entries.english` (no lexicon needed for the concept itself).
- Any other source language: exact match on `form_normalized`, then fuzzy match with `pg_trgm` similarity ≥ 0.4, top 10. These catch spelling variants and missing diacritics.

**Prompt inputs:** the source text, source language name and code, the lexicon matches (with their English meanings), the existing `concept_id` list (or the top 30 by embedding similarity if it's long), and the gesture ID list from `data/gestures.json`.

**Prompt rules:**
- Return JSON only, matching `ResolveResult`.
- Reuse an existing `concept_id` when one fits; only coin a new one if nothing fits.
- `concept_id` is an uppercase English identifier for one sense (e.g. `RUN`, not `RUN_A_BUSINESS` unless that sense is meant).
- If the input could mean several things, put the most likely first in `concept_id` and up to 3 others in `alternatives`.
- For a non-English source with lexicon matches, prefer meanings supported by the lexicon matches; set `source` to `lexicon` when used. If the word isn't recognised, still give a best guess with `confidence: "low"`.
- `gesture_id` must be one of the provided IDs or `null`. For phrases like "eat apple", return the action as `gesture_id` and the object as `item_concept_id`.

### 8b. Render: concept → target language

**Prompt inputs:** the concept (`concept_id`, `english_gloss`, `kind`), target language name and code, and up to 30 target-language lexicon entries matching the gloss.

**Prompt rules:**
- Return JSON only, matching `RenderResult`.
- Prefer forms from the lexicon entries; set `source` to `lexicon` when used. Never invent a lexicon match.
- If unsure of a form, still answer but set `confidence` to `low`.
- The example sentence must be very simple, use the target word, and suit a beginner. Always include its English meaning.
- When `target_lang` is `eng`, return the English word and a simple English example; romanization and IPA may be null.

### Zod schemas (`lib/schemas.ts`)

```ts
export const ResolveResult = z.object({
  concept_id: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
  english_gloss: z.string(),
  kind: z.enum(["gesture", "item", "other"]),
  gesture_id: z.string().nullable(),
  item_concept_id: z.string().nullable(),
  emoji: z.string().nullable(),
  gif_search_terms: z.array(z.string()).max(3),
  matched_form: z.string().nullable(),   // lexicon form the input matched, if any
  alternatives: z.array(z.object({
    concept_id: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
    english_gloss: z.string(),
  })).max(3),
  source: z.enum(["lexicon", "model"]),
  confidence: z.enum(["low", "medium", "high"]),
});

export const RenderResult = z.object({
  target: z.object({
    form: z.string().min(1),
    romanization: z.string().nullable(),
    ipa: z.string().nullable(),
  }),
  example_sentence: z.object({ target: z.string(), english: z.string() }),
  source: z.enum(["lexicon", "model"]),
  confidence: z.enum(["low", "medium", "high"]),
});
```

**Overall confidence** returned to the client is the lower of the resolve and render confidences.

**Robustness**
- Ask for JSON in the prompt; strip code fences before parsing. Do not assume schema-enforced output works for Gemma the same way as for Gemini.
- On parse or validation failure: one retry with the error message included. Then try `GEMMA_FALLBACK_MODEL`. Then return a 502 with a friendly message.
- Timeout each model call at 15 seconds.

---

## 9. Visual resolution (`lib/lookup.ts`)

For each concept needed (the gesture and/or the item):

1. **Exact match:** `concepts.concept_id` or `aliases` contains it → pick an approved GIF from `concept_gifs`, choosing randomly among the top 3 by `rank`.
2. **Embedding match:** embed `english_gloss`, call `match_concepts(..., 3, 0.80)` → use the best match's approved GIF.
3. **Live GIPHY fallback:** search with `gif_search_terms` (gestures → `/v1/gifs/search`, items → `/v1/stickers/search`, `rating=g`, `limit=10`) through the cached client. Return the first result whose title has no obvious caption terms. Insert the concept into `curation_queue`.
4. **Noto fallback:** if the concept has an emoji with an animated Noto version, return that.
5. **Static emoji:** render the emoji itself.
6. **Nothing:** return `visuals: []`; the UI shows the word card without an image.

Add `"giphy"` to `attribution` whenever any GIPHY visual is returned.

---

## 9A. Audio

Listening is central to comprehensible input, so every card should play the target word and, where possible, the example sentence.

**Provider routing per language** (decided once and stored in `languages.tts_provider` and `data/tts-coverage.json`):

1. **`gemini`**: the language is on Gemini TTS's supported list (`TTS_MODEL`; ~130 languages; VERIFY against the model page). Same API key as Gemma; no extra service.
2. **`none`**: the language isn't covered. Hide the play buttons, show the IPA prominently, and show a small "No audio yet for <language>" note. Do **not** use Gemini TTS on unsupported languages (it would read them with another language's sounds), and do **not** fall back to the browser's built-in speech synthesis.

All audio is generated by Gemini TTS. There are no human recordings, no other speech provider and no self-hosted speech service; do not add any.

**`lib/audio.ts`**
- `getAudio(concept_id, lang, kind, text)`: check `audio_clips` (matching `text_hash`) → return the public URL; otherwise generate via the routed provider, convert to MP3 (or keep WAV/OGG if conversion isn't available), upload to Supabase Storage under `audio/<lang>/<concept_id>/<kind>-<hash>.<ext>`, insert a row, return the URL.
- Gemini 3.8 TTS returns WAV with a standard header by default (older TTS models returned raw PCM; VERIFY). Store the WAV, or convert to MP3 to save space if a converter is available.
- Timeout 20 s per generation. On failure, return `null` and log; never break the card.

**`POST /api/audio`** `{ concept_id, lang, kind }` → `{ url, provider, synthetic }`. Looks up the stored text for that concept/language/kind, then calls `getAudio`. Rate-limit per IP (e.g. 30/minute).

**`08-pregenerate-audio.ts`**: for every demo language × every concept with a translation, generate the `word` clip, and the `sentence` clip for the demo words. Idempotent; skips rows whose `text_hash` matches.

---

## 10. Curation pipeline (scripts)

All scripts must be **idempotent and resumable**: they skip work already done and can be re-run safely after a crash.

| Script | What it does |
| --- | --- |
| `01-seed-concepts.ts` | Load `data/seed-concepts.csv` (~50 gestures + ~250 concrete nouns: `concept_id,english_gloss,kind`) into `concepts`. |
| `02-enrich-concepts.ts` | Batch the concepts (25 per call) to Gemini; fill `emoji`, `aliases`, `search_terms` (2–3 each). |
| `03-search-giphy.ts` | For each concept without approved GIFs, search GIPHY per search term (GIFs endpoint for gestures, stickers for items, `rating=g`, `limit=10`). Insert results into `gifs` as `candidate` and link via `concept_gifs`. Honour `GIPHY_CALLS_PER_HOUR`; log progress and an ETA. |
| `04-screen-candidates.ts` | Send each candidate's still frame or small MP4 rendition to the vision model. Ask for JSON: `{ "matches": bool, "score": 1-5, "has_text": bool, "real_celebrity": bool, "notes": string }`. Set `screened_out` if `has_text`, `real_celebrity`, or `score < 3`. |
| `05-noto-fallback.ts` | For concepts with no approved GIF after curation, map the emoji to Noto Animated Emoji and insert a `noto` row as `approved`. If no animated version exists, insert an `emoji` row. |
| `06-import-lexicon.ts` | **Optional; skip unless time allows.** Load `data/lexicons/<code>.csv` (`english,form,notes`) into `lexicon_entries`, computing `form_normalized` (lowercase, Unicode NFD with combining marks removed, punctuation stripped); set `languages.has_lexicon`. The lexicon is used in both directions. |
| `07-embed-concepts.ts` | Fill `concepts.embedding` for rows missing it. |

**GIPHY client (`lib/giphy.ts`)**
- Endpoints: `https://api.giphy.com/v1/gifs/search` and `https://api.giphy.com/v1/stickers/search` with `api_key`, `q`, `limit`, `rating`, `lang=en`.
- Read renditions from the `images` object (e.g. `fixed_height` with `mp4` and `webp` fields; VERIFY field names against the docs). Store MP4 and WebP URLs; avoid raw GIF where possible.
- Cache every response in `giphy_cache` keyed by endpoint + params. Treat cached entries as fresh for 7 days.
- On HTTP 429, stop and report remaining work; do not retry in a tight loop.

**Noto helper (`lib/noto.ts`)**
- Convert an emoji to its codepoint sequence (lowercase hex, joined by `_`).
- Asset URL pattern (VERIFY): `https://fonts.gstatic.com/s/e/notoemoji/latest/<codepoint>/512.webp` (also `512.gif`, `lottie.json`).
- Check availability against Noto's published list of animated emoji, cache the list locally in `data/noto-animated.json`, and copy chosen files into Supabase Storage.

**Admin pick page (`/admin/curate`)**
- Password check against `ADMIN_PASSWORD` (cookie after first entry).
- Shows concepts with candidates but no approved GIF, one row per concept: gloss + up to 5 screened candidates playing as muted looping MP4s.
- Keyboard: `1`–`5` approve that candidate, `x` mark none good (concept goes to Noto fallback), arrow keys move between concepts.
- Approving sets `status='approved'`, sets `rank`, and marks other candidates for that concept `rejected`.
- Show a progress counter (approved / total).

---

## 11. Milestones and acceptance criteria

**M1: Skeleton (target: hour 3)**
- Next.js app runs locally and on Vercel; env vars wired; Supabase migration applied.
- `/` has the input, language picker and an empty word card.
- ✅ Done when: the deployed URL loads and `POST /api/lookup` returns a stubbed response.

**M2: Translation (target: hour 6)**
- Resolve and render calls (with lexicon injection only if lexicons exist), Zod validation, retry and fallback, `input_cache` and `translations` caching.
- ✅ Done when: 10 test words return valid JSON in each direction (English → each demo language, each demo language → English, demo language 1 → demo language 2); a word typed without its accents (e.g. "cafe" for "café") still resolves; a repeat request is served from cache.

**M3: Curation pipeline (start by hour 3; run in the background)**
- Scripts 01–03 written and the GIPHY batch running by hour 4.
- Scripts 04–07 and the admin page working by hour 12.
- ✅ Done when: at least 200 concepts have an approved visual (GIPHY or Noto).

**M4: Visual resolution (target: hour 12)**
- Full fallback chain from section 9, including combos.
- ✅ Done when: a word with a curated GIF, an unknown synonym, an uncurated word, and a nonsense word each render correctly without errors.

**M5: Polish (target: hour 20)**
- Word card animation (pop-in, gentle bounce), romanization, IPA, example sentence, confidence badge, GIPHY attribution, About page, mobile layout.
- Preload the visual for the next likely word; show a skeleton while loading.
- ✅ Done when: the demo script (section 13) runs end to end on a phone and a laptop.

**M4b: Audio (target: hour 16)**
- Gemini TTS wired; `lib/audio.ts`, `/api/audio`, `AudioButton`, and script 08.
- ✅ Done when: every demo word in a Gemini-supported language plays within 1 s (pre-generated), an uncached word generates on tap within 5 s, and a language with no audio hides the buttons cleanly and shows IPA.

**Stretch (only after M5):** flashcard/quiz mode over words seen in the session; slow-playback toggle.

**M6: Speech input (extra goal, only after everything above is done and the demo script passes)**

Let the learner say a word instead of typing it. Do not start this until M1–M5, M4b and the stretch goals are complete; if time is short, skip it entirely.

- **Recording:** the mic button on the input card (hidden until this milestone) records up to 4 seconds with `MediaRecorder` and uploads the clip to `POST /api/transcribe { audio, source_lang }`. Ask for microphone permission only when the button is first tapped.
- **English and other well-supported languages:** send the audio to Gemma 4 on the Gemini API as audio input and ask for the transcription only, as JSON `{ "text": string, "confidence": "low|medium|high" }`. VERIFY that the hosted Gemma 4 model accepts audio input; if not, use the current Gemini Flash model for this step.
- **Per language:** only enable the mic for a language after testing that Gemma (or Gemini) transcribes it acceptably on a handful of demo words.
- **Routing:** store `asr_provider` (`gemma` or `none`) per language next to `tts_provider`. Hide the mic button for `none`.
- **Confirm before translating:** put the transcript into the input field and let the learner edit it or press "Show me". Never translate a transcript automatically, since speech recognition can mishear short single words.
- ✅ Done when: saying an English demo word fills the input correctly; saying a word in an enabled demo language fills the input (or shows a clear "didn't catch that"); languages without speech recognition show no mic button; typing still works exactly as before.

---

## 12. UI notes

- Friendly and playful: rounded cards, soft colours, big readable target-language text, the English gloss smaller and secondary.
- **Language controls:** a "from" and a "to" picker (English included in both) with a swap button between them. Remember the last pair in `localStorage`.
- **Card layout:** source word above, GIF in the middle, target word below, so the learner sees both forms around the same picture.
- **Did you mean:** when `alternatives` is non-empty, show them as small chips under the card; tapping one re-sends the request with that `concept_id`.
- **Character palette:** when the source language uses characters not on a standard keyboard, show a row of tappable characters under the input. Use a fixed set per language (e.g. Spanish: á é í ó ú ü ñ ¿ ¡; French: é è ê à ç ô û ï; German: ä ö ü ß). Hide the palette for languages typed with an input method (Japanese, Korean, Mandarin).
- The GIF is the hero of the card. Use `<video autoplay loop muted playsinline>` for MP4, `<img>` for WebP, and reserve the aspect ratio to avoid layout shift.
- **Never show English text inside the visual area.** The GIF should carry the meaning on its own.
- Confidence badge: `high` = no badge, `medium` = subtle note, `low` = "Unverified translation" in amber.
- **Mic button:** present in the design but hidden until M6 (speech input).
- **Audio:** a speaker button on the card (top right) plays the word; a play button in "Word in use" plays the sentence. Show a small waveform animation while playing, a spinner while generating, and a "synthetic voice" note when `synthetic` is true. Autoplay the word once when a new card appears only after the user has interacted with the page (browser autoplay rules). Tap again to replay; long-press (or a toggle) for 0.75× speed.
- **Visual identity:** follow `ui-mockup.html` (Jost font, royal blue `#2F5BEA` cards with stacked ghost cards behind, soft `#F5F7FC` canvas, white rounded panels, emoji Hard / Medium / Easy rating row). Reuse its CSS tokens as Tailwind theme values.
- Accessible: alt text from `english_gloss`, keyboard-usable input, respects `prefers-reduced-motion` (show the first frame and a play button).

---

## 13. Demo script (must always work)

1. Type "wave", pick demo language 1 → gesture GIF, translation, example sentence.
2. Type "apple" → item sticker.
3. Type "eat apple" → gesture and item side by side.
4. Type "puppy" (not in the library) → embedding match to `DOG`.
5. Type an uncurated word → live GIPHY fallback or emoji, no errors.
6. Switch to demo language 2 and repeat step 1 → same GIF, different translation.
7. Press swap and type the demo-language-1 word for "water" → English "water", same visual.
8. Translate a demo-language-1 word directly into demo language 2 → both forms around one GIF.
9. Type an ambiguous English word (e.g. "bat") → "did you mean" chips; tapping one changes the card.
10. Tap the speaker on any demo card → word audio plays; tap the sentence play button → sentence audio plays.

Pre-warm all demo words before presenting. Keep a JSON snapshot of their responses in `/data/demo-fallback.json` and serve it if any API is down.

---

## 14. Testing

- Unit tests (Vitest) for: Zod parsing and repair path, emoji-to-codepoint conversion, GIPHY rate limiter, lookup fallback order, text normalisation (diacritics, case, punctuation), confidence merging across resolve and render, TTS provider routing, and `text_hash` cache invalidation.
- A script `scripts/smoke.ts` that runs the demo words against the deployed API and prints pass/fail.

---

## 15. Open decisions (confirm with the team before M2)

- Demo languages: 2–3 popular languages, all on Gemini TTS's supported list. One with a non-Latin script (e.g. Japanese) shows off romanization.
- Event length (plan assumes 24 hours, three people).
