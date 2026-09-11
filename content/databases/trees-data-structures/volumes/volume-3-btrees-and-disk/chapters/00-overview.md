# Trees: A Complete Guide to the Data Structure, From First Principles to Production Systems

## Volume 3 — Crossing the Memory Wall: B-Trees and Disk Structures

---

### Where we left off

Volume 2 solved a problem completely. Given an in-memory binary search tree, we now have four
independent ways to guarantee its height stays O(log *n*) regardless of insertion order, and we
can say precisely which one to use for which workload. That problem is closed.

Volume 2 §14.2 then named a fifth answer and refused to develop it:

> **5. Change the node so the tree cannot get tall. — B-trees, Volume 3**
> None of the above touches the *fanout*. All four accept "binary" and manage shape within that
> constraint.

And Volume 2 §7.1 gave three reasons why fanout is pointless in RAM, the sharpest of which was:
**fanout does not reduce the comparison count.** A *k*-ary node with *k*−1 keys requires you to
search within the node, and the arithmetic works out to log₂(*n*) total comparisons no matter what
*k* you choose. Fanout buys you nothing.

That statement is true, and it is about to become irrelevant, because it assumes the comparison is
the unit of cost. Volume 1 §1.2 warned that this assumption is wrong once data leaves RAM, and
Volume 1 §6.6 put a number on it — a pointer dereference costing 10⁵ times more than a cache hit —
and then deferred the consequences to here.

**Volume 3 is those consequences.** Chapter 15 establishes the cost model from measured hardware
behaviour rather than assertion. Everything else in the volume is derived from it. By the end you
should be able to look at any storage structure — B+-tree, LSM-tree, fractal tree — and reconstruct
its design from three facts about the device it runs on.

Chapter numbering continues from Volume 2. Conventions from Volume 1 §3.4 still hold: root at depth
0, leaf height 0, empty tree height −1.

---

