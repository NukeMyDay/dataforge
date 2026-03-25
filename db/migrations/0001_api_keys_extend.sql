ALTER TABLE "api_keys" RENAME COLUMN "label" TO "name";
ALTER TABLE "api_keys" ADD COLUMN "tier" varchar(32) NOT NULL DEFAULT 'free';
ALTER TABLE "api_keys" ADD COLUMN "is_active" boolean NOT NULL DEFAULT true;
ALTER TABLE "api_keys" ADD COLUMN "last_used_at" timestamp with time zone;
ALTER TABLE "api_keys" ADD COLUMN "request_count" integer NOT NULL DEFAULT 0;
