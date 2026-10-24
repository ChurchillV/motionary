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
