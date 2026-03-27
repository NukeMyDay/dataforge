export interface MerkleProofStep {
    hash: string;
    position: "left" | "right";
}
export interface MerkleTree {
    root: string;
    leaves: string[];
    proofs: MerkleProofStep[][];
}
/**
 * Build a complete binary Merkle tree from an array of leaf hashes.
 * Leaf hashes should already be SHA-256 hex strings (64 chars).
 */
export declare function buildMerkleTree(leafHashes: string[]): MerkleTree;
/**
 * Verify that a leaf hash is included in a Merkle root via the given proof path.
 * Returns true if the proof is valid.
 */
export declare function verifyMerkleProof(leafHash: string, proof: MerkleProofStep[], expectedRoot: string): boolean;
/**
 * Compute the canonical SHA-256 content hash for a record.
 * Input should be a deterministic JSON-serialised representation of the record.
 */
export declare function computeContentHash(canonicalJson: string): string;
//# sourceMappingURL=merkle.d.ts.map