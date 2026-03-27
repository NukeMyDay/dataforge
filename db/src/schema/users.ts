import { boolean, pgEnum, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";

export const userTierEnum = pgEnum("user_tier", ["free", "pro", "enterprise"]);
export const userStatusEnum = pgEnum("user_status", ["active", "suspended", "deleted"]);

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  tier: userTierEnum("tier").notNull().default("free"),
  status: userStatusEnum("status").notNull().default("active"),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  stripeSubscriptionStatus: text("stripe_subscription_status"),
  stripePriceId: text("stripe_price_id"),
  subscriptionCurrentPeriodEnd: timestamp("subscription_current_period_end"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
