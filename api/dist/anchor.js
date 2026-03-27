// Batch anchoring service for blockchain data integrity.
//
// Collects content hashes from a set of records, builds a Merkle tree,
// and anchors the Merkle root on an external network.
//
// Supported networks:
//   "simulated"      — local PoC, uses a deterministic hash as the tx_id
//   "opentimestamps" — submits to the public OTS calendar (BTC-backed, free)
//
// Production path: switch ANCHOR_NETWORK=opentimestamps to get real BTC anchors.
import { createHash } from "crypto";
import { and, eq } from "drizzle-orm";
import { db, blockchainAnchors, anchorProofs } from "./db.js";
import { buildMerkleTree, computeContentHash } from "./merkle.js";
// ─── Network adapters ─────────────────────────────────────────────────────────
/**
 * Simulated anchor: derives a deterministic "tx_id" from the Merkle root and
 * current timestamp. Not externally verifiable — for PoC and local testing only.
 */
async function anchorSimulated(merkleRoot) {
    const txId = createHash("sha256")
        .update(`simulated:${merkleRoot}:${Date.now()}`)
        .digest("hex");
    return { txId, status: "confirmed" };
}
/**
 * OpenTimestamps anchor: POST the Merkle root bytes to the OTS calendar.
 * The calendar aggregates submissions into a Bitcoin transaction (BTC-backed).
 *
 * Returns a pending status; the OTS proof is confirmed after ~1 Bitcoin block
 * (~10 minutes). The proof_data field stores the base64-encoded OTS file for
 * later upgrade (OTS upgrade fetches confirmation from the calendar).
 *
 * See: https://opentimestamps.org / https://github.com/opentimestamps/opentimestamps-server
 */
async function anchorOpenTimestamps(merkleRoot) {
    const rootBytes = Buffer.from(merkleRoot, "hex");
    try {
        const response = await fetch("https://alice.btc.calendar.opentimestamps.org/digest", {
            method: "POST",
            headers: { "Content-Type": "application/octet-stream" },
            body: rootBytes,
            signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) {
            console.warn(`[anchor] OTS calendar returned ${response.status}, falling back to pending`);
            return { txId: null, status: "pending", proofData: null };
        }
        // The response body is the binary OTS receipt (partial proof, confirmed later)
        const otsBytes = await response.arrayBuffer();
        const proofData = Buffer.from(otsBytes).toString("base64");
        // The submission ID is the root hash itself (OTS identifies by the hash submitted)
        return { txId: merkleRoot, status: "pending", proofData };
    }
    catch (err) {
        console.warn("[anchor] OTS calendar unreachable:", err instanceof Error ? err.message : err);
        return { txId: null, status: "pending", proofData: null };
    }
}
// ─── Batch anchor ─────────────────────────────────────────────────────────────
/**
 * Anchor a batch of records on the configured network.
 *
 * Steps:
 *   1. Compute content hash per record
 *   2. Build Merkle tree over the hashes
 *   3. Submit Merkle root to the selected network
 *   4. Persist anchor + proofs to DB
 */
export async function batchAnchor(records, network = process.env["ANCHOR_NETWORK"] ?? "simulated") {
    if (records.length === 0) {
        throw new Error("batchAnchor: cannot anchor an empty batch");
    }
    // Step 1 — compute content hashes
    const hashes = records.map((r) => computeContentHash(r.contentJson));
    // Step 2 — build Merkle tree
    const tree = buildMerkleTree(hashes);
    // Step 3 — submit to network
    let txId = null;
    let status = "pending";
    let proofData = null;
    if (network === "simulated") {
        const result = await anchorSimulated(tree.root);
        txId = result.txId;
        status = result.status;
    }
    else if (network === "opentimestamps") {
        const result = await anchorOpenTimestamps(tree.root);
        txId = result.txId;
        status = result.status;
        proofData = result.proofData;
    }
    else {
        // Ethereum / Bitcoin: not implemented in PoC — leave pending for manual submission
        console.warn(`[anchor] network "${network}" not yet implemented in PoC, creating pending anchor`);
        status = "pending";
    }
    // Step 4 — persist anchor
    const [anchor] = await db
        .insert(blockchainAnchors)
        .values({
        network,
        txId,
        merkleRoot: tree.root,
        recordCount: records.length,
        status,
        proofData,
    })
        .returning({ id: blockchainAnchors.id });
    const anchorId = anchor.id;
    // Step 5 — persist per-record proofs
    await db.insert(anchorProofs).values(records.map((record, i) => ({
        anchorId,
        recordId: record.recordId,
        recordType: record.recordType,
        contentHash: hashes[i],
        merklePath: tree.proofs[i],
        leafIndex: i,
    })));
    return {
        anchorId,
        network,
        merkleRoot: tree.root,
        txId,
        status,
        recordCount: records.length,
    };
}
/**
 * Fetch all anchor proofs for a given record, ordered newest first.
 */
export async function getRecordProofs(recordType, recordId) {
    return db
        .select({
        proofId: anchorProofs.id,
        leafIndex: anchorProofs.leafIndex,
        contentHash: anchorProofs.contentHash,
        merklePath: anchorProofs.merklePath,
        createdAt: anchorProofs.createdAt,
        // Anchor fields
        anchorId: blockchainAnchors.id,
        network: blockchainAnchors.network,
        txId: blockchainAnchors.txId,
        merkleRoot: blockchainAnchors.merkleRoot,
        anchoredAt: blockchainAnchors.anchoredAt,
        confirmedAt: blockchainAnchors.confirmedAt,
        anchorStatus: blockchainAnchors.status,
        recordCount: blockchainAnchors.recordCount,
    })
        .from(anchorProofs)
        .innerJoin(blockchainAnchors, eq(anchorProofs.anchorId, blockchainAnchors.id))
        .where(and(eq(anchorProofs.recordType, recordType), eq(anchorProofs.recordId, String(recordId))))
        .orderBy(blockchainAnchors.anchoredAt);
}
//# sourceMappingURL=anchor.js.map