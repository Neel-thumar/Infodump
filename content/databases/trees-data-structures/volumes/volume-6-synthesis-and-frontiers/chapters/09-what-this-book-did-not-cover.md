# What This Book Did Not Cover

Honest gaps, so you know the shape of what is missing.

| Not covered | Where to look instead |
|---|---|
| **Graph algorithms proper** — minimum spanning trees, shortest paths beyond the priority queue, network flow | CLRS; Volume 4 §24.6 only used the heap *inside* them |
| **Dominator trees** and other compiler-specific trees | any modern compiler text; §38.7 lists them without developing them |
| **Distributed consensus** — Raft, Paxos, and how a range split actually commits | only sketched in §39.1, and it deserves a book |
| **Concurrent hash tables** — the main non-tree competitor for everything in Volume 5 | Herlihy & Shavit |
| **Succinct and compressed structures in depth** | §39.5 and §40.9 sketch them; Navarro's *Compact Data Structures* |
| **Full proofs** — splay's access-lemma algebra, Ukkonen's construction, ARIES's correctness | the original papers, cited throughout |
| **Query optimization and cost models** — how a planner *decides* to use an index | any database internals text |
| **Formal verification technique itself** | §39.2 names the projects but teaches none of the method |
| **Weight-balanced (BB[α]), AA, WAVL and 2-3 trees proper** | Volume 2 named some in passing; the design space is larger than four philosophies, as §40.7 admits |
| **Trees in type theory and proof theory** — derivation trees, proof trees, tableaux | a different subject that happens to share the word |

---

