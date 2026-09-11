# Trees: A Complete Guide to the Data Structure, From First Principles to Production Systems

## Volume 2 — The Binary Tree Family

---

### Where we left off

Volume 1 ended with a specific, unresolved failure. We had derived the binary search tree from
binary search's own control flow, and shown that storing the edges as pointers rather than
recomputing them from indices buys us cheap structural change while keeping the halving behaviour
that makes search logarithmic. Then §3.6 pointed out the hole: **nothing in the definition of a
tree constrains its shape.** A tree of *n* nodes can have height anywhere from ⌈log₂(*n*+1)⌉ − 1
to *n* − 1, and which one you get depends entirely on the order the data arrived in.

And the input that produces the worst possible shape is sorted input — autoincrement primary
keys, timestamps, alphabetized names, a file you loaded from a sorted export. Not a pathological
case somebody constructed. The most ordinary input in existence.

Volume 2 is about fixing that, and the reason it takes a whole volume is that there are **four
fundamentally different philosophies** for how to fix it, they disagree with each other in
interesting ways, and the disagreement is exactly why your language's standard library made the
specific choice it made. By the end of this volume you should be able to look at
`std::map`, Java's `TreeMap`, the Linux scheduler, and a competitive programmer's hand-rolled
treap and explain why each one is the right answer to a *different* question.

Chapter numbering continues from Volume 1. The conventions from §3.4 still hold: **root at depth
0, leaf height 0, empty tree height −1.**

---

