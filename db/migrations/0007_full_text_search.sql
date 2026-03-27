-- Migration: 0007 — add tsvector search columns with GIN indexes and update triggers

-- ─── programs ────────────────────────────────────────────────────────────────

ALTER TABLE programs
  ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- Populate initially
UPDATE programs
SET search_vector = (
  setweight(to_tsvector('simple', coalesce(title_en, '')), 'A') ||
  setweight(to_tsvector('simple', coalesce(title_nl, '')), 'A') ||
  setweight(to_tsvector('simple', coalesce(title_de, '')), 'A') ||
  setweight(to_tsvector('simple', coalesce(field_of_study, '')), 'B') ||
  setweight(to_tsvector('simple', coalesce(description_en, '')), 'C') ||
  setweight(to_tsvector('simple', coalesce(description_nl, '')), 'C') ||
  setweight(to_tsvector('simple', coalesce(description_de, '')), 'C')
);

CREATE INDEX IF NOT EXISTS idx_programs_search ON programs USING gin(search_vector);

CREATE OR REPLACE FUNCTION programs_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('simple', coalesce(NEW.title_en, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(NEW.title_nl, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(NEW.title_de, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(NEW.field_of_study, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(NEW.description_en, '')), 'C') ||
    setweight(to_tsvector('simple', coalesce(NEW.description_nl, '')), 'C') ||
    setweight(to_tsvector('simple', coalesce(NEW.description_de, '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS programs_search_vector_trigger ON programs;
CREATE TRIGGER programs_search_vector_trigger
  BEFORE INSERT OR UPDATE ON programs
  FOR EACH ROW EXECUTE FUNCTION programs_search_vector_update();

-- ─── institutions ─────────────────────────────────────────────────────────────

ALTER TABLE institutions
  ADD COLUMN IF NOT EXISTS search_vector tsvector;

UPDATE institutions
SET search_vector = (
  setweight(to_tsvector('simple', coalesce(name_en, '')), 'A') ||
  setweight(to_tsvector('simple', coalesce(name_nl, '')), 'A') ||
  setweight(to_tsvector('simple', coalesce(name_de, '')), 'A') ||
  setweight(to_tsvector('simple', coalesce(city, '')), 'B') ||
  setweight(to_tsvector('simple', coalesce(description_en, '')), 'C')
);

CREATE INDEX IF NOT EXISTS idx_institutions_search ON institutions USING gin(search_vector);

CREATE OR REPLACE FUNCTION institutions_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('simple', coalesce(NEW.name_en, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(NEW.name_nl, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(NEW.name_de, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(NEW.city, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(NEW.description_en, '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS institutions_search_vector_trigger ON institutions;
CREATE TRIGGER institutions_search_vector_trigger
  BEFORE INSERT OR UPDATE ON institutions
  FOR EACH ROW EXECUTE FUNCTION institutions_search_vector_update();

-- ─── regulations ─────────────────────────────────────────────────────────────

ALTER TABLE regulations
  ADD COLUMN IF NOT EXISTS search_vector tsvector;

UPDATE regulations
SET search_vector = (
  setweight(to_tsvector('simple', coalesce(title_en, '')), 'A') ||
  setweight(to_tsvector('simple', coalesce(title_de, '')), 'A') ||
  setweight(to_tsvector('simple', coalesce(body_en, '')), 'C') ||
  setweight(to_tsvector('simple', coalesce(body_de, '')), 'C')
);

CREATE INDEX IF NOT EXISTS idx_regulations_search ON regulations USING gin(search_vector);

CREATE OR REPLACE FUNCTION regulations_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('simple', coalesce(NEW.title_en, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(NEW.title_de, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(NEW.body_en, '')), 'C') ||
    setweight(to_tsvector('simple', coalesce(NEW.body_de, '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS regulations_search_vector_trigger ON regulations;
CREATE TRIGGER regulations_search_vector_trigger
  BEFORE INSERT OR UPDATE ON regulations
  FOR EACH ROW EXECUTE FUNCTION regulations_search_vector_update();
