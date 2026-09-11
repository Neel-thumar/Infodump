# Chapter 27 — Merkle Trees: Verification Instead of Retrieval

## 27.1 A completely different question

Every structure in the previous 26 chapters answered a variant of **"where is X?"** — by key, by
range, by prefix, by overlap, by proximity, by priority. This one answers:

> **"Has X been tampered with — and can you *prove* the answer cheaply, to someone who trusts
> nothing?"**

The setting: you have *n* data blocks. They are stored somewhere you do not control — a peer, a
cloud provider, an untrusted mirror, a disk that might be silently corrupting. You want to verify
that a block you receive is the block that was originally committed.

## 27.2 The two obvious approaches, and a familiar impossibility

**Approach A — store a hash per block.** Keep *H*(*b*ᵢ) for each block. Verifying block *i* is O(1):
hash it and compare.

The problem: *you must store and trust all n hashes.* A verifier — a phone, a light client, a boot
loader — now needs O(*n*) trusted storage, and you have not eliminated the trust problem, only moved
it from *n* blocks to *n* hashes.

**Approach B — store one hash of everything.** *H*(*b*₁ ∥ *b*₂ ∥ … ∥ *b*ₙ). One hash. Beautiful.

The problem: to verify **any single block** you must download and hash **all** the data. O(*n*) per
verification. For a 1 TB dataset, verifying one 4 KB block costs 1 TB of transfer.

| | Verifier storage | Cost to verify one block |
|---|---|---|
| A: *n* hashes | **O(*n*)** | O(1) |
| B: one hash | O(1) | **O(*n*)** |

**That is Volume 1 §1.7 for the third time in this volume.** Chapter 22 hit it as
"per-element values versus global prefix sums"; here it is "per-element hashes versus one global
hash". The diagnosis Volume 1 gave is exactly right again:

> *Per-element information is cheap to update and expensive to trust as a whole. Global information
> is cheap to trust and expensive to update or verify in part.*

And the fix is the one that has worked every time: **a hierarchy of aggregates.** Only now the
aggregate is a cryptographic hash.

## 27.3 The cryptographic prerequisite, briefly

A hash function *H* maps arbitrary-length input to a fixed-length digest (256 bits for SHA-256).
Three properties are usually named; **for Merkle trees, exactly one is load-bearing**:

| Property | Statement | Needed here? |
|---|---|---|
| Preimage resistance | given *H*(*x*), hard to find *x* | not directly |
| Second-preimage resistance | given *x*, hard to find *y* ≠ *x* with *H*(*y*) = *H*(*x*) | yes |
| **Collision resistance** | hard to find **any** *x* ≠ *y* with *H*(*x*) = *H*(*y*) | **this is the one** |

The reason collision resistance is the critical property is that the entire security argument is a
reduction to it:

> If an attacker can produce a valid Merkle proof for data that was not committed, then somewhere
> along the proof path two different inputs produced the same hash — **so a proof forgery *is* a
> collision.** Break the tree and you have broken the hash function.

This is why SHA-1's practical collision (the **SHAttered** attack, 2017) mattered so much to systems
built on Merkle trees, and why git has been migrating to SHA-256. *(Confidence: high.)*

## 27.4 The structure and the proof

> **Merkle tree.** Leaves are the hashes of the data blocks: *H*(*b*ᵢ). Every internal node is the
> hash of the concatenation of its children's hashes. The root is the **Merkle root** — a single
> digest committing to all *n* blocks.

```
                        ROOT = H( H_AB ‖ H_CD )
                       /                        \
        H_AB = H(H_A ‖ H_B)              H_CD = H(H_C ‖ H_D)
          /            \                    /            \
     H_A = H(A)    H_B = H(B)          H_C = H(C)    H_D = H(D)
         │              │                  │              │
      block A       block B            block C       block D
```

### The audit path

To prove that **block C** is committed under a root you already trust, the prover sends C plus the
**siblings along C's path**:

```
  PROOF for block C  =  [ H_D , H_AB ]        ← just two hashes

  Verifier's computation:
      H_C'   = H(C)                     ← hashes the block it received
      H_CD'  = H( H_C' ‖ H_D )          ← combines with the given sibling
      ROOT'  = H( H_AB ‖ H_CD' )        ← combines with the given uncle
      CHECK: ROOT' == ROOT ?            ← the one trusted value it holds
```

If it matches, C is authentic — and the verifier stored **one hash** and received **log₂ *n***.

```
  Proof size, SHA-256 (32 bytes per hash):

     n = 4              2 hashes  =     64 bytes
     n = 1,000         10 hashes  =    320 bytes
     n = 1,000,000     20 hashes  =    640 bytes
     n = 1,000,000,000 30 hashes  =    960 bytes

  INDEPENDENT of how large the blocks are.
```

| | Verifier storage | Verify one block | Proof size |
|---|---|---|---|
| A: *n* hashes | O(*n*) | O(1) | — (no trust anchor) |
| B: one hash of all | O(1) | **O(*n*)** | must send everything |
| **Merkle tree** | **O(1)** — just the root | **O(log *n*)** | **O(log *n*)** hashes |

### The second operation: finding *where* two datasets differ

This one is less often taught and is at least as useful. Given two Merkle trees over the same index
space:

```
  compare(node_ours, node_theirs):
      if hash(ours) == hash(theirs):  return  "identical — STOP"    ← prunes a whole subtree
      if leaf:                        return  "this block differs"
      recurse into both children

  Cost: O(k log n) to locate k differing blocks — NOT O(n).
  If nothing differs, the cost is ONE hash comparison.
```

**That is §23.2's augmentation-as-pruning, with a hash as the summary.** A matching hash proves an
entire subtree is identical, so it can be discarded without inspection. This is the operation behind
`rsync`, and behind replica repair in distributed databases (§27.6).

## 27.5 Two security subtleties, because most treatments skip them

The structure above is *almost* right, and the gap between "almost" and "right" has produced real
vulnerabilities.

### Domain separation: leaves and internal nodes must be hashed differently

If leaves and internal nodes are hashed the same way, an attacker can present an **internal node's
hash as if it were a leaf's**, claiming that the concatenation *H_A* ∥ *H_B* is itself a data block.
This is a second-preimage attack on the tree structure rather than on the hash.

The fix is **domain separation** — prefix a distinguishing byte:

```
   leaf hash     :  H( 0x00 ‖ data )
   internal hash :  H( 0x01 ‖ left ‖ right )
```

**RFC 6962** (Certificate Transparency) specifies exactly this. *(Confidence: high — this is a
well-documented requirement.)*

### Unbalanced trees and duplicated hashes

When a level has an odd number of nodes, something must be done with the odd one out. Bitcoin
**duplicates the last hash** and pairs it with itself. This turned out to allow two *different*
transaction lists to produce the *same* Merkle root, which is a consensus-splitting bug —
**CVE-2012-2459**. *(Confidence: moderate-high on the CVE and the mechanism.)*

> **The general lesson, and it is not a cryptography lesson:** the tree's structure is part of what
> is being committed to, and any ambiguity about *which tree produced this root* is a
> vulnerability. "Two different inputs can produce the same structure" is a collision even if the
> hash function is perfect. Every production spec therefore pins down padding, ordering,
> concatenation, and domain separation precisely — the parts a textbook diagram leaves implicit.

## 27.6 History and applications

> **Confidence: high.** Ralph C. Merkle, Stanford PhD thesis, 1979; US Patent 4,309,569, "Method of
> providing digital signatures", filed 1979, granted 1982.

The original motivation is worth knowing because it is not "verify a file". Merkle was making
**one-time signatures practical**. A one-time signature scheme lets you sign a single message per
key pair — useless alone, since you would need to publish thousands of public keys. Merkle's
insight: **hash all those public keys into a tree and publish only the root.** Then each signature
carries a log *n*-sized proof that its one-time key was among those committed.

Merkle also co-invented public-key cryptography (the Diffie–Hellman–Merkle key exchange) and Merkle's
Puzzles. He has an unusually high hit rate.

### Git — the object model *is* a Merkle DAG

```
  blob    = H( "blob"   ‖ size ‖ file contents )
  tree    = H( "tree"   ‖ size ‖ list of (mode, name, hash) entries )
  commit  = H( "commit" ‖ size ‖ tree hash ‖ parent hashes ‖ author ‖ message )
```

A commit hash therefore commits to the root tree, which commits to every subdirectory tree, which
commits to every blob — **and** to all parent commits, recursively. One 40-character hash commits to
the entire repository state and its whole history. Consequences you use daily:

- **Content-addressable storage.** Identical files anywhere in history are stored once, because
  they hash the same.
- **Fast status and diff.** If a directory's tree hash is unchanged, nothing inside it changed —
  §27.4's pruning. This is why `git status` on a huge repo does not read every file.
- **History is immutable.** Changing an old commit changes its hash, which changes every descendant
  commit's hash. This is not a policy; it is arithmetic. It is also exactly why `rebase` produces
  *new* commits rather than editing old ones.
- **`git fsck`** verifies the whole object graph by recomputing hashes.

> **And note: it is a DAG, not a tree.** Volume 1 §3.2 drew this distinction and warned that a DAG
> loses unique paths, needs visited-set tracking, and needs sharing-aware memory management. Git
> hits all three — unchanged subtrees are *shared* between commits (which is the source of its space
> efficiency), merge commits have multiple parents, and every graph walk in git carries a seen-set.
> Volume 1 §3.2 also promised that Volume 5 would revisit deliberate sharing; git is the case study.

### Blockchain

A Bitcoin block header contains the Merkle root of that block's transactions. That enables **SPV
(simplified payment verification)**: a light client stores only the 80-byte block headers — about
50 MB for the entire chain history — and can verify that a specific transaction is in a specific
block with a ~320-byte proof, without downloading the block. Volume-of-data reduction of many orders
of magnitude, purely from §27.4.

**Ethereum** goes further with the **Merkle Patricia Trie**: a radix tree (Chapter 21!) in which
every node's identity is the hash of its contents. So it is simultaneously a key-value index *and*
an authenticated structure — you can prove "account X has balance Y" with a log-sized proof. Two
chapters of this volume composed into one structure.

### Certificate Transparency

**RFC 6962.** An append-only Merkle tree of every TLS certificate a CA has issued. It supports two
proof types, and the second is the clever one:

- **Inclusion proof** — this certificate is in the log (§27.4).
- **Consistency proof** — the new tree of size *n*′ is an **extension** of the old tree of size *n*:
  nothing was removed, reordered, or altered. This is what makes the log *append-only* in a way
  anyone can check, and it is why a CA cannot quietly retract a mis-issued certificate.

### Distributed databases — anti-entropy

Cassandra, DynamoDB and Riak all use Merkle trees to reconcile replicas. Two replicas exchange
roots; if equal, they are in sync at **O(1) cost**; if not, they recurse to find the differing key
ranges and repair only those. **O(*k* log *n*) instead of O(*n*)** — §27.4's difference-finding
operation, at datacentre scale.

### Filesystems and verified boot

- **ZFS** stores each block's checksum **in the block pointer that references it**, so the whole
  filesystem is a Merkle tree rooted at the uberblock. This enables **self-healing**: a read that
  fails its checksum is detected and repaired from a mirror or from parity. Silent corruption
  becomes detectable rather than merely likely.
- **Btrfs** does the same.
- **dm-verity** (Android, ChromeOS): a Merkle tree over the read-only system partition, with the
  root hash signed and embedded in the boot chain. **Every block read is verified against the tree
  on the fly.** That is verified boot, and it is a Merkle tree in the storage hot path.

### Content addressing and transfer

**IPFS** — a content identifier is a hash, the object graph is a Merkle DAG, so deduplication and
verification come free. **BitTorrent v2** uses per-file Merkle trees (v1 used a flat list of piece
hashes, which required downloading the whole `.torrent` metadata upfront). **rsync** and `zsync` use
hierarchical checksums to transfer only differences.

### Post-quantum signatures — a 1979 structure comes back

Hash-based signature schemes — **XMSS** (RFC 8391) and **SPHINCS+** — are Merkle trees over one-time
keys, i.e. Merkle's original 1979 construction, modernized. Their security rests **only** on hash
function properties, with no number-theoretic assumptions, which makes them believed
quantum-resistant. SPHINCS+ was selected in NIST's post-quantum standardization process.
*(Confidence: moderate-high on the selection.)*

> A structure invented in 1979 to make one-time signatures practical is now a leading candidate for
> signatures that survive quantum computers — for exactly the reason it was invented: it needs
> nothing but a hash function.

## 27.7 The general idea: authenticated data structures

A Merkle tree is the canonical member of a family. The recipe generalizes:

> **Make each node's identity be the hash of its contents, *including its children's identities*.**

Apply it to anything:

| Base structure | Authenticated version | Used by |
|---|---|---|
| Binary tree over blocks | **Merkle tree** | git, Bitcoin, ZFS, CT |
| Radix tree (Ch 21) | **Merkle Patricia Trie** | Ethereum state |
| B-tree (Vol 3) | Merkle B-tree | authenticated databases |
| Skip list | authenticated skip list | early certificate revocation designs |
| Any DAG | **Merkle DAG** | git, IPFS |

And notice what the hash is, in §23.2's terms: **a summary of the subtree, composable in O(1) from
the children's summaries** — condition (a) exactly — **which lets you discard the subtree without
looking inside it** if it matches — condition (b) exactly.

> **A Merkle tree is an augmented tree whose augmentation is a hash.** That is all it is. The
> cryptography supplies the guarantee that the summary cannot be forged; the tree supplies the
> logarithmic proof size. Chapter 29 makes the general point, but this is the cleanest instance of
> it, because the "aggregate" is doing something that looks nothing like aggregation.

---

