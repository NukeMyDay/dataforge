CREATE TYPE "user_tier" AS ENUM('free', 'pro', 'enterprise');
CREATE TYPE "user_status" AS ENUM('active', 'suspended', 'deleted');

CREATE TABLE IF NOT EXISTS "users" (
  "id" serial PRIMARY KEY NOT NULL,
  "email" varchar(255) NOT NULL,
  "password_hash" text NOT NULL,
  "tier" "user_tier" NOT NULL DEFAULT 'free',
  "status" "user_status" NOT NULL DEFAULT 'active',
  "stripe_customer_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "users_email_unique" UNIQUE("email")
);
