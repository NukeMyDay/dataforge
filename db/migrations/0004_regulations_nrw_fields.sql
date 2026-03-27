-- Add structured NRW event permit fields to regulations table
ALTER TABLE "regulations"
  ADD COLUMN IF NOT EXISTS "responsible_authority_de" text,
  ADD COLUMN IF NOT EXISTS "responsible_authority_en" text,
  ADD COLUMN IF NOT EXISTS "requirements_de" text,
  ADD COLUMN IF NOT EXISTS "requirements_en" text,
  ADD COLUMN IF NOT EXISTS "process_de" text,
  ADD COLUMN IF NOT EXISTS "process_en" text,
  ADD COLUMN IF NOT EXISTS "deadline_notes_de" text,
  ADD COLUMN IF NOT EXISTS "deadline_notes_en" text;
