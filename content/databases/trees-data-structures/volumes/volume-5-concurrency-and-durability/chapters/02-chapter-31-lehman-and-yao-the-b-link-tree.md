# Chapter 31 — Lehman and Yao: The B-link Tree

## 31.1 The paper

> **Confidence: high.** Philip L. Lehman and S. Bing Yao, "Efficient locking for concurrent
> operations on B-trees", *ACM Transactions on Database Systems* 6(4), December 1981, pp. 650–670.

The result is remarkable enough to state before the mechanism, because it looks impossible against
§30.6's requirements:

> A search holds **at most one latch at a time**, never holds a latch on an ancestor while
> descending, **never restarts**, and never blocks a writer for longer than the time to read one
> page.

The structure is called a **B-link tree**, and it achieves this with two additions to a B+-tree —
one pointer and one key per page. That is the entire cost.

## 31.2 The two additions

> **Addition 1 — the right-link.** Every page has a pointer to its **immediate right sibling at the
> same level**. (Volume 3 §19.6's leaf-level list, now understood as a correctness mechanism rather
> than a scan convenience — and present at *every* level, not just the leaves.)
>
> **Addition 2 — the high key.** Every page stores **an upper bound on all keys the page may
> contain**. On the rightmost page of each level there is no high key, meaning +∞ implicitly.

Notation for the rest of the chapter: for a page *P*, write **HK(*P*)** for its high key and
**R(*P*)** for its right-link.

Two things worth noting immediately. First, the high key is *not* data — it is a bound, and Volume 3
§19.4 already established that a B+-tree separator need only separate, so a high key can be a value
that exists nowhere in the tree. Second, in a real implementation the high key occupies a slot on the
page (PostgreSQL puts it at offset 1, which is why offset 1 is never a data item on a non-rightmost
page), so the cost is one entry per page — a 0.2% overhead at fanout 500.

## 31.3 The split protocol, and the ordering is the whole thing

```
split(P):                                        ← holding an EXCLUSIVE latch on P
    1.  allocate a new page Q                      (nothing points to Q yet, so no
                                                    other thread can reach it)
    2.  move the upper half of P's entries to Q
    3.  HK(Q)  :=  HK(P)                           ← Q inherits P's OLD upper bound
    4.  HK(P)  :=  the separator key               ← P's bound TIGHTENS
                   (the smallest key now on Q)
    5.  R(Q)   :=  R(P)                            ← Q takes over P's right-link
    6.  R(P)   :=  Q                                ← ★ THE CRITICAL WRITE ★
    ────────────────────────────────────────────
    7.  RELEASE the latch on P
    ────────────────────────────────────────────
    8.  SEPARATELY: insert (separator, pointer-to-Q) into P's parent.
```

Steps 1–6 happen **while the latch on *P* is held**. Step 8 happens **after it is released**. So
between step 7 and step 8 the tree is in a state that would horrify anyone reading Volume 3:

```
                    ┌──────── PARENT ────────┐
                    │  ...  [sep → P]  ...   │   ← STALE. No downlink to Q at all.
                    └───────────┬────────────┘      Q is UNREACHABLE by descent.
                                │
                 ┌──────────────▼──────────────┐   ┌─────────────────────────────┐
                 │ P    HK = 40                │──►│ Q    HK = 100               │──►
                 │ 10  20  30  40              │   │ 50  60  70                  │
                 └─────────────────────────────┘   └─────────────────────────────┘
```

**The parent is wrong. Q holds live data and no parent knows it exists.** And the tree is
nevertheless completely correct for readers, which is what §31.4 and §31.5 establish.

Note also what step 8's separation buys: the split is **not atomic across pages**, and does not need
to be. Chapter 32 §32.9 shows that this is also exactly what lets crash recovery avoid ever
modifying the tree.

## 31.4 The reader's recovery rule

```
descend(k):
    P := root                                   (found via the metapage — §31.6.5)
    loop:
        latch P (shared)
        ────  MOVE-RIGHT  ────────────────────────────────────────────
        while k > HK(P):                        ← P split after we got here
            P' := R(P)
            unlatch P;  latch P' (shared);  P := P'
        ──────────────────────────────────────────────────────────────
        if P is a leaf: search P and return
        c := the child pointer in P for k
        unlatch P                                ← ★ PARENT RELEASED HERE ★
        latch c ... (i.e. P := c and loop)
```

Two lines carry everything.

**The move-right loop** is the staleness detector §30.6 requirement 3 asked for. It is a *loop*, not
a single step, because a page may have split several times since the downlink was read.

**The unlatch before descending** is §30.6 requirement 1. Between releasing *P* and latching *c*,
the thread holds **no latch at all** and only a block number that may already be obsolete. That is
the aggressive part, and it is what makes I/O and executor returns free.

Now walk §30.1's failure again with the rule in place:

```
TIME    READER R (seeking 60)              WRITER W                 STATE
────────────────────────────────────────────────────────────────────────────────────
 t₁     read parent, get downlink → L,                              L = [10..70], HK(L)=100
        RELEASE the parent latch
 t₂                                        descend to L, it's full
 t₃                                        SPLIT (steps 1–6):       L = [10,20,30], HK(L)=45
                                                                    Q = [45,50,60,70], HK=100
                                                                    R(L) = Q
 t₄     latch L.  Check: 60 > HK(L) = 45?
        YES → the keys moved right.
 t₅     follow R(L) → Q.  latch Q.
        Check: 60 > HK(Q) = 100?  NO.
 t₆     search Q, find 60.               ← CORRECT.
```

The reader never consulted the parent, never restarted, and held one latch at a time. **The parent
was wrong throughout and it did not matter.**

## 31.5 The theorem

Now the proof this book has owed since Volume 3 §18.9. I will state the invariants explicitly,
because the argument is short once they are.

### The invariants

> **I1 — Rightward-only movement.** No key ever moves from a page to a page on its **left**.
>
> *Justification:* the only operation that moves keys between pages is `split`, and `split` moves
> keys from *P* to a newly allocated page *Q* that is installed as *P*'s **immediate right
> sibling** (step 6). No other operation relocates keys. In particular there is no merge and no
> redistribution — §31.6 shows this is forced, not incidental.

> **I2 — High keys never increase.** For any page *P*, HK(*P*) is non-increasing over time.
>
> *Justification:* HK(*P*) changes only at split step 4, which sets it to the separator — the
> smallest key moved to *Q* — and every key on *P* before the split was ≤ the old HK(*P*), so the
> separator ≤ old HK(*P*).

> **I3 — The right-link chain covers what left a page.** At any instant, for any page *P*, every key
> that was resident on *P* at any earlier time is either still on *P* or reachable from *P* by
> following a finite number of right-links.
>
> *Justification:* by I1 keys only leave *P* rightward, and by split step 6 the right-link to their
> new home is installed **before the latch on *P* is released** (step 7). So no thread can observe a
> state in which keys have left *P* without the link being present. Induct for repeated splits.

> **I4 — High keys increase along the right-link chain.** If *Q* = R(*P*) then HK(*P*) ≤ HK(*Q*).
>
> *Justification:* split step 3 sets HK(*Q*) to *P*'s old high key while step 4 lowers HK(*P*) below
> it. Subsequent splits of either page only lower that page's own high key (I2), preserving the
> relation.

### The Recovery Theorem

> **Theorem.** Let a thread obtain the block number of page *P* at time *t*₀, at which time *P* was
> the correct page for key *k* at its level (i.e. *k* ≤ HK(*P*) at *t*₀). Then at any later time
> *t*₁, the move-right loop of §31.4 started at *P* terminates, in finitely many steps, at the page
> that is correct for *k* at *t*₁.

**Proof.**

*Termination.* Consider the right-link chain *P* = *P*₀ → *P*₁ → *P*₂ → … at time *t*₁. By I4 the
high keys along this chain are non-decreasing. By I2, HK(*P*₀) at *t*₁ is ≤ HK(*P*₀) at *t*₀. Every
key that has left *P*₀ since *t*₀ went to pages on this chain (I3), and the last such page inherited
*P*₀'s original high key at *t*₀ (step 3, transitively) — so some page *P*ⱼ on the chain satisfies
HK(*P*ⱼ) ≥ HK(*P*₀ at *t*₀) ≥ *k*. The loop's exit condition is *k* ≤ HK(current), so it exits at
or before *P*ⱼ. **Finite.** ∎

*Correctness.* The loop exits at the first *P*ᵢ with *k* ≤ HK(*P*ᵢ). Two things must hold:

- *P*ᵢ is not too far **left**: for every *j* < *i* we had *k* > HK(*P*ⱼ), and a high key is by
  definition an upper bound on the page's contents, so *k* is provably not on *P*ⱼ and not in its
  range. Skipping them loses nothing.
- *P*ᵢ is not too far **right**: by I4 high keys are non-decreasing along the chain, so *P*ᵢ is the
  *first* page whose bound admits *k*. And by I3, if *k* is anywhere in this level it is on *P*ᵢ or
  reachable further right — but the exit condition combined with the high key being an upper bound
  means *P*ᵢ's range contains *k*. ∎

### The corollary that is the actual point

> **Corollary (stale downlinks are safe).** A downlink read at any time in the past points to a page
> that is **at or to the left of** the correct page — never to the right.
>
> *Therefore:* a stale downlink is always an **under-approximation**, and under-approximations are
> recoverable by moving right. **This is why no ancestor latch is needed.** The parent is allowed to
> be arbitrarily out of date; the only thing that could break the reader would be a downlink
> pointing too far *right*, and I1 makes that impossible.

Read that corollary twice, because it is the load-bearing sentence of the whole volume. Everything
in §31.6 is a consequence of protecting it.

## 31.6 Five corollaries: the debts, paid

### 31.6.1 Why real B-trees refuse to merge (Volume 3 §18.9)

Volume 3 §18.7 gave textbook deletion: borrow from a sibling, or **merge** with one. Volume 3 §18.9
said real systems do not implement it and pointed here.

**A merge moves keys leftward** — the right sibling's entries move into the left page, and the right
page is then deleted. That violates **I1** directly, and I1 is the sole justification for I3, which
is the sole justification for the Recovery Theorem.

Concretely, what breaks:

```
  Reader holds a stale block number for page Q.
  Meanwhile Q's contents merge LEFT into P, and Q is deleted.

  Reader latches Q and applies the move-right rule:
      k > HK(Q)?   The keys it wants went LEFT, not right.
      Walking right takes it PAST them, forever.
      Walking left is not something the algorithm provides any guarantee about.

  There is NO direction in which the reader can recover.
```

**Borrowing has the same defect** in the direction that matters: rotating a key from the right
sibling into the left page moves a key leftward.

> So the choice is not "merge or don't bother". The choice is: **rebalance on delete, or have
> latch-free descent.** You cannot have both, and descent happens on *every* operation while
> deletion does not. Every production B-tree chose descent, and Chapter 33 is the bill.

### 31.6.2 Why B\*-trees died (Volume 3 §20.2)

Volume 3 §20.2 showed that B\*-trees raise occupancy from ~69% to ~81% by redistributing entries
into a sibling before splitting, and 2-to-3 splitting when that fails — and said the reason nobody
uses them is concurrency.

Two reasons, and the second is the fatal one:

1. Redistribution modifies **three pages plus the parent** and must do so atomically, which means
   holding multiple latches across siblings and a parent — reintroducing every cost in §30.4 and
   creating deadlock risk (H4) between operations approaching from opposite directions.
2. **Redistribution moves keys leftward.** I1 violated. Same failure as §31.6.1.

**A ~15% space saving, in exchange for abandoning the Recovery Theorem.** Volume 3 said "every
production system chose concurrency"; that is why.

### 31.6.3 Why backward scans are asymmetric (Volume 3 §19.6)

Volume 3 §19.6 noted that forward scans are safe and backward scans need verify-and-retry, and
deferred the reason.

The reason is that **I3 is directional.** Splits install a right-link before releasing the latch, so
forward traversal is always covered. There is no corresponding guarantee leftward:

```
FORWARD:   at page P, follow R(P).  Always correct — I3.

BACKWARD:  at page P, follow L(P) (the left-link, which exists for scans, not
           for correctness).  You arrive at some page X.  But X may have SPLIT
           since P's left-link was set, in which case the page immediately left
           of P is now one of X's right-siblings, not X itself.

           So you must VERIFY:  is R(X) == P ?
           If not, walk right from X until you find the page whose right-link
           points at P.  Retry as needed.
```

**The asymmetry in the code is not sloppiness; it is I1 showing through.** A structure in which
content moves only one way has traversal guarantees only in that direction.

### 31.6.4 Why preemptive splitting is unnecessary (Volume 3 §18.6)

§30.5 explained that top-down splitting exists so that a writer never needs to revisit an ancestor,
and can therefore hold one latch at a time.

Lehman & Yao achieves the same property **without** the space cost, because step 8 of §31.3 does not
require the parent's latch to have been held continuously. The writer re-finds the parent afterwards
— and if the parent has *itself* split in the meantime, the writer applies **the same move-right
rule one level up** to locate it. (PostgreSQL's `_bt_getstackbuf` is exactly this: walk right until
you find the parent that now covers the separator.)

So reactive splitting is compatible with single-latch operation after all, and modern
implementations use it and keep the ~69% occupancy.

### 31.6.5 Why root splits need no special handling (Volume 3 §18.5)

Volume 3 §18.5 noted that a root split changes *which page is the root*, requiring a fixed-location
**metapage** whose contents point to the current root — one level of indirection so the root can
relocate.

What happens to a reader that cached the old root's block number and is descending from it? That
page is no longer the root; it is now an internal page covering only the left portion of the
keyspace. And:

- If the reader's key is in that portion, descent proceeds normally and reaches the right leaf.
- If the key moved right, the reader hits the old root's high key and **moves right** — because a
  root split is, mechanically, just a split, and I1–I4 apply to it unchanged.

**A change to the tree's height requires no special case whatsoever.** The reader never learns the
root moved and never needs to. That is a strong signal the invariant is the right one: it makes the
most structurally dramatic operation in the tree indistinguishable from the most routine.

## 31.7 What Lehman & Yao does not cover: deletion

The 1981 paper assumes **no page deletion**. That is not an oversight — §31.6.1 shows deletion is
where the invariant bites hardest — but real systems must reclaim empty pages eventually.

The standard extension (drawing on Lanin & Shasha and subsequent work) is a **two-stage deletion**
that never moves keys, only removes an already-empty page:

```
  Stage 1 — HALF-DEAD:  remove the downlink from the parent.
            The page is now unreachable by DESCENT, but still linked by siblings,
            so any thread already holding a pointer to it still works.

  Stage 2 — DEAD:       splice the sibling links around it
            (left.right := page.right,  right.left := page.left).
            Now unreachable by any path.

  Stage 3 — RECYCLE:    ...not yet. See §33.6.
```

Note the page must be **completely empty** before this begins — this is deletion, not merging, and it
moves no keys, so I1 is untouched. And note that Stage 3 is deferred, which is hazard **H5** from
§30.3: the price of §31.4's latch-free descent is that a page cannot be reused promptly, because some
thread may still be holding a stale pointer to it. Chapter 33 §33.6 works out how long you must
wait and why.

## 31.8 In real systems

> **Confidence: high on PostgreSQL; moderate on the others' internal details.**

**PostgreSQL's `nbtree`** is a textbook B-link tree and its `README` says so explicitly. The
mechanics map directly onto this chapter:

| This chapter | PostgreSQL |
|---|---|
| Right-link R(*P*) | `btpo_next` in `BTPageOpaqueData` |
| Left-link (scans only) | `btpo_prev` |
| High key HK(*P*) | the item at offset `P_HIKEY` = 1 |
| Move-right loop (§31.4) | `_bt_moveright()` |
| Descend, releasing the parent | `_bt_search()` with `_bt_relandgetbuf()` |
| Re-find a parent that itself split | `_bt_getstackbuf()` |
| Split steps 1–7 | `_bt_split()` |
| The window before step 8 | the `BTP_INCOMPLETE_SPLIT` page flag |
| Repair by whoever passes next | `_bt_finish_split()` |
| Two-stage deletion (§31.7) | `BTP_HALF_DEAD` then `BTP_DELETED`, in `_bt_pagedel()` |
| Root relocation via metapage | block 0, `btm_root` / `btm_fastroot` |
| Drop content latch, keep pin | `_bt_readpage()` into `BTScanPosData` |

Two PostgreSQL-specific additions worth knowing because they guard races the paper does not
consider:

**`btpo_cycleid`.** Background cleanup (Chapter 33) scans the index in **physical block order**, not
tree order, because it must visit every page and sequential I/O beats a tree walk. But a concurrent
split can move entries from a not-yet-scanned page to a page the scan has already passed, so the
scan would **miss** them — and §33.4 shows a missed index entry is a *correctness* bug, not just
bloat. `btpo_cycleid` stamps pages touched during the current cleanup cycle so the scan can detect
this and backtrack.

**Unique-index insertion is the one place a latch is held across a wait.** Checking uniqueness
requires following candidate heap pointers to see whether a conflicting row is *visible*, and if the
conflicting inserter has not committed, waiting on its transaction. This is inherently a global
assertion and there is no way around it; heavy contention on one unique key serializes hard.

**Others.** InnoDB uses latch coupling with index-level and page-level latches plus optimistic
descent rather than a pure B-link scheme *(moderate confidence)*. SQL Server's classic engine uses
latch coupling; its in-memory engine uses the Bw-tree (§34.11). Berkeley DB and LMDB take different
routes — LMDB's is Chapter 34's.

## 31.9 What came after

Lehman & Yao removed ancestor latching but **did not** remove §30.4's Cost 1: a reader still writes
to a shared latch word on every page it visits. Three lines of work attack that.

**OLFIT — Optimistic Latch-Free Index Traversal.** Cha, Hwang, Kim, Kwon, VLDB 2001. Each node has a
**version counter**. A reader: reads the version, reads the node, re-reads the version; if it
changed, retry. **Readers perform no writes to shared memory at all** — the version read is an
ordinary load, so no cache line is invalidated and Cost 1 disappears. Writers bump the version around
their modification. *(Confidence: moderate-high.)*

**Optimistic Lock Coupling (OLC).** Leis and colleagues generalized OLFIT into a simple, composable
discipline that can be applied to almost any tree, including ART (Volume 4 §21.6). This is close to
the modern consensus for in-memory index concurrency: **optimistic reads with version validation,
pessimistic writes.** It is far simpler than full lock-freedom and performs comparably or better.
*(Confidence: moderate.)*

**Fully latch-free: the Bw-tree.** §34.11, because its mechanism is Chapter 34's.

> **The honest summary of forty years:** the trajectory has been *fewer latches, held for less time,
> and finally none on the read path*. Lehman & Yao removed ancestor latches; OLFIT/OLC removed reader
> writes; Chapter 34 removes synchronization from reads entirely by removing mutation. Each step
> gives up something — L&Y gave up merging, OLC gives up read-path guarantees in favour of retries,
> immutability gives up space — and Chapter 35 tabulates what.

## 31.10 And the two Volume 2 debts

**Splay trees (Volume 2 §12.6).** Volume 2 said splay trees are unusable with concurrent readers.
With §30.4 in hand the reason is sharper than "every read is a write":

- A splay restructures the access path on **every access, including reads**. So two threads reading
  *different, disjoint* keys still both modify the tree, and both need **exclusive** latches. Read
  parallelism is exactly zero — not reduced, zero.
- Worse for Cost 1: the restructuring touches the **root** on every single access, so every read
  exclusively writes the hottest cache line in the structure. A splay tree's throughput is bounded
  by one operation per coherence round trip, for reads.
- And none of Chapter 34's techniques help, because the entire mechanism *is* in-place mutation on
  access.

Volume 2 §12.6's note about the Windows NT memory manager migrating from splay trees to AVL trees
now has a mechanism attached: lookups needed exclusive locking, and that is disqualifying for a
kernel structure on a multiprocessor.

**Skip lists (Volume 2 §13.7).** Volume 2 said randomization makes concurrency easier and left it
there. The reason is precise and it is a corollary of this chapter:

> **A skip list has no rebalancing operation.** Insertion splices a node into some prefix of the
> level lists; deletion unsplices it. There is no rotation, no split, no merge — **so there is no
> operation that transiently exposes a structurally inconsistent state**, and each level's linked
> list can be updated independently with a single CAS.
>
> Compare a balanced tree, where a rotation moves three pointers and any reader observing the middle
> of it sees a malformed tree. **The absence of rebalancing is the concurrency feature.** That is why
> Redis's sorted sets, LevelDB's memtable, and Java's `ConcurrentSkipListMap` use skip lists rather
> than balanced trees — not because skip lists are faster, but because they are *easier to make
> correct without latches*.

**And the Volume 2 §11.5 debt, in passing.** Volume 2 §11.5 claimed red-black recolouring is friendlier
to concurrent readers than rotation, since recolouring changes no pointer. That is now precise: a
reader traversing a tree during a **recolour** sees a structurally valid tree throughout, because
every parent/child link is untouched — only a flag differs, and the flag does not affect navigation.
A reader traversing during a **rotation** can observe a state in which the pointers do not form a
tree. This is why red-black trees bound *rotations* at a constant and let recolouring propagate,
and it is why `std::map` can promise iterator stability across insertions.

---

