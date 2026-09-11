# Chapter 16 — Bayer and McCreight, 1972

## 16.1 The problem they actually had

> **Confidence: high on the paper and the affiliation; moderate on the internal Boeing context,
> which is thinly documented.**

**Rudolf Bayer** and **Edward M. McCreight** were at **Boeing Scientific Research Laboratories** in
Seattle when they wrote "Organization and Maintenance of Large Ordered Indices", published in
*Acta Informatica* volume 1, issue 3, 1972, pages 173–189. An earlier version was presented at the
1970 ACM SIGFIDET Workshop on Data Description and Access.

Note the title. Not "a new balanced tree." **"Organization and *maintenance* of large ordered
indices."** The novelty they were claiming was not the shape of the structure but the ability to
*keep it correct while it changes*, at scale, on disk. That emphasis is the right one and it is
usually lost in modern presentations.

The concrete problem of 1970: you have a file with millions of records on magnetic disk or drum,
and you need to find records by key. The dominant technique was **ISAM** — Indexed Sequential
Access Method, an IBM design from the early 1960s. Understanding why ISAM failed is the failure
that forced the B-tree, so it deserves proper attention.

## 16.2 Why ISAM failed: the static index

ISAM works like this. Sort your records and write them into consecutive disk tracks, leaving some
free space in each. Build a small index over the tracks — "keys 1–1000 are on cylinder 1, keys
1001–2100 on cylinder 2" — and keep that index in a fixed location. To find a key, consult the
index, seek to the cylinder, scan it.

This is excellent, and it is essentially the sorted array from Volume 1 §1.4 with a directory
bolted on. Search is a couple of accesses. And it has Volume 1 §1.4's exact defect: **insertion.**

When a track fills up, you cannot shift everything down — that would mean rewriting the whole file
(Volume 1 §1.4 measured this: Θ(*n*) bytes moved). So ISAM uses **overflow chains**: the new record
goes into a separate overflow area, linked from the home track.

```
PRISTINE ISAM — one seek to the right track, then a scan:

  index  ──►  cylinder 1        cylinder 2        cylinder 3
              [ 100..1000 ]     [ 1001..2100 ]    [ 2101..3000 ]

AFTER MONTHS OF INSERTIONS — the overflow chains:

  index  ──►  cylinder 1        cylinder 2        cylinder 3
              [ 100..1000 ]     [ 1001..2100 ]    [ 2101..3000 ]
                    │                 │
                    ▼                 ▼
              overflow rec ──►  overflow rec ──► overflow rec ──► overflow rec
                    │                                                   │
                    ▼                                                   ▼
              overflow rec                                        overflow rec

  Each ──► is a SEEK. On 1970 hardware, ~25 ms each.
```

The degradation is the whole story:

- A lookup that used to cost 2 accesses now costs 2 + (chain length) accesses.
- Chains grow **unboundedly** and **unevenly** — a hot key range gets a long chain while a cold one
  stays pristine, so performance becomes wildly unpredictable across the keyspace.
- The overflow area has no order, so the chain must be scanned linearly.
- **The only remedy is to take the file offline and rebuild it.** This is why "reorganize the ISAM
  file" was a scheduled operational chore, typically overnight or weekly.

Recognize the shape? **ISAM is Volume 1's sorted array, and the overflow chain is Volume 1's linked
list, bolted together — and it inherits the worst of both.** Volume 1 §1.7's impossibility table
applies directly: an ordered structure whose positions encode the ordering cannot absorb insertions
locally, so it either rewrites globally or degrades locally. ISAM chose to degrade.

And the degradation is *not* uniform, which is worse than a uniformly bad structure, because you
cannot plan capacity around it.

## 16.3 What was actually novel

Bayer and McCreight's contribution was a structure where insertion and deletion are **local,
bounded, and self-correcting**, with no offline rebuild ever required. Specifically:

**1. Nodes sized to the physical block.** So one access retrieves a large, fully-used chunk of
index. §15.7's Requirement 1, in 1972.

**2. Growth by splitting, absorbed locally.** A full node splits in two and pushes one key to its
parent. The work is O(1) pages at each of at most *h* levels. Nothing outside the root-to-leaf path
is touched. Contrast ISAM, where a full track has nowhere to put anything.

**3. All leaves at the same depth, maintained as an invariant rather than as an initial
condition.** ISAM was balanced when built and unbalanced forever after. A B-tree is balanced
*always*, because — and this is the structural insight — **the tree grows at the root, not at the
leaves** (§17.4). There is no operation that lengthens one path without lengthening all of them.

**4. A guaranteed minimum occupancy.** Every node is at least half full, so the height bound holds
and the storage cannot degrade into sparseness.

**5. Bounded, predictable worst case.** *h* ≈ log_f(*n*) accesses, always, for every key, forever.
No hot ranges, no chains, no reorganization window.

Point 5 is what made it deployable. An operations team can plan around "every lookup costs 3
seeks." They cannot plan around "every lookup costs between 2 and 400 seeks depending on which key
and how long since the last rebuild."

## 16.4 What does the "B" stand for?

Nobody knows, and this is genuinely unresolved rather than merely obscure.

The candidates, all of which have been argued: **B**ayer (the first author), **B**oeing (the
employer), **b**alanced, **b**road, **b**ushy, **B**ayer-McCreight.

> **Confidence: high that the question is unresolved; moderate on the quote's exact wording and
> occasion.** McCreight has addressed it publicly and pointedly declined to settle it. The
> remark usually attributed to him is along the lines of *"the more you think about what the B in
> B-trees means, the better you understand B-trees"* — which is a good joke and also a fair point,
> since every candidate describes something true about the structure. Bayer has reportedly been
> similarly unhelpful. I would not assert any single expansion as correct.

What the "B" definitely does **not** mean is "binary." A B-tree is not a binary tree and has no
particular relationship to one, which makes the coincidence of initials an enduring source of
confusion in interviews and job descriptions.

## 16.5 What happened next

The adoption timeline is unusually fast for a data structure, because the need was acute and the
solution was immediately practical.

| Approx. date | Development | Confidence |
|---|---|---|
| 1970 | Presented at ACM SIGFIDET workshop | moderate |
| 1972 | *Acta Informatica* paper | **high** |
| 1972 | Bayer's "symmetric binary B-trees" — the ancestor of red-black trees (Volume 2 §11.1) | **high** |
| ~1973 | IBM **VSAM** ships, replacing ISAM with a B+-tree-based design | moderate |
| 1979 | Comer's survey, "The Ubiquitous B-Tree" (*ACM Computing Surveys*) — the title already true seven years in | **high** |
| 1980s onward | Effectively every relational database and most filesystems | **high** |

Two things about that table are worth pausing on.

**Bayer published both the B-tree and the ancestor of the red-black tree in the same year.**
Volume 2 §11.2 showed that a red-black tree *is* a 2-3-4 tree — a B-tree of order 4 — encoded in
binary. So the two structures are the same idea, aimed at two different levels of §15.1's
hierarchy: order 4 for RAM, order 500 for disk. That is not a coincidence; it is one person
noticing that the fanout is a free parameter and that the right value depends on the device.

**Comer's 1979 survey was titled "The Ubiquitous B-Tree" only seven years after the original
paper.** For comparison, it is now over fifty years later and the title is still accurate. Very
few data structures reach total dominance of a problem domain and then hold it for half a century.
The reason is §15.8: the hardware trend that motivated it has continued in the same direction the
whole time.

## 16.6 Why this structure and not another

One closing question before the mechanics. Volume 2 offered four ways to balance a tree. Why did
none of them get scaled up to disk instead?

Because they all fix the *shape* while accepting the *fanout*, and §15.5 showed the fanout is what
matters. An AVL tree with 8 KB nodes holding one key each would have height 30 and waste 99.6% of
every transfer. Balance was never the binding constraint on disk; **arity was.**

Conversely, once you have arity 500, the balance problem becomes nearly trivial — which is the
quiet punchline of this volume. §17.3 will show that the minimum-occupancy invariant is
**self-maintaining under insertion**: a split of a full node produces exactly two half-full nodes,
so you never have to do anything extra to preserve it. There are no rotations in a B-tree. There
are no four cases, no colour bits, no priorities, no amortized potential argument. Volume 2's
entire apparatus was necessary because binary trees have almost no slack; a B-tree node has
hundreds of slots and therefore has slack to spare.

> **The transferable observation:** Volume 2 §14.3 said "slack is the design variable." A B-tree
> is what happens when you turn that dial all the way up. Increasing the fanout from 2 to 500
> makes the balancing problem *easier*, not harder — which is exactly backwards from what you would
> guess, and it is why B-tree maintenance code is shorter than red-black deletion code despite
> managing a far more complex-looking structure.

---

