import { integer, jsonb, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";

// ─── blockchain_anchors ────────────────────────────────────────────────────────
// One row per anchoring event. Records the Merkle root of a batch of content
// hashes submitted to an external timestamping/blockchain service.
//
// network values:
//   "opentimestamps" — BTC-backed, free, calendar-aggregated (production target)
//   "ethereum"       — direct Ethereum tx data field (costs gas)
//   "bitcoin"        — OP_RETURN output (~$0.01/anchor)
//   "simulated"      — local PoC only, not externally verifiable
//
// status values:
//   "pending"    — submitted but not yet confirmed on-chain
//   "confirmed"  — tx mined / OTS upgrade complete
//   "failed"     — submission failed or timed out
export const blockchainAnchors = pgTable("blockchain_anchors", {
  id: serial("id").primaryKey(),

  // Which network/service was used for this anchor
  network: varchar("network", { length: 32 }).notNull(), // opentimestamps | ethereum | bitcoin | simulated

  // External identifier: Bitcoin/Ethereum tx hash, or OTS calendar submission ID
  txId: text("tx_id"),

  // SHA-256 hex of the Merkle root of all anchored record hashes in this batch
  merkleRoot: varchar("merkle_root", { length: 64 }).notNull(),

  // When the anchor was submitted to the network
  anchoredAt: timestamp("anchored_at", { withTimezone: true }).notNull().defaultNow(),

  // When the anchor was confirmed on-chain (null = pending)
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),

  // Number of records whose content hashes were included in this Merkle tree
  recordCount: integer("record_count").notNull().default(0),

  // pending | confirmed | failed
  status: varchar("status", { length: 16 }).notNull().default("pending"),

  // Raw OTS proof bytes or other network-specific data (base64-encoded if binary)
  proofData: text("proof_data"),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── anchor_proofs ─────────────────────────────────────────────────────────────
// One row per record included in a blockchain anchor batch.
// Stores the Merkle path (sibling hashes) needed to verify membership in the root.
//
// Given an anchor_proof row, any party can:
//   1. Compute SHA-256(record content) and compare to content_hash
//   2. Walk the merkle_path to reconstruct the Merkle root
//   3. Verify the Merkle root matches blockchain_anchors.merkle_root
//   4. Verify blockchain_anchors.tx_id on the respective network
export const anchorProofs = pgTable("anchor_proofs", {
  id: serial("id").primaryKey(),

  // Foreign key to the anchor batch
  anchorId: integer("anchor_id")
    .notNull()
    .references(() => blockchainAnchors.id, { onDelete: "cascade" }),

  // Logical identifier of the record (e.g. "funding:123", "genehmigung:456")
  recordId: text("record_id").notNull(),

  // Domain category of the record (funding | genehmigung | handelsregister | ...)
  recordType: varchar("record_type", { length: 64 }).notNull(),

  // SHA-256 hex of the record's canonical content at the time of anchoring
  contentHash: varchar("content_hash", { length: 64 }).notNull(),

  // Merkle inclusion proof: array of {hash: string, position: "left"|"right"}
  // Walk from leaf → root by hashing (leaf, sibling) at each level
  merklePath: jsonb("merkle_path").notNull(),

  // Zero-based leaf index in the Merkle tree (used to reconstruct path direction)
  leafIndex: integer("leaf_index").notNull(),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
