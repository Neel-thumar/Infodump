# Chapter 29 — Synthesis: The Tree as a Summary Machine

## 29.1 One recipe, eight instances

Volume 4 looked like eight unrelated structures. It was one idea eight times. Here is the table
promised in the preface:

| Chapter | A descent step consumes | Each node summarizes its subtree as | The question answered |
|---|---|---|---|
| **21** Trie | one **symbol** of the key | the set of keys with this prefix | is this key/prefix present? longest prefix? |
| **22** Segment tree | one **bit of the index range** | an **associative aggregate** (sum, min, …) | aggregate over [*l*, *r*] |
| **22** Fenwick tree | one **set bit** of the index | an aggregate over a bit-aligned block | prefix aggregate |
| **23** Interval tree | one comparison of a **low endpoint** | the **maximum high endpoint** | which intervals overlap? |
| **24** Heap | — (the answer is at the root) | the **minimum** of the subtree | what is the extreme? |
| **25** KD / quad / R-tree | one **coordinate or cell** | a **bounding region** | what is near / overlapping? |
| **26** Suffix tree | one **symbol of the pattern** | the set of **positions** below | where does this substring occur? |
| **27** Merkle tree | one **bit of the block index** | a **cryptographic hash** | is this block authentic? |
| **28** Decision tree | one **feature test** | a **prediction** for this region | what is the label? |

And Volumes 1–3 belong in the same table:

| Volumes 1–3 | one **key comparison** | the **range of keys** below | where is key *k*? what is in [*l*, *r*]? |

> **The search trees of Volumes 1–3 were the special case in which the summary happens to be "the
> range of keys below me".** That summary is so natural that it is invisible, which is why the
> general pattern is easy to miss until you have seen eight other choices of summary.

## 29.2 The recipe, precisely

From §23.2, now with nine instances behind it:

> **Augmentation.** Store at each node *x* a value *f*(*x*) summarizing *x*'s subtree, such that:
>
> **(a) Composability** — *f*(*x*) is computable in **O(1)** from *x*'s own data plus *f* of its
> children.
>
> **(b) Usefulness** — *f*(*x*) either answers the query outright, or lets you **discard *x*'s
> entire subtree** without descending into it.

Condition (a) is what makes augmentation survive **rebalancing**: a rotation (Volume 2 §9.7) changes
the subtree membership of only O(1) nodes, so *f* can be repaired in O(1). **Therefore any composable
summary can be bolted onto any of Volume 2's balanced trees or Volume 3's B-trees at no asymptotic
cost.** That is why the Linux kernel derives an interval tree from its existing red-black tree in a
few dozen lines (§23.6).

Condition (b) has two distinct modes, and separating them is worth doing:

**Exact pruning** — the summary *proves* the subtree contains no answer. Interval trees
(`max_hi < q_lo`), R-trees (MBR misses the query), Merkle diffing (hashes match, subtree is
identical), KD-tree NN search (splitting plane farther than the current best).

**Approximation** — the summary *stands in for* the subtree, which contains answers you have decided
not to look at. Barnes–Hut (a distant cell becomes a point mass), level-of-detail rendering, and —
arguably — a decision tree leaf, whose stored prediction replaces every training point that fell
there.

Two uses of one mechanism. The first is about *correctness with less work*; the second is about
*deliberately accepting error to buy work*.

### And when the recipe does not apply

Summaries that are **not** computable from children cannot be maintained under rotation, and
augmentation simply does not work for them: the median of a subtree, the second-largest gap between
consecutive elements, "the most frequent value". If you find yourself wanting one of these, you need
a different structure or a periodic rebuild — and knowing the condition tells you immediately which
situation you are in.

## 29.3 Four lessons that generalize beyond trees

**1. Volume 1 §1.7's tension is a law, not an anecdote.** It appeared three times in this volume,
and always with the same diagnosis and the same fix:

| Appearance | Per-element form | Global form | The fix |
|---|---|---|---|
| Volume 1 §1.7 | linked list: O(1) update, no random access | sorted array: O(1) lookup, O(*n*) update | **the tree** |
| §22.1 | plain array: O(1) update, O(*n*) query | prefix sums: O(1) query, O(*n*) update | **segment / Fenwick tree** |
| §27.2 | *n* hashes: O(1) verify, O(*n*) trust | one hash: O(1) trust, O(*n*) verify | **Merkle tree** |

> **Whenever you find that per-element storage makes queries expensive and global storage makes
> updates expensive, the answer is a hierarchy of aggregates, and the cost becomes O(log *n*) for
> both.** That is not a fact about trees; it is a fact about the shape of the trade-off, and trees
> are just the standard way to instantiate it.

**2. Weakening an invariant can be the design, not a concession.** Chapter 24's heap deliberately
knows less than a BST — nothing about sibling order — and is rewarded with control over its own
shape, hence Volume 1 §6.3's implicit array layout, hence 8 bytes per element and the best cache
behaviour in the book. **The right question about an invariant is not "is it strong?" but "is it
exactly as strong as the queries require?"** Anything stronger is information you are paying to
maintain and not using.

**3. A lower bound is a bound *for a model*, and models can be changed.** Volume 2 §3.5 gave
log₂ *n* comparisons as a hard floor. Chapter 21's tries achieve O(|key|) *independent of n* — not
by beating the bound but by not being comparison-based, extracting log₂ σ bits per step instead of
1. Radix sort escapes Ω(*n* log *n*) the same way. **When a bound blocks you, the productive
question is what the model assumes and whether you can stop paying for that assumption.**

**4. Dimensionality and adversarial structure defeat hierarchical partitioning, and it is honest to
say so.** Twice in this volume the modern answer turned out not to be a tree:

- **High-dimensional nearest neighbour** (§25.5) — HNSW *graphs* and quantization beat KD-trees,
  because in high dimensions a region tells you almost nothing about distance, and partitioning is
  built entirely on the assumption that it does.
- **Substring search at genome scale** (§26.6) — the FM-index, a compressed self-index, beat suffix
  trees and suffix arrays by extracting the same information more cheaply and discarding the
  structure.

Both are instances of a principle Volume 3 §19.4 stated and §26.6 pushed to its limit: **an invariant
is information, and information you can derive is information you do not have to store.** The
progression suffix trie → suffix tree → suffix array → FM-index is four consecutive applications of
that idea, each throwing away structure that turned out to be re-derivable.

---

