-- Migration: 0008 — add French language columns for FR scraper

-- ─── programs ────────────────────────────────────────────────────────────────

ALTER TABLE programs
  ADD COLUMN IF NOT EXISTS title_fr text,
  ADD COLUMN IF NOT EXISTS description_fr text;

-- ─── institutions ─────────────────────────────────────────────────────────────

ALTER TABLE institutions
  ADD COLUMN IF NOT EXISTS name_fr text;

-- ─── Update search vector function to include French fields ──────────────────

CREATE OR REPLACE FUNCTION programs_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('simple', coalesce(NEW.title_en, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(NEW.title_nl, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(NEW.title_de, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(NEW.title_fr, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(NEW.field_of_study, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(NEW.description_en, '')), 'C') ||
    setweight(to_tsvector('simple', coalesce(NEW.description_nl, '')), 'C') ||
    setweight(to_tsvector('simple', coalesce(NEW.description_de, '')), 'C') ||
    setweight(to_tsvector('simple', coalesce(NEW.description_fr, '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION institutions_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('simple', coalesce(NEW.name_en, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(NEW.name_nl, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(NEW.name_de, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(NEW.name_fr, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(NEW.city, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(NEW.description_en, '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
