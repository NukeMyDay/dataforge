// Blockchain Integrity API — /v1/integrity/:recordType/:recordId
//
// Returns the blockchain anchoring status and Merkle inclusion proof for a
// Sophex data record. Given this response, any third party can independently
// verify that the record existed in a specific form at a specific time:
//
//   1. Recompute SHA-256 of the record content → must match content_hash
//   2. Walk merkle_path to reconstruct the Merkle root → must match anchor.merkle_root
//   3. Look up anchor.tx_id on the blockchain → confirms root was anchored at anchor_time
//
// The verification_instructions field in the response explains this process
// in human-readable form.
import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { db, blockchainAnchors, anchorProofs } from "../db.js";
import { verifyMerkleProof } from "../merkle.js";
export const integrityRouter = new Hono();
// GET /v1/integrity/:recordType/:recordId
// Returns all anchored proofs for this record, newest first.
integrityRouter.get("/:recordType/:recordId", async (c) => {
    const recordType = c.req.param("recordType");
    const recordId = c.req.param("recordId");
    if (!recordType || !recordId) {
        return c.json({ data: null, meta: null, error: "recordType and recordId are required" }, 400);
    }
    const proofRows = await db
        .select({
        proofId: anchorProofs.id,
        leafIndex: anchorProofs.leafIndex,
        contentHash: anchorProofs.contentHash,
        merklePath: anchorProofs.merklePath,
        proofCreatedAt: anchorProofs.createdAt,
        // Anchor
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
        .where(and(eq(anchorProofs.recordType, recordType), eq(anchorProofs.recordId, recordId)))
        .orderBy(blockchainAnchors.anchoredAt);
    if (proofRows.length === 0) {
        return c.json({
            data: null,
            meta: { recordType, recordId, anchorCount: 0 },
            error: "No blockchain anchors found for this record",
        }, 404);
    }
    // Validate each proof in-process (sanity check, not strictly necessary for API response)
    const proofs = proofRows.map((row) => {
        const merklePath = row.merklePath;
        const proofValid = verifyMerkleProof(row.contentHash, merklePath, row.merkleRoot);
        return {
            proofId: row.proofId,
            leafIndex: row.leafIndex,
            contentHash: row.contentHash,
            merklePath,
            anchoredAt: row.proofCreatedAt,
            anchor: {
                id: row.anchorId,
                network: row.network,
                txId: row.txId,
                merkleRoot: row.merkleRoot,
                anchoredAt: row.anchoredAt,
                confirmedAt: row.confirmedAt,
                status: row.anchorStatus,
                batchSize: row.recordCount,
                // Provide explorer links for real networks
                explorerUrl: buildExplorerUrl(row.network, row.txId),
            },
            // Inline proof validity (does the stored proof verify against the stored root?)
            _proofIntact: proofValid,
        };
    });
    // Most recent anchor is the authoritative one
    const latestProof = proofs[proofs.length - 1];
    return c.json({
        data: {
            recordType,
            recordId,
            // Current anchoring state (from most recent anchor)
            latestContentHash: latestProof.contentHash,
            latestAnchorStatus: latestProof.anchor.status,
            latestAnchoredAt: latestProof.anchor.anchoredAt,
            // All anchor proofs, oldest first
            proofs,
            // Human-readable verification instructions
            verificationInstructions: buildVerificationInstructions(latestProof.contentHash, latestProof.merklePath, latestProof.anchor.merkleRoot, latestProof.anchor.network, latestProof.anchor.txId),
        },
        meta: {
            recordType,
            recordId,
            anchorCount: proofs.length,
        },
        error: null,
    });
});
// GET /v1/integrity/anchors/:anchorId — inspect a specific anchor batch
integrityRouter.get("/anchors/:anchorId", async (c) => {
    const anchorId = Number(c.req.param("anchorId"));
    if (!Number.isInteger(anchorId) || anchorId <= 0) {
        return c.json({ data: null, meta: null, error: "Invalid anchor ID" }, 400);
    }
    const anchors = await db
        .select()
        .from(blockchainAnchors)
        .where(eq(blockchainAnchors.id, anchorId))
        .limit(1);
    if (anchors.length === 0) {
        return c.json({ data: null, meta: null, error: "Anchor not found" }, 404);
    }
    const anchor = anchors[0];
    const proofRows = await db
        .select({
        id: anchorProofs.id,
        recordType: anchorProofs.recordType,
        recordId: anchorProofs.recordId,
        contentHash: anchorProofs.contentHash,
        leafIndex: anchorProofs.leafIndex,
    })
        .from(anchorProofs)
        .where(eq(anchorProofs.anchorId, anchorId));
    return c.json({
        data: {
            id: anchor.id,
            network: anchor.network,
            txId: anchor.txId,
            merkleRoot: anchor.merkleRoot,
            anchoredAt: anchor.anchoredAt,
            confirmedAt: anchor.confirmedAt,
            status: anchor.status,
            recordCount: anchor.recordCount,
            explorerUrl: buildExplorerUrl(anchor.network, anchor.txId),
            records: proofRows.sort((a, b) => a.leafIndex - b.leafIndex),
        },
        meta: { anchorId, recordCount: proofRows.length },
        error: null,
    });
});
// ─── Helpers ──────────────────────────────────────────────────────────────────
function buildExplorerUrl(network, txId) {
    if (!txId)
        return null;
    switch (network) {
        case "ethereum":
            return `https://etherscan.io/tx/${txId}`;
        case "bitcoin":
            return `https://blockstream.info/tx/${txId}`;
        case "opentimestamps":
            // OTS doesn't have a per-hash explorer; the proof file itself is the receipt
            return `https://opentimestamps.org`;
        default:
            return null;
    }
}
function buildVerificationInstructions(contentHash, merklePath, merkleRoot, network, txId) {
    const steps = [
        `1. Retrieve the record and compute its SHA-256 content hash.`,
        `   Expected: ${contentHash}`,
        ``,
        `2. Walk the Merkle path to reconstruct the Merkle root:`,
        ...merklePath.map((step, i) => `   Step ${i + 1}: combine current hash with ${step.position} sibling ${step.hash}`),
        `   Expected root: ${merkleRoot}`,
        ``,
    ];
    if (network === "simulated") {
        steps.push(`3. This anchor uses a SIMULATED network (PoC only). It is not externally verifiable.`, `   In production, switch ANCHOR_NETWORK=opentimestamps for BTC-backed proofs.`);
    }
    else if (network === "opentimestamps") {
        steps.push(`3. The Merkle root was submitted to the OpenTimestamps BTC calendar.`, txId
            ? `   Submission ID: ${txId}`
            : `   Submission is pending confirmation.`, `   To verify: use the opentimestamps-client CLI with the stored OTS proof file.`, `   See: https://opentimestamps.org`);
    }
    else if (network === "ethereum" && txId) {
        steps.push(`3. Look up transaction ${txId} on Ethereum.`, `   Verify the tx calldata contains the Merkle root: ${merkleRoot}`, `   Explorer: https://etherscan.io/tx/${txId}`);
    }
    else if (network === "bitcoin" && txId) {
        steps.push(`3. Look up transaction ${txId} on Bitcoin.`, `   Verify the OP_RETURN output contains the Merkle root: ${merkleRoot}`, `   Explorer: https://blockstream.info/tx/${txId}`);
    }
    return steps.join("\n");
}
//# sourceMappingURL=integrity.js.map