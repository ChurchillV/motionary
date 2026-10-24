-- Languages supported for the hackathon (ISO 639-3). tts_provider mirrors data/tts-coverage.json.
insert into languages (lang_code, name, script, tts_provider) values
  ('eng', 'English',    'Latn', 'gemini'),
  ('spa', 'Spanish',    'Latn', 'gemini'),
  ('fra', 'French',     'Latn', 'gemini'),
  ('deu', 'German',     'Latn', 'gemini'),
  ('ita', 'Italian',    'Latn', 'gemini'),
  ('por', 'Portuguese', 'Latn', 'gemini'),
  ('jpn', 'Japanese',   'Jpan', 'gemini'),
  ('kor', 'Korean',     'Kore', 'gemini'),
  ('cmn', 'Mandarin',   'Hans', 'gemini')
on conflict (lang_code) do update set name = excluded.name, script = excluded.script, tts_provider = excluded.tts_provider;

-- Fuzzy reverse lookup on lexicon forms (pg_trgm), used by lib/db.ts lexiconLookup().
create or replace function match_lexicon(p_lang text, p_query text, p_min_similarity float, p_limit int)
returns setof lexicon_entries
language sql stable as $$
  select *
  from lexicon_entries
  where lang_code = p_lang
    and similarity(form_normalized, p_query) >= p_min_similarity
  order by similarity(form_normalized, p_query) desc
  limit p_limit;
$$;

-- Approximate nearest-neighbour index for concept embeddings.
create index if not exists concepts_embedding_idx on concepts using hnsw (embedding vector_cosine_ops);

-- Public bucket for generated audio and self-hosted Noto emoji (never GIPHY media).
insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do nothing;

-- All reads and writes go through the server with the service role key.
-- Enable RLS with no policies so the anon key cannot read or write tables.
alter table languages       enable row level security;
alter table concepts        enable row level security;
alter table gifs            enable row level security;
alter table concept_gifs    enable row level security;
alter table translations    enable row level security;
alter table lexicon_entries enable row level security;
alter table input_cache     enable row level security;
alter table audio_clips     enable row level security;
alter table giphy_cache     enable row level security;
alter table curation_queue  enable row level security;
