// Merkle tree implementation for batch content-hash anchoring.
//
// Uses SHA-256 (via Node.js crypto) for all hashing. The tree is built
// bottom-up from leaf nodes. If the leaf count is odd, the last leaf is
// duplicated so every level is even.
//
// Proof format: [{hash: string, position: "left"|"right"}, ...]
// Verification: start with the leaf hash, combine with each sibling in order.
//   "right" sibling → current = SHA256(current || sibling)
//   "left"  sibling → current = SHA256(sibling || current)
// Final hash must equal the Merkle root.
import { createHash } from "crypto";
/** Double-SHA-256 is Bitcoin convention; we use single SHA-256 for simplicity. */
function sha256(a, b) {
    return createHash("sha256")
        .update(Buffer.from(a + b, "hex"))
        .digest("hex");
}
/**
 * Build a complete binary Merkle tree from an array of leaf hashes.
 * Leaf hashes should already be SHA-256 hex strings (64 chars).
 */
export function buildMerkleTree(leafHashes) {
    if (leafHashes.length === 0) {
        throw new Error("Cannot build Merkle tree from empty leaf set");
    }
    // Pad to even length by duplicating the last leaf
    const leaves = leafHashes.length % 2 === 0
        ? [...leafHashes]
        : [...leafHashes, leafHashes[leafHashes.length - 1]];
    // levels[0] = leaves, levels[k] = nodes at height k
    const levels = [leaves];
    while (levels[levels.length - 1].length > 1) {
        const prev = levels[levels.length - 1];
        const next = [];
        for (let i = 0; i < prev.length; i += 2) {
            next.push(sha256(prev[i], prev[i + 1]));
        }
        levels.push(next);
    }
    const root = levels[levels.length - 1][0];
    // Build proofs for each original leaf (not the padding duplicate)
    const proofs = [];
    for (let i = 0; i < leaves.length; i++) {
        const proof = [];
        let idx = i;
        for (let level = 0; level < levels.length - 1; level++) {
            const nodes = levels[level];
            const siblingIdx = idx % 2 === 0 ? idx + 1 : idx - 1;
            const sibling = nodes[siblingIdx];
            proof.push({
                hash: sibling,
                position: idx % 2 === 0 ? "right" : "left",
            });
            idx = Math.floor(idx / 2);
        }
        proofs.push(proof);
    }
    return { root, leaves, proofs };
}
/**
 * Verify that a leaf hash is included in a Merkle root via the given proof path.
 * Returns true if the proof is valid.
 */
export function verifyMerkleProof(leafHash, proof, expectedRoot) {
    let current = leafHash;
    for (const step of proof) {
        if (step.position === "right") {
            current = sha256(current, step.hash);
        }
        else {
            current = sha256(step.hash, current);
        }
    }
    return current === expectedRoot;
}
/**
 * Compute the canonical SHA-256 content hash for a record.
 * Input should be a deterministic JSON-serialised representation of the record.
 */
export function computeContentHash(canonicalJson) {
    return createHash("sha256").update(canonicalJson, "utf8").digest("hex");
}
//# sourceMappingURL=merkle.js.map