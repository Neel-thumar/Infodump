# Volume 3 is complete

**File: `volume-3-btrees-and-disk.md`** — ready.

## What Volume 4 will cover: SPECIALIZED TREES, EACH SOLVING A PROBLEM PLAIN TREES CAN'T

Volumes 2 and 3 were both about the same problem — ordered lookup — solved for two different
devices. Volume 4 changes the problem. For each structure: what specifically a BST or B-tree
handles badly, the new invariant that fixes it, a worked example, and real production uses.

- **Tries** — string and prefix problems: autocomplete, IP routing, spell-check. Why comparison-based
  trees are the wrong tool when keys share structure, and how tries escape the log₂ *n*
  comparison lower bound (Volume 2 §3.5 flagged this) by looking at *pieces* of keys. Then
  compressed tries and radix trees as the space-optimized evolution.
- **Segment trees and Fenwick / binary indexed trees** — range query problems, both derived from the
  same motivating failure, and why the Fenwick tree is the space-optimized cousin.
- **Interval trees** — overlapping range problems: calendar conflicts, computational geometry. The
  first proper look at **augmented** trees, which Volume 2 §11.8 met in passing in the Linux
  scheduler.
- **Heaps** — priority-based rather than order-based access. Why the heap invariant is *deliberately*
  weaker than a BST's, and why that weakness is exactly the point (Volume 2 §7.2 and Volume 1 §6.3
  both left this promise outstanding).
- **KD-trees, quadtrees / octrees, R-trees** — spatial and multidimensional problems: maps,
  nearest-neighbour search, game-engine spatial partitioning. Why one-dimensional ordering fails
  the moment you have two dimensions.
- **Suffix trees and suffix arrays** — substring search at scale, genome sequencing.
- **Merkle trees** — the integrity and verification problem, derived from cryptographic hashing
  fundamentals, with git's object model and blockchain as worked examples.
- **Decision trees** — a genuinely different lineage from statistics and machine learning rather than
  classical computer science. Why they are structurally trees but philosophically something else,
  and a brief bridge into random forests and gradient boosting.

Say **continue** when you would like me to start Volume 4.
