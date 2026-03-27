CREATE TABLE IF NOT EXISTS "funding_programs" (
  "id" serial PRIMARY KEY NOT NULL,
  "slug" varchar(512) NOT NULL,
  "title_de" text NOT NULL,
  "title_en" text,
  "funding_type" text,
  "funding_area" text,
  "funding_region" text,
  "eligible_applicants" text,
  "contact_info" text,
  "summary_de" text,
  "description_de" text,
  "legal_requirements_de" text,
  "directive_de" text,
  "summary_en" text,
  "description_en" text,
  "legal_requirements_en" text,
  "funding_amount_info" text,
  "application_process" text,
  "deadline_info" text,
  "level" varchar(32),
  "state" varchar(64),
  "category" varchar(128),
  "source_url" text NOT NULL,
  "source_id" varchar(256),
  "is_active" boolean NOT NULL DEFAULT true,
  "version" integer NOT NULL DEFAULT 1,
  "content_hash" varchar(64),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "funding_programs_slug_unique" UNIQUE("slug")
);

CREATE TABLE IF NOT EXISTS "funding_changelog" (
  "id" serial PRIMARY KEY NOT NULL,
  "funding_program_id" integer NOT NULL REFERENCES "funding_programs"("id") ON DELETE CASCADE,
  "version" integer NOT NULL,
  "changes_de" text,
  "changes_en" text,
  "changed_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- Full text search
ALTER TABLE "funding_programs" ADD COLUMN IF NOT EXISTS "search_vector" tsvector;
CREATE INDEX IF NOT EXISTS "idx_funding_search" ON "funding_programs" USING GIN ("search_vector");

CREATE OR REPLACE FUNCTION funding_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector(german, coalesce(NEW.title_de, )), A) ||
    setweight(to_tsvector(german, coalesce(NEW.summary_de, )), B) ||
    setweight(to_tsvector(german, coalesce(NEW.funding_area, )), B) ||
    setweight(to_tsvector(german, coalesce(NEW.eligible_applicants, )), C) ||
    setweight(to_tsvector(german, coalesce(NEW.description_de, )), D);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS funding_search_vector_trigger ON "funding_programs";
CREATE TRIGGER funding_search_vector_trigger
  BEFORE INSERT OR UPDATE ON "funding_programs"
  FOR EACH ROW EXECUTE FUNCTION funding_search_vector_update();

-- Useful indexes
CREATE INDEX IF NOT EXISTS "idx_funding_level" ON "funding_programs" ("level");
CREATE INDEX IF NOT EXISTS "idx_funding_state" ON "funding_programs" ("state");
CREATE INDEX IF NOT EXISTS "idx_funding_active" ON "funding_programs" ("is_active");
