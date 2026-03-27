-- Add is_active boolean to users table for direct block/unblock support
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "is_active" boolean NOT NULL DEFAULT true;
