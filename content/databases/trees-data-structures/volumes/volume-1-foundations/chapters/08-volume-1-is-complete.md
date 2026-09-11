# Volume 1 is complete

**File: `volume-1-foundations.md`** — ready.

## What Volume 2 will cover: THE BINARY TREE FAMILY

Volume 2 picks up the first dangling thread — unconstrained shape — and follows it through every
serious answer anyone has proposed:

- **Binary trees, formally**: full, complete, perfect, balanced, degenerate, and why these five
  words are worth pinning down precisely rather than using loosely.
- **Binary search trees**: the ordering invariant stated exactly, and the derivation of why it
  gives Θ(log *n*) *when the shape cooperates*.
- **The balance catastrophe, performed step by step**: I will insert sorted data into a BST one
  value at a time and show the structure degrading into a linked list, then derive the Θ(*n*)
  worst case and connect it back to Chapter 5's stack overflow.
- **AVL trees (Adelson-Velsky and Landis, 1962)**: the historical context of Soviet computer
  science, the balance-factor invariant, all four rotation cases derived from first principles
  with worked examples, and why *strict* balance makes writes expensive.
- **Red-black trees**: why AVL was not enough for write-heavy workloads, the five invariants and
  where each comes from, worked insertion and deletion, and why this became the default almost
  everywhere — with an actual walk through one real code path (the Linux CFS scheduler's
  `rb_insert_color`, or `std::map`, or Java's `TreeMap`).
- **Splay trees**: the self-adjusting philosophy, amortized analysis, why "recently accessed moves
  to the root" is powerful for skewed access patterns, and where that actually pays off.
- **Treaps**: probabilistic balance via random priorities, why randomization defeats adversarial
  input without needing rebalancing logic, and where they are used in practice.
- **Closing comparison table**: every tree in the volume across insert/search/delete complexity,
  memory overhead, rotation cost, and best-fit use case.

Say **continue** when you would like me to start Volume 2.
