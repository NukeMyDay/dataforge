// Unit tests for the Merkle tree implementation used in blockchain anchoring.
// Run with: npx tsx tests/merkle.test.ts

import { buildMerkleTree, verifyMerkleProof, computeContentHash } from "../api/src/merkle.js";
import assert from "assert";

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

console.log("Merkle tree tests\n");

test("single leaf tree has correct root", () => {
  const hash = computeContentHash('{"id":1,"title":"Test"}');
  const tree = buildMerkleTree([hash]);
  // Single leaf: root = hash of (leaf || leaf) because we pad to even
  assert.ok(tree.root.length === 64, "root should be 64 hex chars");
  assert.strictEqual(tree.leaves.length, 2, "single leaf padded to 2");
  assert.strictEqual(tree.proofs.length, 2, "proof for each leaf");
});

test("two-leaf tree: both proofs verify", () => {
  const h1 = computeContentHash('{"id":1}');
  const h2 = computeContentHash('{"id":2}');
  const tree = buildMerkleTree([h1, h2]);

  assert.ok(verifyMerkleProof(h1, tree.proofs[0]!, tree.root), "leaf 0 proof valid");
  assert.ok(verifyMerkleProof(h2, tree.proofs[1]!, tree.root), "leaf 1 proof valid");
});

test("four-leaf tree: all proofs verify", () => {
  const leaves = [1, 2, 3, 4].map((i) => computeContentHash(`{"id":${i}}`));
  const tree = buildMerkleTree(leaves);

  for (let i = 0; i < leaves.length; i++) {
    assert.ok(
      verifyMerkleProof(leaves[i]!, tree.proofs[i]!, tree.root),
      `leaf ${i} proof valid`,
    );
  }
});

test("odd-leaf tree (3 leaves): all original proofs verify", () => {
  const leaves = [1, 2, 3].map((i) => computeContentHash(`{"id":${i}}`));
  const tree = buildMerkleTree(leaves);

  for (let i = 0; i < leaves.length; i++) {
    assert.ok(
      verifyMerkleProof(leaves[i]!, tree.proofs[i]!, tree.root),
      `leaf ${i} proof valid`,
    );
  }
});

test("wrong hash does not verify", () => {
  const h1 = computeContentHash('{"id":1}');
  const h2 = computeContentHash('{"id":2}');
  const tree = buildMerkleTree([h1, h2]);
  const wrongHash = computeContentHash('{"id":999}');

  assert.ok(!verifyMerkleProof(wrongHash, tree.proofs[0]!, tree.root), "wrong hash should fail");
});

test("tampered proof step does not verify", () => {
  const h1 = computeContentHash('{"id":1}');
  const h2 = computeContentHash('{"id":2}');
  const tree = buildMerkleTree([h1, h2]);

  const tamperedProof = [{ hash: "0".repeat(64), position: "right" as const }];
  assert.ok(!verifyMerkleProof(h1, tamperedProof, tree.root), "tampered proof should fail");
});

test("large batch (100 records): all proofs verify", () => {
  const leaves = Array.from({ length: 100 }, (_, i) =>
    computeContentHash(JSON.stringify({ id: i, data: `record-${i}` })),
  );
  const tree = buildMerkleTree(leaves);

  for (let i = 0; i < leaves.length; i++) {
    assert.ok(verifyMerkleProof(leaves[i]!, tree.proofs[i]!, tree.root), `leaf ${i} valid`);
  }
  console.log(`    (100-record batch, root: ${tree.root.slice(0, 16)}...)`);
});

console.log("\nDone.");
