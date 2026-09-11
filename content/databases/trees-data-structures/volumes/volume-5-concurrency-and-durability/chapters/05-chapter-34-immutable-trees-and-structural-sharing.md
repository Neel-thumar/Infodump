# Chapter 34 — Immutable Trees and Structural Sharing

## 34.1 The inversion

Every mechanism so far has been a way to *coordinate mutation*. Latches, high keys, right-links,
write-ahead logs, full-page images, vacuum processes — all of them exist because threads and crashes
interfere with a structure being modified in place.

Chapter 34 asks the obvious question that the previous four chapters never did:

> **What if we never modify anything?**

> **Persistent (immutable) data structure.** Nodes are never modified after creation. To "update" the
> structure, create **new** nodes for everything that changes and **share** everything that does not.
> Every previous version remains valid and readable forever.

"Persistent" here is the functional-programming sense — *persisting across versions* — not the
storage sense. The two meanings collide constantly in this area and it is worth keeping them apart.

## 34.2 Path copying, derived

To change a leaf, you must create a new leaf. But then its parent must point at the new leaf, and
the parent is immutable, so you must create a new parent. And so on to the root.

> **Path copying.** An update creates new copies of exactly the nodes on the **root-to-target path**,
> and shares every subtree hanging off that path.

```
                  ORIGINAL (root 4)                    AFTER updating leaf 5

                        4                                     4'
                      /   \                                 /    \
                     2     6                         ┌───► 2*     6'
                    / \   / \                        │           /  \
                   1   3 5   7                        │        5'    7*
                                                      │
                                          (2's whole subtree {1,2,3}
                                           is shared through ONE pointer)

    New nodes:    4', 6', 5'         =  3  =  path length  =  height + 1
    Shared nodes: 2, 1, 3, 7         =  4
    Total nodes reachable from 4' :  7      — a complete, correct tree
    Total nodes reachable from 4  :  7      — ALSO still a complete, correct tree
```

**Both roots remain valid.** Root 4 sees the old data; root 4′ sees the new. Neither can observe the
other. Nothing was destroyed.

**The cost is O(log *n*) new nodes per update**, and the sharing fraction approaches 1:

| *n* | New nodes per update (fanout 2) | Fraction of the structure that is new |
|---|---|---|
| 1,000 | 10 | 1% |
| 10⁶ | **20** | **0.002%** |
| 10⁹ | 30 | 0.000003% |

> **This is why the technique is viable at all.** It looks profligate — "copy the path on every
> write" — and it is asymptotically almost free, because a path is a vanishing fraction of a tree.
> The intuition that immutability means copying the data is simply wrong; it means copying a
> logarithm of it.

### And immediately: fanout matters, for a new reason

The path length is log_*f*(*n*), so **the wider the tree, the less there is to copy**:

| Fanout *f* | Path length at *n* = 10⁶ | Nodes copied per update |
|---|---|---|
| 2 | 20 | **20** |
| 32 | 4 | **4** |
| 500 | 3 | **3** |

Wider nodes are bigger, so the *bytes* copied are comparable (a 32-way HAMT node averaging 16
children is ~130 bytes, so 4 × 130 = 520 bytes, against 20 × 32 = 640 bytes for a binary tree). But
the **allocation count** and the **dependent-load count on the read path** both drop by a factor of
five.

> **So immutable structures want high fanout — and for a completely different reason than Volume
> 3's.** Volume 3 wanted fanout to reduce *page reads*. Chapter 34 wants it to reduce *allocations
> per update* and *pointer hops per read*. Two independent arguments arriving at the same design.
> This is why every practical persistent map uses 32-way branching (§34.5) rather than binary, and
> why §34.9's kernel structure is a B-tree rather than a red-black tree.

## 34.3 Why this solves concurrency, completely

Now the payoff, and it is stronger than anything in Chapters 30–31.

> **A thread holding a root pointer holds an immutable snapshot. Nothing reachable from it will ever
> change.**

Work through the consequences against §30.4's costs:

| | Lehman & Yao (Ch 31) | Immutable + path copying |
|---|---|---|
| Latches taken per read | one per page visited | **zero** |
| Writes to shared memory per read | one atomic RMW per page (§30.4 Cost 1) | **zero** |
| Can hold a position across an I/O? | only by dropping the latch and keeping a pin | **yes, freely** |
| Can hold a position across a return to the caller? | needs the pin/latch split (§30.2) | **yes, freely** |
| Can hold a consistent view for a whole transaction? | no — needs MVCC layered on top | **yes, inherently** |
| Readers block writers? | briefly | **never** |
| Writers block readers? | briefly | **never** |
| Total synchronization in the scheme | latch per page | **one atomic store to publish the new root** |

**§30.4 Cost 1 disappears entirely.** That was the modern binding constraint: *telling the system you
are a reader is itself a write to shared memory, and readers that must announce themselves do not
scale*. An immutable reader does not need to announce anything, because there is nothing to protect
it from.

And the last two rows in the table are the ones that make immutability keep reappearing: a snapshot
that is **free to hold indefinitely** is exactly what a long-running query, a consistent backup, a
replica read, or a version-control checkout needs — and in a mutable structure every one of those is
a separate mechanism with its own cost.

## 34.4 What it costs

Four costs, and the second is the hard one.

**1. Allocation rate.** log_*f*(*n*) nodes per update — a few hundred bytes for a million-element
structure. Manageable, but it means every write allocates, which matters for tail latency in a
managed runtime and rules out use in allocation-free contexts.

**2. Reclamation — and this is where the difficulty lives.** An old version can be freed only when
**no reader holds it**. Determining that is the entire problem, and the obvious answer is a trap:

> **Naive reference counting reintroduces exactly the cost we eliminated.** A refcount is a shared
> word, so incrementing it is an atomic read-modify-write on a shared cache line — **§30.4 Cost 1,
> back again.** And it is *worse* than a latch scheme, because you would have to touch the refcount
> of every node you traverse, which is one shared write per node visited rather than one per page.

The techniques that actually work all share one property:

> **Readers announce themselves once per operation, in a thread-local location — never once per
> node, in a shared location.**

| Technique | How readers announce | Reclaimer waits for |
|---|---|---|
| **Epoch-based reclamation** | write the current epoch into my own slot | all threads to advance past the retiring epoch |
| **Hazard pointers** | write the specific pointers I am protecting into my own slots | no thread to be protecting the object |
| **RCU** (§34.9) | **nothing at all** | a **grace period** — evidence from the scheduler that every pre-existing reader has finished |
| **Tracing GC** | nothing | the collector to prove unreachability |

RCU is the extreme and the most elegant: reads are *literally* free, because the bookkeeping is
piggybacked on activity (context switches, entering user mode) that was happening anyway.

**3. No in-place update.** Every write goes to a fresh location, so writes have poor locality, and on
storage this is §32.11's write amplification. It also means the structure's physical layout drifts
from its logical order over time — CoW filesystems' fragmentation problem.

**4. Writers do not scale, and this is worth being blunt about.** Two concurrent writers both need to
copy the path to the root, and therefore both conflict **at the root**. The options are a
single-writer design (LMDB), or CAS-retry on the root pointer (which degrades badly under write
contention, since a losing writer must redo its whole path copy), or a lock over the write path.

> **Immutability is a read-scalability technique, not a write-scalability technique.** It is the
> right answer for read-dominated workloads with long-lived consistent views, and the wrong answer
> for many concurrent writers to one structure. Chapter 31's algorithm is the reverse. They are not
> competitors so much as answers to different read/write mixes.

## 34.5 HAMTs: the persistent map people actually use

> **Confidence: high on Bagwell and on the language implementations.** Phil Bagwell, "Ideal Hash
> Trees", EPFL technical report, 2001.

A **Hash Array Mapped Trie** is the standard implementation of an immutable map, and it is Volume 4
Chapters 21 and 22 combined with this chapter.

**The construction:**

1. Hash the key. Treat the hash as the key (Volume 4 §21.2: the path *is* the key).
2. Consume **5 bits per level** → **32-way branching**.
3. Each node is a **32-bit bitmap** plus a **densely packed array of only the children that exist**
   — Volume 4 §21.6's bitmap node representation, which is where that section said it would
   reappear.

```
  Finding the child for a 5-bit chunk c:

     if (bitmap & (1 << c)) == 0:      the child does not exist
     index = popcount( bitmap & ((1 << c) - 1) )     ← ONE INSTRUCTION
     child = children[index]

  Space:  4 bytes of bitmap + 8k bytes for k children
          (rather than 256 bytes for a full 32-pointer array)
```

**Depth:** ⌈32/5⌉ = 7 levels for a 32-bit hash, ⌈64/5⌉ = 13 for a 64-bit one — and crucially,
**bounded independent of *n***, which is why HAMTs get described as "effectively constant time".

**Path copying cost:** at most 7 nodes, each around 40–130 bytes. **A few hundred bytes per
update** — cheap enough to be the *default* map type in a language, which is the real test.

**In production:** Clojure's `PersistentHashMap`, Scala's `immutable.HashMap`, Immutable.js,
Haskell's `unordered-containers`. Clojure's `PersistentVector` is the same idea keyed on the integer
index's bits, with a "tail" optimization keeping the last partial block unshared so that appends are
O(1) amortized.

> Clojure's design thesis — that persistent immutable collections make concurrent programming
> tractable because **there is no shared mutable state to coordinate** — is §34.3 elevated to a
> language philosophy. *(Confidence: high that this is Rich Hickey's stated position.)* And the
> 32-way branching is not incidental: §34.2 showed that immutability specifically rewards fanout, so
> a language betting on immutability had to pick a wide trie.

## 34.6 Copy-on-write B-trees: immutability on disk

§32.11 already covered the mechanics; what it did not say is that copy-on-write **is** path copying,
with pages as nodes and the superblock as the root pointer. Reread §32.11's diagram against §34.2's
and they are the same picture.

Which means the properties transfer:

| §34.3's property | On-disk form |
|---|---|
| A root pointer is an immutable snapshot | **retaining an old superblock IS a filesystem snapshot** |
| Readers need no synchronization | **readers are pointer dereferences into `mmap`'d memory** (LMDB) |
| Every version remains valid | **MVCC, for free** |
| Publishing is one atomic store | the superblock flip |
| Reclamation is the hard part | free-list / space-map management (§32.11's "hard" row) |

**LMDB** is the cleanest example: a memory-mapped copy-on-write B+tree with two alternating meta
pages, a **single writer**, and readers that take no locks whatsoever — a read is a pointer chase
through the mapping, with the operating system's page cache doing the buffering. There is no
write-ahead log and no recovery process; startup reads the newer valid meta page and is done.

And note that LMDB's single-writer design is not a limitation someone failed to remove. It is
§34.4's cost 4, accepted deliberately in exchange for costs 1–3 being the *only* other costs.

## 34.7 Git, and the Volume 1 debt

Volume 1 §3.2 drew a careful distinction between trees and DAGs, listed five properties that
single-parenthood buys, warned that sharing children forfeits all of them, and promised that Volume
5 would show why you might do it deliberately. Volume 4 §27.6 then showed git's object model is a
Merkle DAG and noted its sharing without explaining the mechanism.

Here it is. **Git is a persistent data structure, and every git operation you find surprising is a
consequence of that.**

```
  A COMMIT HASH IS A ROOT POINTER.

  commit C1 ──► tree(root) ──┬──► tree(src) ──┬──► blob(main.c)
                             │                └──► blob(util.c)
                             └──► blob(README)

  Now edit src/main.c and commit:

  commit C2 ──► tree(root)' ─┬──► tree(src)' ─┬──► blob(main.c)'   ← NEW
                             │                └──► blob(util.c) ◄──┐
                             └──► blob(README) ◄───────────────────┤
                                                                   │
                             everything unchanged is SHARED ────────┘
                             with C1, by hash identity

  New objects: blob(main.c)', tree(src)', tree(root)', commit C2
             = the PATH from the changed file to the repository root.
             = §34.2's path copying, exactly.
```

Every consequence follows mechanically:

- **A commit is a complete snapshot of the entire repository**, and all commits coexist, and the
  total space is O(changes) rather than O(commits × repo size). That is structural sharing.
- **`git checkout` between branches is O(diff), not O(repo)**, because an unchanged directory has an
  identical hash and can be skipped wholesale — Volume 4 §27.4's pruning.
- **History is immutable**, so `rebase` produces *new* commits rather than editing old ones. Not a
  policy; arithmetic.
- **Identical files anywhere in history are stored once** — content addressing plus sharing.

And git pays **all three** of Volume 1 §3.2's DAG costs, deliberately:

| Volume 1 §3.2's warning | How git pays it |
|---|---|
| No unique root-to-node path | a blob has no canonical path; `git log --follow` is a heuristic |
| Graph walks need a visited-set | every git graph traversal carries one |
| Sharing needs sharing-aware memory management | **`git gc` is a tracing garbage collector** |

That last row closes the loop with Chapter 33. `git gc` traces reachability from roots (branches,
tags, HEAD, **and the reflog**), and unreferenced objects are pruned — but only after a **grace
period** (`gc.pruneExpire`, two weeks by default) to avoid racing concurrent operations that hold
references not yet published.

> **That grace period is §33.6's deferred recycling, in a version control system.** Same hazard —
> something may hold a reference you cannot see — same solution — wait long enough that it cannot.
> And the reflog's role as an extra GC root is exactly §33.7's pathology: a stale reference keeps
> objects alive, which is why `git gc` sometimes reclaims far less than you expected.

## 34.8 MVCC is immutability with a hand-written collector

Now the identification Chapter 33 kept gesturing at.

| Immutable data structure | MVCC storage engine |
|---|---|
| Nodes are never modified | **row versions are never modified** — an update writes a new version |
| A root pointer is a snapshot | **a snapshot is a visibility horizon** — a logical root pointer |
| All versions coexist | old row versions coexist and are visible to older snapshots |
| Reclaim when no reader holds it | **reclaim when the horizon has advanced past it** (§33.6) |
| Garbage collector | **the background vacuum process** |
| A live reference prevents collection | **a long-running transaction prevents reclamation** (§33.7) |

> **Chapter 33's entire five-layer cleanup architecture is a garbage collector — hand-written, in a
> system that chose not to use a garbage-collected runtime for its storage layer.**
>
> And the pathology every database operator knows — *a single long-running transaction stops
> reclamation across the whole cluster and bloat grows without bound while the cleaner runs
> dutifully and reclaims nothing* — is the oldest problem in garbage collection, which is that **a
> live reference prevents collection.** Once you see it that way, the remedies are the familiar
> ones: shorten the reference's lifetime, or partition the heap so one long reference does not pin
> everything.

§33.8's heap-only-tuple optimization is worth revisiting in this light too: it is a **generational**
trick. Short-lived versions that never escape their page are collected page-locally by pruning,
without involving the global collector at all — exactly what a nursery does for short-lived objects
in a generational GC.

## 34.9 RCU, and the maple tree debt

> **Confidence: high on attribution; moderate on dates.** Read-Copy-Update, developed by Paul
> McKenney and others; in the Linux kernel from the early 2000s, with antecedents in the early
> 1990s.

RCU is §34.4's reclamation problem, solved by making readers announce nothing:

```
  READER:   rcu_read_lock()      ← in classic RCU: disable preemption. No atomics.
            ... traverse ...        In some variants: literally nothing.
            rcu_read_unlock()

  WRITER:   copy the node, modify the copy,
            publish it with ONE atomic store,
            then call_rcu(free_old)   ← deferred until a GRACE PERIOD elapses

  GRACE PERIOD: a point after which every reader that existed at publication time
                has finished.  Detected by observing that every CPU has passed
                through a QUIESCENT STATE — a context switch, an idle period,
                a transition to user mode.
```

**The scheduler provides the evidence.** That is the trick: reads are free because the bookkeeping
rides on activity that was happening anyway.

### Why the maple tree replaced a red-black tree (Volume 3 §19.8)

Volume 3 §19.8 reported that Linux 6.1 replaced the virtual-memory-area red-black tree with the
**maple tree** — an RCU-safe, range-based B-tree — and gave "cache behaviour and lock-free reads" as
the stated reasons without explaining the second. Chapters 31 and 34 together explain it.

**Why a red-black tree is hard to make RCU-safe:**

> A rotation (Volume 2 §9.7) moves three pointers, and a lockless reader traversing during a rotation
> can observe a state that **is not a tree** — it can miss a subtree entirely, or in some
> interleavings loop. To make it safe you would have to *copy* nodes on every rotation rather than
> mutate them, and for a binary tree that means copying a node carrying **one key** — the copy cost
> is enormous relative to the payload.

**Why a wide B-tree is not:**

- **B-trees have no rotations at all.** Volume 3 §17.3 and §17.4 established this: a B-tree's
  balance is maintained by splitting, and its uniform leaf depth is structurally unbreakable rather
  than actively repaired. **There is no operation that transiently exposes a malformed tree.**
- **Updates can replace whole nodes**, and a node holds many entries, so **one copy carries a lot of
  payload** — §34.2's fanout argument.
- Path copying with fanout 16–64 copies two or three nodes.

> **So: B-trees are far easier to make RCU-safe than balanced binary trees, precisely because they
> have no rotations and because high fanout amortizes the copy.** That is Volume 3 §19.8's debt paid,
> and note that it is the same observation as §34.2's — immutability rewards fanout — arriving as a
> real kernel engineering decision rather than as an abstraction.
>
> Note also the pleasing symmetry with §31.10: **skip lists are easy to make concurrent because they
> have no rebalancing operation; B-trees are easy to make RCU-safe for the same reason.** The
> concurrency-friendliness of a structure is largely determined by whether it has an operation that
> transiently breaks its own invariants.

## 34.10 Fully latch-free trees, honestly

The logical endpoint: a tree with **no latches anywhere**, readers and writers alike, using only
atomic compare-and-swap.

**The Bw-tree.** Justin Levandoski, David Lomet and Sudipta Sengupta, "The Bw-Tree: A B-tree for New
Hardware Platforms", ICDE 2013, from Microsoft Research. Used in Hekaton (SQL Server's in-memory
engine) and reported in Azure Cosmos DB. *(Confidence: high on the paper; moderate on current
deployment.)*

```
  A MAPPING TABLE from logical page ID → physical address.

     PID 42  ──►  [ delta: insert k=17 ] ──► [ delta: delete k=9 ] ──► [ base page ]
                            ↑
     An update PREPENDS a delta record and CASes the mapping table entry.
     No page is EVER modified in place.  The "page" is a chain of deltas
     over an immutable base.

     Periodically, CONSOLIDATION collapses a chain into a new base page —
     again by CAS, again without modifying anything.
```

Every update is a single-word CAS on one mapping-table slot. It is immutability (§34.1) at page
granularity, with the mapping table as the indirection that makes "publish atomically" a single
store.

**And the honest assessment**, which is worth more than the mechanism:

> A 2018 reimplementation study — "Building a Bw-Tree Takes More Than Just Buzz Words" (Wang, Pavlo
> and colleagues, SIGMOD) — found the structure substantially harder to build than the paper
> suggests, with a great deal of unstated detail, and **performance not clearly better than a
> well-implemented optimistic latching scheme** (§31.9). *(Confidence: moderate-high on the paper and
> its general finding.)*

The generalizable lesson:

> **Full lock-freedom is achievable and is usually not the right engineering trade.** §31.9's
> optimistic latch coupling — version counters, validate-and-retry, no writes on the read path —
> captures most of the benefit at a small fraction of the complexity and is the modern default for
> in-memory indexes. **The read path is where the contention was (§30.4 Cost 1); fixing the read path
> is most of the win; making the write path lock-free as well is the last few percent at several
> times the difficulty.**

---

