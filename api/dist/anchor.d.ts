export type AnchorNetwork = "simulated" | "opentimestamps" | "ethereum" | "bitcoin";
export interface RecordToAnchor {
    recordId: string;
    recordType: string;
    contentJson: string;
}
export interface AnchorResult {
    anchorId: number;
    network: AnchorNetwork;
    merkleRoot: string;
    txId: string | null;
    status: "pending" | "confirmed";
    recordCount: number;
}
/**
 * Anchor a batch of records on the configured network.
 *
 * Steps:
 *   1. Compute content hash per record
 *   2. Build Merkle tree over the hashes
 *   3. Submit Merkle root to the selected network
 *   4. Persist anchor + proofs to DB
 */
export declare function batchAnchor(records: RecordToAnchor[], network?: AnchorNetwork): Promise<AnchorResult>;
/**
 * Fetch all anchor proofs for a given record, ordered newest first.
 */
export declare function getRecordProofs(recordType: string, recordId: string): Promise<{
    proofId: number;
    leafIndex: number;
    contentHash: string;
    merklePath: unknown;
    createdAt: Date;
    anchorId: number;
    network: string;
    txId: string | null;
    merkleRoot: string;
    anchoredAt: Date;
    confirmedAt: Date | null;
    anchorStatus: string;
    recordCount: number;
}[]>;
//# sourceMappingURL=anchor.d.ts.map