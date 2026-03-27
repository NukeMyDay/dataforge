import { integer, jsonb, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";
const blockchainAnchors = pgTable("blockchain_anchors", {
  id: serial("id").primaryKey(),
  // Which network/service was used for this anchor
  network: varchar("network", { length: 32 }).notNull(),
  // opentimestamps | ethereum | bitcoin | simulated
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
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});
const anchorProofs = pgTable("anchor_proofs", {
  id: serial("id").primaryKey(),
  // Foreign key to the anchor batch
  anchorId: integer("anchor_id").notNull().references(() => blockchainAnchors.id, { onDelete: "cascade" }),
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
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});
export {
  anchorProofs,
  blockchainAnchors
};
