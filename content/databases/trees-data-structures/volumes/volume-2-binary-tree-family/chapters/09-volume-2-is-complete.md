# Volume 2 is complete

**File: `volume-2-binary-tree-family.md`** — ready.

## What Volume 3 will cover: CROSSING THE MEMORY WALL — B-TREES AND DISK STRUCTURES

Volume 2 solved the shape problem within the binary constraint. Volume 3 removes the constraint,
because the environment changes and makes it untenable. Volume 1 §6.6 previewed the numbers; now
we take them seriously.

- **The actual physics.** Real latency figures for L1, L2, L3, RAM, NVMe, SATA SSD, spinning disk
  and network storage — then the derivation of why **minimizing access count beats minimizing
  comparison count** once you cross into disk-latency territory, and why every structure in
  Volume 2 becomes the wrong answer at that point.
- **The history.** Rudolf Bayer and Edward McCreight at Boeing Research Labs, the original problem
  (maintaining large indexed sequential files), and the 1972 paper. Bayer will be a familiar name
  by then — §11.1.
- **B-tree formal mechanics.** Order and degree (and untangling the terminology hazard flagged in
  Volume 1 §3.4), minimum and maximum keys per node, the invariant that keeps all leaves at equal
  depth, the height formula derived, and the arithmetic showing how brutally high fanout crushes
  tree height at millions and billions of keys.
- **Search, insert, delete** — with the split derived from first principles: why the median, why
  splits cascade upward, and the root-split case that is the only thing that makes the tree
  taller. Then deletion's borrow-from-sibling and merge cases, each derived from the invariant
  that would break without it.
- **B+-trees.** Why plain B-trees are insufficient for range queries and sequential scans, the
  refinement of pushing all records to the leaves and linking them, and why this became the
  near-universal choice for databases and filesystems.
- **Variants and their niches.** B\*-trees (higher fill factor via 2-to-3 splits), Bε-trees
  (write-optimized, buffered messages — TokuDB, BetrFS), and **LSM-trees** as a sibling lineage
  solving the same problem in the opposite direction: why write-heavy workloads favour append-only
  log-structured merges over in-place B-tree updates, with Cassandra, RocksDB and LevelDB as the
  worked examples. Volume 1 §1.4 already hinted at this when it noted that the way to make a
  sorted array work is to stop inserting into it.

Say **continue** when you would like me to start Volume 3.
