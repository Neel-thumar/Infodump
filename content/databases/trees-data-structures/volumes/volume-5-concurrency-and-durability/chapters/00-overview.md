# Trees: A Complete Guide to the Data Structure, From First Principles to Production Systems

## Volume 5 — Concurrency, Crash Safety, and Production Engineering

---

### The debts

Every structure in Volumes 1 through 4 was described as a single-threaded object whose writes always
complete. Both assumptions are false in every system any of this runs on, and the book has been
accumulating IOUs about it:

| Where | What was asserted and not justified |
|---|---|
| Volume 1 §3.2 | Deliberate structural sharing turns a tree into a DAG; "Volume 5 explains why that's powerful" |
| Volume 2 §11.5 | Red-black recolouring is safer for concurrent readers than rotation — asserted, not shown |
| Volume 2 §12.6 | Splay trees are unusable with concurrent readers |
| Volume 2 §13.7 | Skip lists are popular partly because randomization makes concurrency easier |
| Volume 3 §17.6 | Torn pages exist and need repairing — mentioned, never explained |
| Volume 3 §18.6 | Preemptive splitting exists for concurrency reasons |
| Volume 3 §18.9 | Real B-trees refuse to merge, because **content must only ever move rightward** |
| Volume 3 §19.6 | Backward scans need verify-and-retry; forward scans do not |
| Volume 3 §19.8 | The Linux maple tree replaced an rbtree partly for lock-free reads |
| Volume 3 §20.2 | B\*-trees died because redistribution is incompatible with the concurrency scheme |
| Volume 3 §20.3 | Full-page log images are counted in the write amplification budget, unexplained |
| Volume 4 §21.6 | HAMT bitmap nodes are "the foundation of immutable structural sharing" |
| Volume 4 §27.6 | Git's shared subtrees are the source of its efficiency |

**That rightward-movement claim has now been asserted five times across two volumes without proof.**
It gets one in §31.5, and then §31.6 discharges four of the rows above as corollaries of it, which
is the most satisfying thing in this volume: they are not four separate engineering decisions, they
are one theorem seen from four angles.

The volume's structure follows the three pressures that production imposes:

- **Chapters 30–31: concurrency.** What breaks when many threads touch one tree, and the algorithm
  that fixes it.
- **Chapter 32: durability.** What breaks when the power fails mid-write — two *different* problems
  that are usually conflated, needing two different fixes.
- **Chapter 33: maintenance.** Why trees only grow, and the cost/benefit of cleaning up now versus
  later.
- **Chapter 34: immutability.** The approach that solves concurrency and durability with one
  mechanism, and what it charges for that.
- **Chapter 35: how the three pressures conflict**, because they do, and the design space is choosing
  which one to under-serve.

Chapter numbering continues from Volume 4.

---

