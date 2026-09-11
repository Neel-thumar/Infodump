# Volume 4 is complete

**File: `volume-4-specialized-trees.md`** — ready.

## What Volume 5 will cover: CONCURRENCY, CRASH SAFETY, AND PRODUCTION ENGINEERING

Every structure in Volumes 1–4 was described as a single-threaded object whose writes always
complete. Volume 5 removes both assumptions, and the accumulated deferrals come due.

- **The general problem.** Multiple readers and writers on one shared tree. Derived from the failure
  cases: a whole-tree lock kills parallelism; fine-grained locks risk deadlock and inconsistent
  reads mid-split; and **every operation touches the root**, so any scheme that holds a lock there
  serializes the entire structure.
- **Lock coupling / crabbing** as the general technique, then the **Lehman & Yao** high-concurrency
  B-tree algorithm in full: **right-links**, the **high key**, and exactly how a reader recovers
  when it lands on a page that split underneath it mid-traversal — with the proof of why content
  moving only rightward is load-bearing, and why that single invariant is what forbids merging
  (Volume 3 §18.9), kills B\*-trees (§20.2), and makes backward scans asymmetric (§19.6).
- **Crash safety.** What corruption actually looks like when a split is interrupted mid-write — both
  the multi-page problem and the **torn page** problem, which are different and need different
  fixes. Write-ahead logging as the general solution, **full-page writes** as the answer to torn
  pages specifically, and a walk through one real implementation (PostgreSQL's `nbtree`).
- **Write amplification and maintenance.** Why trees only grow without cleanup; free space maps,
  page and node reuse, deferred deletion; and the derivation of the cost/benefit trade between doing
  cleanup **online** and doing it **offline** in a background vacuum or compaction process.
- **Lock-free and persistent (immutable) trees** — the functional-programming angle. **Structural
  sharing**, why immutable trees are a natural fit for concurrent and versioned systems, and the
  case studies: Clojure's HAMTs (Volume 4 §21.6's bitmap nodes, revisited), git's object DAG
  (Volume 4 §27.6), and database MVCC.

Say **continue** when you would like me to start Volume 5.
