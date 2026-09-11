# Trees: A Complete Guide to the Data Structure, From First Principles to Production Systems

## Volume 4 — Specialized Trees, Each Solving a Problem Plain Trees Can't

---

### Where we left off, and what changes now

Volumes 2 and 3 were the same volume twice. Both asked *"how do I find key k among n keys?"* and
both answered *"a balanced ordered tree"* — differing only in which device the tree lived on, and
therefore in the fanout. Volume 2 solved it for RAM with four flavours of balance; Volume 3 solved
it for disk by turning the fanout dial to 500 and discovering that balance then took care of itself.

**Volume 4 changes the question.** Every structure here exists because a BST or B-tree answers the
wrong question, or answers the right question badly. Some of the problems are not lookup problems
at all.

Volume 1 §2.6 made a promise about this:

> *"About half the structures in this book are trees because a tree is fast; the other half are
> trees because the problem was a tree all along and someone finally noticed. Volume 4 is largely
> the second kind."*

The format for each chapter is the one the whole book uses, applied tightly: **the specific thing a
BST or B-tree handles badly, the new invariant that fixes it, a worked example performed rather
than described, and where it actually runs in production.**

There is also a single idea running underneath all nine chapters, and I am going to name it now
rather than save it for the synthesis, because it makes everything easier to follow:

> **Every structure in this volume stores, at each node, a *summary of that node's subtree* —
> chosen so that the summary can be computed in O(1) from the children's summaries, and so that
> reading it lets you either answer the query directly or discard a whole subtree without looking
> inside it.**
>
> A search tree's summary is "the range of keys below me". A segment tree's is a sum. An interval
> tree's is a maximum endpoint. A Merkle tree's is a hash. An R-tree's is a bounding box. A
> decision tree's is a prediction. **Volumes 1–3 were the special case.** Chapter 29 makes this
> precise and shows why the O(1)-from-children condition is exactly what makes augmentation
> compatible with rebalancing.

Chapter numbering continues from Volume 3. Conventions from Volume 1 §3.4 hold throughout.

---

