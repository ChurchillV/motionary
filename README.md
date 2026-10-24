# Motionary

Learn words through comprehensible input: type a word, pick two languages, and get the translation with a playful looping GIF, spoken audio and a simple example sentence.

Type a full sentence and Motionary switches to **sentence mode**: one direct translation (one model call, cached), with an animated deck of its key words below (swipe or tap through; each card shows the word's GIF, translation and meaning).

Translation goes through a language-independent concept (`wave` → `WAVE` → `saludar`), so it works in any direction and the GIF stays the same. The full spec is in [AGENT_BUILD_INSTRUCTIONS.md](AGENT_BUILD_INSTRUCTIONS.md); the visual design follows [ui-mockup.html](ui-mockup.html).

## Run it

```bash
npm install
cp .env.example .env.local   # fill in the keys you have
npm run dev                  # http://localhost:3000
```

**It runs with no keys at all.** Without Supabase, data lives in `.local-data/` (a JSON store for local development). Without a Gemini key, the demo words in `data/demo-fallback.json` still translate, with Noto animated emoji as visuals. Each key you add turns on more:

| Key | Turns on |
| --- | --- |
| `GEMINI_API_KEY` | Gemma translation of any word, embeddings ("puppy" → DOG's GIF), vision screening, Gemini TTS audio |
| `GIPHY_API_KEY` | Live GIPHY fallback and the curation pipeline |
| Supabase URL + keys | Shared Postgres/pgvector database and storage (needed on Vercel) |
| `ADMIN_PASSWORD` | `/admin/curate` |

## Supabase setup

1. Create a project, then run `supabase/migrations/0001_init.sql` and `0002_seed_and_security.sql` (SQL editor or `supabase db push`).
2. `0002` adds the language rows, the public `media` storage bucket (audio and Noto files), a fuzzy lexicon search function, and row-level security so only the server's service role key can read or write.

## Build the GIF library (run in order; every script is safe to re-run)

```bash
npm run seed      # 01  load data/seed-concepts.csv (294 concepts)
npm run enrich    # 02  emoji, aliases, GIPHY search terms (Gemini)
npm run giphy     # 03  GIPHY candidates; waits when the 100/hour budget is spent
npm run screen    # 04  vision screening (text, celebrities, score < 3 are dropped)
#                       then pick GIFs at /admin/curate  (1–5 approve, x none good, ↑↓ move)
npm run noto      # 05  Noto emoji for concepts left without a GIF
npm run lexicon   # 06  optional word lists in data/lexicons/<code>.csv
npm run embed     # 07  concept embeddings
npm run smoke     # demo script check + pre-warms the demo words
npm run audio     # 08  pre-generate audio for the demo languages (after smoke)
```

At 100 GIPHY calls an hour, script 03 needs several hours for the full list, so start it early.

## Before the demo

```bash
BASE_URL=https://your-app.vercel.app npm run smoke              # pass/fail for every demo step
BASE_URL=https://your-app.vercel.app npm run smoke -- --snapshot # refresh data/demo-fallback.json
```

## Tests

```bash
npm test          # Vitest: schemas and repair path, normalisation, Noto codepoints, rate limiter,
                  # visual fallback order, confidence merging, TTS routing, text_hash invalidation
npm run typecheck
npm run lint
```

## Notes

- Demo languages are Spanish (`spa`) and Japanese (`jpn`, shows off romanization), set in `lib/languages.ts` (`DEMO_LANGS`). Nine languages are supported in total.
- GIPHY media is never re-hosted; only IDs and URLs are stored, and "Powered by GIPHY" shows wherever GIPHY content appears.
- `VISION_MODEL` defaults to `gemini-flash-latest` when blank. The TTS model ID (`gemini-3.8-flash-tts`) is from the spec; check it against the Gemini models list.
- Speech input (milestone M6) is not built yet; the mic button stays hidden until it is.
