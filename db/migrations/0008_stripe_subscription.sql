-- Migration: 0008 — add Stripe subscription tracking fields to users

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS stripe_subscription_id   text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_status text,
  ADD COLUMN IF NOT EXISTS stripe_price_id           text,
  ADD COLUMN IF NOT EXISTS subscription_current_period_end timestamptz;
