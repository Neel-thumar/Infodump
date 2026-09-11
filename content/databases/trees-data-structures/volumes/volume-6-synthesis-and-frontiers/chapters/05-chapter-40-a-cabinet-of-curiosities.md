# Chapter 40 — A Cabinet of Curiosities

Nine structures that this book had no room for, offered briefly, because they are beautiful and
because knowing they exist is worth more than knowing them well. This is an invitation, not a
syllabus.

## 40.1 van Emde Boas trees — beating log *n* for integers

> **Confidence: moderate-high.** Peter van Emde Boas, mid-1970s.

**The question:** predecessor and successor queries on integers drawn from a universe of size *u*. A
balanced BST gives O(log *n*). Can you do better?

**Yes: O(log log *u*).** For *u* = 2³², that is log₂ 32 = **five steps to find the predecessor among
four billion possible keys.**

**The trick is recursive √-decomposition.** A vEB structure over universe *u* contains √*u*
**clusters**, each a vEB over universe √*u*, plus a **summary** vEB over √*u* recording which
clusters are non-empty:

```
    vEB(u)  =  √u clusters, each vEB(√u)
               + 1 summary vEB(√u), marking which clusters are non-empty
               + cached min and max

    A predecessor query recurses into EITHER the summary OR one cluster —
    never both.  So:

        T(u) = T(√u) + O(1)

    Substituting u = 2^m:   S(m) = S(m/2) + O(1) = O(log m) = O(log log u)   ∎
```

**The catch: O(*u*) space** in the naive version — 4 billion slots for *u* = 2³², whether you store
five keys or five billion. Fixed by **y-fast tries** (Willard, 1983), which bucket the *n* present
elements into ~*n*/log *u* groups and put an *x*-fast trie over the group representatives:
**O(*n*) space, O(log log *u*) query.**

And note *why* it beats the comparison bound: it does not compare keys, it **indexes on their bits** —
Volume 4 §29.3's third lesson, for the third time. The line of work continues in §40.6.

## 40.2 Finger trees — one structure, any monoid

> **Confidence: high.** Ralf Hinze and Ross Paterson, "Finger trees: a simple general-purpose data
> structure", *Journal of Functional Programming*, 2006.

**The question:** a purely functional sequence with O(1) amortized access at *both* ends, O(log *n*)
concatenation and splitting, and O(log min(*i*, *n*−*i*)) indexing.

**The structure is a 2-3 tree turned inside out.** The spine runs down the middle, with small groups
("digits") of one to four elements hanging off each side, so **the two ends are at depth 1 and the
middle is at depth O(log *n*)**:

```
        digit                                              digit
      ┌───────┐                                        ┌───────┐
      │ a b   │──────────── spine ────────────────────│  y z  │
      └───────┘   │            │            │          └───────┘
                  ▼            ▼            ▼
               (deeper: a finger tree of 2-3 NODES of elements,
                so the element type grows as you descend)
```

**And here is why it belongs in this chapter.** A finger tree is **generic over a monoid
annotation** — each node caches the monoid product of its subtree. Which means:

| Annotate with | You get |
|---|---|
| **size** | a random-access sequence (Haskell's `Data.Sequence`) |
| **maximum priority** | a priority queue |
| **(size, priority)** | a priority search queue |
| **min and max** | an interval map |
| any monoid | whatever that monoid measures |

> **That is Volume 4 §29's recipe — "store a composable summary of the subtree at each node" — turned
> into a *type parameter*.** Volume 4 argued that segment trees, interval trees, Merkle trees and
> R-trees are one idea with different summaries. A finger tree is that argument made executable: one
> implementation, and you supply the monoid.

## 40.3 Zippers — and a genuinely surprising piece of mathematics

> **Confidence: high on Huet; moderate-high on the derivative result.** Gérard Huet, "The Zipper",
> *JFP*, 1997.

**The question:** in an *immutable* tree (Volume 5 §34), how do you navigate to a point and edit
there efficiently, without walking from the root each time?

**The zipper.** Represent "a position in a tree" as a pair: **the subtree at the focus**, and **the
context** — everything else, turned inside out, as a path from the hole back to the root with the
sibling subtrees attached.

```
     TREE with a focus                ZIPPER = (focus, context)

            a                          focus  =  the subtree at d
          /   \                        context = [ went-left from b, sibling e
         b     c                                   went-left from a, sibling c ]
        / \                            
       d   e        ← focus at d       Move up/down/left/right: O(1)
      / \                              Edit at the focus:       O(1)
     f   g                             Rebuild the whole tree:  O(depth)
```

Used in functional editors, XML and tree manipulation (`clojure.zip`), cursor implementations, and
as the conceptual ancestor of lens libraries. Note that a zipper is what a **parent pointer** gives a
mutable tree for free — which is exactly why immutable structures need it explicitly (Volume 5 §34
forbids parent pointers, since they would make structural sharing impossible).

**And now the beautiful part.** Conor McBride observed that **the type of one-hole contexts for a
data type is its formal derivative.**

Check it on the simplest case. A list of *x*'s satisfies *L*(*x*) = 1 + *x*·*L*(*x*), so
*L* = 1/(1 − *x*). Differentiate:

$$
L'(x) = \frac{1}{(1-x)^2} = L(x)^2
$$

**And a one-hole context in a list is exactly a *pair* of lists** — the part before the hole and the
part after. *L*′ = *L*². It works.

Do the same for a binary tree and the derivative computes the zipper's context type: a *list* of
steps, each recording a direction, the node's value, and the sibling subtree — which is precisely
what the diagram above shows.

> **Differentiation, in the calculus sense, applied to data types, produces cursors.** It is one of
> the more startling correspondences in computer science, and it is the sort of thing that makes the
> subject worth staying in.

## 40.4 Tango trees — the frontier of the oldest question

> **Confidence: moderate-high.** Erik Demaine, Dion Harmon, John Iacono and Mihai Pătraşcu,
> "Dynamic optimality — almost", FOCS 2004.

**The question is Volume 2 §12.5's**, still open: is any online BST algorithm within a constant
factor of the offline optimum? Tango trees give the first non-trivial bound:
**O(log log *n*)-competitive.**

**The mechanism, and it is clever:**

```
  1. Fix a static balanced REFERENCE TREE over the keys.  Depth log n.

  2. Decompose it into PREFERRED PATHS: each node's preferred child is the one
     whose subtree was accessed more recently.  A preferred path is a
     root-to-leaf-ish chain of at most log n nodes.

  3. Store each preferred path as an AUXILIARY balanced BST.
     A path has ≤ log n nodes, so its auxiliary tree has depth O(log log n).

  4. An access traverses k preferred paths, each at cost O(log log n).

  5. And k is bounded by WILBER'S INTERLEAVE LOWER BOUND — which is itself
     a lower bound on ANY BST algorithm's cost.

     Therefore:  cost = O(k · log log n) = O(OPT · log log n)   ∎
```

The move in step 5 is the elegant one: rather than proving your algorithm fast, prove that the *only*
thing it does a lot of is something **every** algorithm must do a lot of.

> Note that **preferred-path decomposition appears in two entries of this cabinet** — here, and in
> §40.5's link-cut trees from 1983. Twenty-one years apart, for completely different purposes, from
> overlapping groups of people.

## 40.5 Link-cut trees — why splay trees mattered

> **Confidence: high.** Daniel Sleator and Robert Tarjan, "A data structure for dynamic trees",
> *JCSS*, 1983.

**The question:** maintain a **forest** under `link(u,v)` and `cut(v)`, and answer path queries
(`findroot`, aggregate along the path to the root) — all in O(log *n*) amortized.

**The mechanism:** decompose each tree into preferred paths (as in §40.4) and store each path as a
**splay tree**. Splaying's amortized guarantee (Volume 2 §12.4) is exactly what makes the whole
structure O(log *n*) amortized.

**And this is the answer to a question Volume 2 raised and left hanging.** Volume 2 §12.7 noted splay
trees are "theoretically gorgeous, practically niche" and mentioned link-cut trees in passing. This
is the payoff: **splay trees' most important application is not as a map, but as a component of a
more powerful structure.** Link-cut trees appear inside maximum-flow algorithms, dynamic
connectivity, and dynamic minimum spanning trees — problems no simple structure solves.

## 40.6 Fusion trees — cheating with arithmetic

> **Confidence: moderate-high.** Michael Fredman and Dan Willard, "Surpassing the information
> theoretic bound with fusion trees", *JCSS*, 1993.

**O(log *n* / log log *w*) predecessor search**, where *w* is the machine word size — beating the
comparison bound, for a third time in this cabinet, by a third distinct mechanism.

**The trick is word-level parallelism.** Pack "sketches" of *B* keys — a few distinguishing bits from
each — into a **single machine word**, then compare the query against all *B* of them **with a
handful of arithmetic operations**, exploiting the fact that a 64-bit ALU operation is 64 parallel
bit operations you already paid for.

> This is §39.3's TCAM idea, executed in software on hardware you already own. It is also a reminder
> that "one instruction" is not one operation: a word is a vector, and a machine word's worth of
> parallelism is free if you can arrange your data to use it. The same insight, at 512 bits, is
> §37.2's SIMD node search.

## 40.7 Scapegoat trees — the philosophy Volume 2 missed

> **Confidence: moderate-high.** Igal Galperin and Ronald Rivest, "Scapegoat trees", SODA 1993.

Volume 2 §14.2 confidently named **four** philosophies of balance — enforce strictly (AVL), enforce
loosely (red-black), repair on access (splay), randomize (treap) — plus a fifth axis, change the
fanout (B-trees). It missed one, and it is a genuinely distinct one:

> **Rebuild, don't repair.**

A scapegoat tree stores **no per-node metadata at all** — no colour, no balance factor, no height, no
priority. Just the tree, plus two integers for the whole structure. On insertion, if the new node's
depth exceeds a threshold, walk back up to find the highest ancestor that is insufficiently
weight-balanced — the **scapegoat** — and **completely rebuild that entire subtree**, perfectly
balanced, from scratch.

- **Amortized O(log *n*)** per insertion.
- **Worst case O(*n*)** for a single insertion — the rebuild.
- **Least metadata of any balanced tree**, tying splay trees (Volume 2 §12.1).

> **And it is Volume 5 §33.9's remedy at subtree granularity.** Volume 5 §31.6.1 proved that no
> concurrent B-tree may move keys leftward, and §33.9 concluded that **rebuilding the index is how
> you move keys leftward anyway — by building a new tree instead of modifying the old one.** A
> scapegoat tree does that continuously, at whatever granularity the imbalance demands. The same
> move appears in §37.5's packed memory array (redistribute a region when it gets too dense) and in
> LSM compaction (Volume 3 §20.7). **"Discard and rebuild the offending region" is a real balance
> philosophy and this book under-sold it.**

## 40.8 Cartesian trees and range-minimum queries — a loop closes

> **Confidence: moderate-high.** Jean Vuillemin, 1980, for Cartesian trees; Michael Bender and
> Martin Farach-Colton, "The LCA problem revisited", LATIN 2000, for the O(*n*)/O(1) result.

**The Cartesian tree** of an array: the root is the array's minimum; the left and right subtrees are
the Cartesian trees of the subarrays either side. So it is **heap-ordered on value and BST-ordered on
index** — which is to say it is **a treap with the array index as key and the array value as
priority**.

Volume 2 §13.1 noted that the treap's structure was Vuillemin's Cartesian tree and that the
*randomized* use came a decade later. Here is what else it is for:

```
  RMQ(i, j) — the minimum of a[i..j] —
      is the LOWEST COMMON ANCESTOR of nodes i and j in the Cartesian tree.

  And LCA reduces back to RMQ, on the DEPTH ARRAY of the tree's Euler tour
      (Volume 1 §4.1's Euler tour, doing structural work at last).

  That RMQ instance is special: consecutive depths differ by exactly ±1.
  Bender & Farach-Colton exploit that to get
      O(n) preprocessing, O(1) query.
```

**RMQ and LCA are the same problem in two costumes, and each reduces to the other.** That is a
pleasing fact in its own right, and Volume 1 §4.1's Euler tour — introduced purely to explain why
pre-, in- and post-order are the same walk — turns out to be the bridge.

> **Bender & Farach-Colton for the third time**: Bε-trees (Volume 3 §20.5), cache-oblivious B-trees
> (§37.5), and this.

## 40.9 Wavelet trees — trees over the alphabet

> **Confidence: moderate.** Roberto Grossi, Ankur Gupta and Jeffrey Scott Vitter, "High-order
> entropy-compressed text indexes", SODA 2003.

Every tree in this book has been a tree over **positions** or over **keys**. A wavelet tree is a
balanced binary tree over the **alphabet**.

The root holds a bitvector, one bit per character of the sequence, saying whether that character
belongs to the first or second half of the alphabet. The left child holds the subsequence of
first-half characters, recursively. Depth log σ.

It supports `rank` (how many *c*'s in the first *i* positions), `select` (where is the *k*-th *c*),
and `access` in **O(log σ)** time, in *n* log σ + o(*n* log σ) bits — near the information-theoretic
minimum.

Where it matters: **inside FM-indexes over large alphabets** (Volume 4 §26.6), and throughout
compressed and succinct data structure libraries. It is the structure that makes Volume 4's
"the modern answer is not a tree" note only half true — the FM-index is not a tree, but there is
a tree inside it.

---

