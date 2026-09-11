# Trees: A Complete Guide to the Data Structure, From First Principles to Production Systems

## Volume 5 — Concurrency, Crash Safety, and Production Engineering

---

### The debts

Every structure in Volumes 1 through 4 was described as a single-threaded object whose writes always
complete. Both assumptions are false in every system any of this runs on, and the book has been
accumulating IOUs about it:

| Where | What was asserted and not justified |
|---|---|
| Volume 1 §3.2 | Deliberate structural sharing turns a tree into a DAG; "Volume 5 explains why that's powerful" |
| Volume 2 §11.5 | Red-black recolouring is safer for concurrent readers than rotation — asserted, not shown |
| Volume 2 §12.6 | Splay trees are unusable with concurrent readers |
| Volume 2 §13.7 | Skip lists are popular partly because randomization makes concurrency easier |
| Volume 3 §17.6 | Torn pages exist and need repairing — mentioned, never explained |
| Volume 3 §18.6 | Preemptive splitting exists for concurrency reasons |
| Volume 3 §18.9 | Real B-trees refuse to merge, because **content must only ever move rightward** |
| Volume 3 §19.6 | Backward scans need verify-and-retry; forward scans do not |
| Volume 3 §19.8 | The Linux maple tree replaced an rbtree partly for lock-free reads |
| Volume 3 §20.2 | B\*-trees died because redistribution is incompatible with the concurrency scheme |
| Volume 3 §20.3 | Full-page log images are counted in the write amplification budget, unexplained |
| Volume 4 §21.6 | HAMT bitmap nodes are "the foundation of immutable structural sharing" |
| Volume 4 §27.6 | Git's shared subtrees are the source of its efficiency |

**That rightward-movement claim has now been asserted five times across two volumes without proof.**
It gets one in §31.5, and then §31.6 discharges four of the rows above as corollaries of it, which
is the most satisfying thing in this volume: they are not four separate engineering decisions, they
are one theorem seen from four angles.

The volume's structure follows the three pressures that production imposes:

- **Chapters 30–31: concurrency.** What breaks when many threads touch one tree, and the algorithm
  that fixes it.
- **Chapter 32: durability.** What breaks when the power fails mid-write — two *different* problems
  that are usually conflated, needing two different fixes.
- **Chapter 33: maintenance.** Why trees only grow, and the cost/benefit of cleaning up now versus
  later.
- **Chapter 34: immutability.** The approach that solves concurrency and durability with one
  mechanism, and what it charges for that.
- **Chapter 35: how the three pressures conflict**, because they do, and the design space is choosing
  which one to under-serve.

Chapter numbering continues from Volume 4.

---

# Chapter 30 — The Concurrency Problem

## 30.1 The interleaving that produces a wrong answer

Start with the concrete failure, because it is the thing every technique in the next two chapters is
defending against.

Three actors: reader **R** searching for key 60, writer **W** inserting key 45, and a B-tree leaf
page **L** currently holding keys 10–70.

```
TIME    READER R                        WRITER W                    STATE OF L
────────────────────────────────────────────────────────────────────────────────────────
 t₁     read the parent page,                                        L = [10,20,30,50,60,70]
        find downlink → L,
        release the parent
                                                                     (R now holds only the
                                                                      block number of L, and
                                                                      NO LATCH on anything)
 t₂                                     descend to L, find it full
 t₃                                     SPLIT: allocate R', move     L  = [10,20,30]
                                        the upper half to R',        R' = [45,50,60,70]
                                        insert 45
 t₄     follow the downlink to L
 t₅     search L for 60:
        10,20,30 … not here
 t₆     RETURN "60 does not exist"                                   ← WRONG. It is on R'.
```

**A silent, timing-dependent wrong answer.** Not a crash, not a corrupted page, not an error the
caller can check — the query simply returns the wrong result, and only sometimes, and only under
load. This is the worst failure class a data system can have, and every mechanism in Chapter 31
exists to make this interleaving impossible.

The general shape of the hazard: **R made a decision at t₁ based on information that W invalidated
at t₃, and R had no way to detect that.**

## 30.2 The vocabulary you need first: latch versus lock

Before any solution, a distinction that the database literature is emphatic about and that almost
every informal discussion muddles. Goetz Graefe's survey "A survey of B-tree locking techniques"
(*ACM TODS*, 2010) makes it the centrepiece, and it is worth adopting.

| | **Latch** | **Lock** |
|---|---|---|
| Protects | the **physical integrity** of an in-memory structure | the **logical contents** from other transactions |
| Held for | nanoseconds to microseconds | until transaction commit |
| Granularity | a page, a node, a cache line | a row, a key range, a table |
| Deadlock handling | **avoided by protocol** (a fixed acquisition order) | **detected** by a lock manager, resolved by aborting |
| Appears in | the buffer manager | the lock manager, `pg_locks`, isolation levels |
| Logged? | no | (its effects are) |
| Owned by | a **thread** | a **transaction** |
| Typical implementation | mutex, rwlock, spinlock, version counter | a hash table of lock queues |

> **The B-tree concurrency problem in Chapters 30–31 is a *latching* problem, not a locking
> problem.** It is about keeping the pointers and the page layout coherent while several threads
> touch them. Transaction isolation — phantom reads, serializability, key-range locking — is a
> separate concern layered on top, and conflating the two is the standard error. When you read
> "lock coupling" in the literature it means **latch** coupling; the name is historical.

A second distinction, equally load-bearing and specific to paged structures:

| | **Pin** (buffer reference count) | **Content latch** |
|---|---|---|
| Prevents | the page being **evicted or recycled** | the page being **concurrently modified** |
| Cost to hold | almost nothing | blocks other threads |
| Typical duration | as long as you hold a pointer into the page | as short as possible |

These are independent, and the independence is exploited constantly. A scan can **drop the content
latch while keeping the pin**: copy the matching entries into a private array, release the latch so
writers can proceed, and keep the pin so the page cannot vanish underneath the pointer you still
hold. This is what lets an index scan return control to a query executor — which might take
milliseconds per tuple feeding a nested-loop join — without blocking every writer on that leaf.

## 30.3 The hazards, enumerated

Five distinct things can go wrong, and different mechanisms address different ones. Keeping them
separate matters, because a solution to one is often silently assumed to solve the others.

**H1 — Structural race (the §30.1 failure).** A thread acts on structural information (a downlink, a
sibling pointer, a page's key range) that another thread has invalidated. **Chapter 31.**

**H2 — Lost update.** Two writers modify the same page concurrently and one clobbers the other's
change — for example, both insert into the line-pointer array and one's `memmove` overwrites the
other's. Prevented by exclusive content latches. Straightforward.

**H3 — Torn read.** A reader observes a page mid-modification: `pd_lower` and `pd_upper` disagree
with the actual contents, or a line pointer points into the middle of a tuple body. In memory,
prevented by latches. **On disk, this becomes the torn-page problem, which latches cannot touch —
Chapter 32.**

**H4 — Deadlock.** Two threads acquire latches in opposite orders and wait forever. Prevented for
latches by imposing a **total order** on acquisition and never violating it. (For B-trees: always
downward, always rightward. Never up, never left.)

**H5 — Recycling hazard.** A page is deleted and reallocated for a different part of the tree while
some thread still holds a stale pointer to it. That thread then reads a structurally valid page full
of **completely unrelated keys**, and no consistency check catches it. **Chapter 33 §33.6** — and
note in advance that this hazard is created *by* Chapter 31's solution to H1.

## 30.4 Why "just use one big latch" fails, precisely

The trivially correct answer: one exclusive latch over the whole tree, taken by every operation.
Correct, and it makes the structure single-threaded.

The interesting question is not whether that is bad but **exactly which cost dominates**, because the
answer has changed over the decades and the modern answer is not the one textbooks give.

The textbook answer is "the root becomes a bottleneck because every operation touches it." That is
true but incomplete, and for a high-fanout B-tree it is nearly a red herring: Volume 3 §18.5
computed that with fanout 500, a **root split happens roughly once every four billion insertions**.
Exclusive access to the root is genuinely rare.

Here are the three costs that actually dominate.

### Cost 1 — cache-line contention on the latch word itself

This is the modern answer and it is the important one.

Acquiring even a **shared** latch is a read-modify-write on a shared memory location — an atomic
increment of a reader count, or a CAS on a state word. Atomic RMW requires the cache line holding
the latch to be in the executing core's cache in **exclusive** state, which means invalidating it
everywhere else.

```
  Cost of one atomic increment:

     line already exclusive in this core's L1        ≈  20 cycles   ≈  7 ns
     line held by ANOTHER core (must be transferred) ≈ 100–200 cyc  ≈ 40–70 ns
     line contended by MANY cores                    degrades further —
                                                      the line becomes a
                                                      serialization point
```

So the throughput of a single shared latch is bounded by roughly one acquisition per coherence
round trip:

$$
\frac{1}{70\text{ ns}} \approx 14 \text{ million acquisitions/second}
$$

**regardless of how many cores you have** — and in practice it *degrades* as cores are added, because
contention lengthens the transfer. A 64-core machine running 50 million index lookups per second
cannot get there through one shared latch on the root, even though every single one of those
operations only wants to *read*.

> **This is the crucial reframing.** The problem is not that readers conflict with each other
> logically — they do not. The problem is that **telling the system you are a reader is itself a
> write to shared memory.** Readers that need to announce themselves do not scale. Everything in
> §31 (and even more so in §34.4 and §34.11) is aimed at removing that announcement.

*(Confidence: moderate on the specific cycle counts, which vary by microarchitecture; high on the
phenomenon and on the conclusion.)*

### Cost 2 — holding a latch across an I/O

Worse in absolute terms, and much easier to reason about. Suppose you hold the parent's latch while
fetching the child page, and the child is not in the buffer pool:

```
  parent latch held for the duration of one NVMe read     ≈  50 µs
  parent latch held for the duration of one HDD read      ≈   8 ms

  If 64 threads want to insert into that subtree, they SERIALIZE:
      NVMe:   1 / 50 µs   =   20,000 operations/second, total
      HDD:    1 /  8 ms   =      125 operations/second, total
```

**A latch held across an I/O converts a parallel workload into a serial one at storage speed.** Any
acceptable scheme must be able to release the parent *before* fetching the child, which is precisely
what §30.1's failure shows is dangerous, and precisely what Chapter 31 makes safe.

### Cost 3 — you cannot hold a latch across a return to the caller

An index scan does not consume its own results. It hands them to a query executor which may spend
arbitrary time on each tuple. If the scan holds a leaf content latch across that boundary, every
writer to that leaf waits on the *consumer's* speed. §30.2's pin/latch split exists for this reason.

## 30.5 Lock coupling (crabbing), and its limits

The standard classical technique, and the one to understand before understanding what replaced it.

> **Lock coupling.** Latch the parent. Read the downlink. Latch the child. **Then** release the
> parent. Repeat. Two latches held at a time; the grip moves down the tree like a crab's claws,
> hence "crabbing."

Why hold the parent at all? Exactly to prevent §30.1: while you hold the parent's latch, no writer
can split the child *and install the new separator into the parent*, so the downlink you read cannot
become stale in a way that matters. The parent's latch is standing in for the missing ability to
detect staleness at the child.

**For readers**, shared latches suffice and the technique works. It costs Cost 1 and Cost 2 above.

**For writers**, it is worse, because a writer may need to *modify* the parent — inserting a
separator after a split. So it must hold the parent exclusively until it knows the child will not
split. The standard refinement:

> **Safe node rule.** A node is **safe** for the current operation if the operation cannot propagate
> past it: for insertion, if it is not full; for deletion, if it has more than the minimum
> occupancy. On reaching a safe node, **release all latches on its ancestors** — nothing above can
> be affected.

This works well in the common case, since with fanout 500 a node is nearly always non-full. But the
worst case is unbounded: if every node on the root-to-leaf path is full, the writer holds
**exclusive latches on the entire path, including the root**, for the duration of a cascading split.

**The optimistic variant** — descend with shared latches assuming no split will be needed; if the
leaf turns out to need one, release everything and **restart from the root** with exclusive latches.
Fast in the common case; but the retry costs a full descent, and under write contention on a hot key
range you can thrash, doing several full descents per successful insertion.

And Volume 3 §18.6's **preemptive (top-down) splitting** is the other classical answer, which I can
now explain properly:

> **Why preemptive splitting exists** (Volume 3 §18.6's debt, first payment). If you split *every*
> full node on the way down, then when a child splits its parent is guaranteed to have room, so a
> split **never cascades upward**. Therefore a writer **never needs to revisit an ancestor**, and
> therefore it can release each node's latch as soon as it descends past it — one latch at a time,
> no coupling, no held path.
>
> The price is measurably worse space utilization, because you split nodes that would have been
> fine. Volume 3 §18.6's table gave the trade; this is the reason the trade was worth considering.
> Chapter 31 makes it unnecessary, which is why modern implementations use reactive splitting.

## 30.6 What we actually need

Reading §30.4 and §30.5 together, the requirements are sharp:

1. **No ancestor latch held during descent** — so I/O and executor returns can happen freely
   (Costs 2 and 3), and so the root's latch is held for nanoseconds rather than across anything.
2. **No restarts from the root** — so contention cannot cause thrashing.
3. **A way for a thread holding stale structural information to detect that fact and recover
   locally** — since requirement 1 guarantees the information *will* go stale.
4. Ideally: **readers that do not write to shared memory at all** (Cost 1). Chapter 31 does not
   achieve this; §34.4 and §34.11 do.

Requirement 3 is the interesting one. It says: *put enough information on the page itself that a
thread arriving with an out-of-date pointer can tell, and can fix it up without consulting anything
above.* That is a strange-sounding requirement, and it has an elegant answer.

---

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

# Chapter 32 — Crash Safety

## 32.1 Two problems, and conflating them is the standard error

Chapter 31 made a tree safe against concurrent *threads*. This chapter makes it safe against the
power going out. There are **two separate problems**, they need **two different mechanisms**, and
nearly every informal treatment blurs them into one.

> **Problem A — Multi-page atomicity.** A split modifies three pages (the left page, the new right
> page, the parent) and sometimes a fourth and fifth (the right sibling's back-link, the metapage on
> a root split). **No storage device writes three pages atomically.** A crash between them leaves
> the tree structurally broken.

> **Problem B — Torn pages.** A *single* 8 KB page write is **also not atomic**. Devices guarantee
> atomicity per **sector** — 512 bytes or 4 KB — so an 8 KB page is two or sixteen independent
> writes. A crash mid-write leaves some sectors new and some old.

**Write-ahead logging solves Problem A and does not solve Problem B.** That single sentence is the
reason full-page writes exist, and §32.6 proves it. Keep the two problems separate as you read.

## 32.2 What Problem A actually looks like

Walk §31.3's split and enumerate the crash points, assuming for the moment that pages are written
back in an arbitrary order with no log. The split modifies **L** (upper half removed, high key
tightened, right-link set), creates **Q**, and modifies the **parent**.

```
CASE 1 — Q reached disk; L did not.

    L still holds all its keys and has no right-link to Q.
    Q exists as a page holding a duplicate copy of the upper half.
      → If the parent ALSO landed, the tree now contains those keys TWICE
        by two different paths.  SILENT DUPLICATE RESULTS.
      → If the parent did not land, Q is merely an orphan.  A leaked page.

CASE 2 — L reached disk; Q did not.            ◄── THE WORST ONE

    L has had its upper half REMOVED and its right-link SET to Q's block.
    Q's block contains whatever was there before — stale bytes, or nothing.

      → A reader that hits L's high key and follows the right-link reads
        ARBITRARY BYTES AS A PAGE HEADER.  pd_lower, pd_upper, the item
        count: all garbage.  The backend either faults, loops, or returns
        nonsense.
      → And the keys that were moved to Q are simply GONE.
        SILENT DATA LOSS.

CASE 3 — L and Q reached disk; the parent did not.

    This is EXACTLY §31.3's step-7-to-step-8 window.
    Q is unreachable by descent but reachable by L's right-link, and the
    move-right rule finds it.
      → CORRECT FOR READERS.  Nothing is lost.  (§32.9 exploits this.)

CASE 4 — The parent reached disk; L and Q did not.

    The parent holds a downlink to a block that was never initialized.
      → DANGLING DOWNLINK.  A descent walks into garbage.

CASE 5 — Root split: the metapage landed; the new root page did not.

    btm_root points at an uninitialized block.
      → The index is unusable from the very first lookup.
```

The taxonomy is worth naming, because the failure severities differ by orders of magnitude:

| Failure | Severity |
|---|---|
| **Orphaned page** | a leak — wasted space, no wrong answers |
| **Incomplete split** (Case 3) | **benign** — the Recovery Theorem covers it |
| **Dangling downlink** | reads uninitialized memory as structure |
| **Duplicate keys** | silently wrong results |
| **Lost keys** | **silent data loss** |

Case 3 being benign is not luck. It is a *designed* property of §31.3's ordering, and §32.9 shows
that designing for it removed an entire class of recovery bugs.

## 32.3 Write-ahead logging: the mechanism

> **The WAL rule.** Before a modified page is allowed to reach durable storage, a log record
> **describing that modification** must already be durable.

Two things follow, and the second is as important as the first:

**Correctness.** After a crash, replay the log forward from the last checkpoint. Every change that
might have reached the data files is described in the log, so every page can be brought to a
consistent state.

**Performance — and this is why WAL is used even where durability could be achieved otherwise.** The
log is **sequential**. WAL converts a burst of scattered random page writes into one append-only
stream, which Volume 3 §20.8 priced at 3–4× on NVMe and ~330× on rotating media. The random writes
still happen eventually, but at **checkpoint** time, where they can be sorted, batched, and
overlapped. WAL is a latency-to-throughput converter as much as a durability mechanism.

```
  WITHOUT WAL: a committing transaction must flush every page it touched,
               to scattered locations, before it can report success.

                 commit ──► 5 random 8 KB writes, fsync'd  ≈ 5 × 50 µs serial

  WITH WAL:      a committing transaction flushes ONE contiguous log region.

                 commit ──► 1 sequential write + fsync     ≈ 1 × 50 µs
                            (and group commit amortizes even that
                             across concurrent transactions)
```

## 32.4 The enforcement point: why the LSN lives on the page

The WAL rule is a claim about *ordering between two subsystems* — the log writer and the buffer
manager's page evictor. Something has to enforce it, at the moment a page is about to be written.

The mechanism (Volume 3 §4.3 introduced the field without explaining it): **every page carries
`pd_lsn`, the log position of the last change made to it.** Then the buffer manager's page-write
path is:

```
    flush_page(P):
        XLogFlush(P->pd_lsn)        ← ensure the log is durable up to this point
        write(P)                     ← only now may the page go out
```

> **Why per-page, and not in a side table?** Because the check must be available **at the moment of
> eviction, for that specific page, with no additional lookup and no additional I/O.** A side table
> would need its own durability (chicken and egg), its own lookup on the hottest path in the buffer
> manager, and its own concurrency control. Putting the LSN in the page makes the page
> **self-describing**: it carries its own durability precondition. Nothing else needs to be
> consulted.

The same field does double duty during recovery: redo is made **idempotent** by comparing
`record.lsn` against `page.pd_lsn` and skipping records already reflected in the page. That
idempotence is what lets recovery be interrupted and restarted arbitrarily — which matters, because
crashes during recovery are not rare.

Hold onto that second use. §32.6 turns on it.

## 32.5 ARIES: how recovery actually runs

> **Confidence: high.** C. Mohan, Don Haderle, Bruce Lindsay, Hamid Pirahesh and Peter Schwarz,
> "ARIES: A transaction recovery method supporting fine-granularity locking and partial rollbacks
> using write-ahead logging", *ACM TODS* 17(1), 1992. Developed at IBM Almaden; the design
> essentially every WAL-based system uses.

Three phases:

```
  1. ANALYSIS   Scan forward from the last checkpoint.
                Reconstruct the dirty page table (which pages might be stale on disk)
                and the transaction table (which transactions were in flight).
                In-flight transactions are "losers" — they must be rolled back.
                Determine the earliest LSN redo must start from.

  2. REDO       Scan forward, reapplying EVERY logged update — including the updates
                of loser transactions.  Idempotent via the pd_lsn check (§32.4).
                                                                  ↑
                                                    "REPEATING HISTORY"

  3. UNDO       Scan backward, rolling back the losers, writing a
                COMPENSATION LOG RECORD (CLR) for each undone action so that
                the undo work is itself redoable and never performed twice.
```

**"Repeating history" is the counterintuitive part and it is the central idea.** Why redo the work
of transactions you are about to abort?

Because it restores the database to **exactly the physical state it was in at the instant of the
crash.** Undo can then operate against a known state. Without repeating history, undo would first
have to determine *which* of a loser's updates had actually reached disk and which had not — the
same unbounded problem WAL was invented to avoid. Repeating history makes redo's job purely
mechanical (apply everything, skip what's already applied) and undo's job purely logical (reverse
these operations, in this order).

**CLRs make undo crash-safe.** If the system crashes during recovery, the next recovery attempt sees
the CLRs, knows those undos are done, and does not repeat them. Recovery is therefore restartable —
which it must be.

### Physiological logging

> **Confidence: moderate-high on the term's attribution to Jim Gray.**

How much detail does a log record contain? Three options:

| Style | A record says | Size | Problem |
|---|---|---|---|
| **Physical** | "bytes 1234–1250 of block 42 become `<bytes>`" | large | huge for structural changes |
| **Logical** | "insert row (5,'foo') into table t" | tiny | **redo must reproduce identical physical decisions** |
| **Physiological** | "on block 42, insert this tuple at offset 7" | small | — |

**Physiological logging — "physical to a page, logical within a page" — is what everyone uses**, and
for B-trees the middle row's problem is acute. Volume 3 §17.7 and §18.3 described split-point
selection as a *heuristic* depending on the page's exact contents, on whether the page is rightmost,
and on how much suffix truncation each candidate boundary permits. Logging "split this page"
logically would require redo to **re-run that heuristic and reach a bit-identical answer** — across
versions, across platforms, across configuration changes.

So B-tree WAL records are more physical than heap records: a split record enumerates exactly which
entries go left and which go right, rather than asking redo to decide. **The price of a clever
heuristic on the write path is a more explicit log record.**

## 32.6 Full-page writes: why WAL cannot fix Problem B

Now Problem B, and the argument that this is not merely inefficient but *impossible* to fix with
deltas.

### What a torn page is

```
An 8 KB page being written; the device commits 4 KB sectors independently.
Power fails after the first sector.

   ┌──────────────── sector 0 (4 KB) ────────────────┬──── sector 1 (4 KB) ────┐
   │ NEW  pd_lsn, pd_lower, pd_upper, line pointers  │ OLD  tuple bodies       │
   └─────────────────────────────────────────────────┴─────────────────────────┘
     ↑ says "there are 368 items, data starts at 2104"   ↑ contains 367 items'
                                                           worth of bytes, at
                                                           the OLD offsets

   Line pointer 368 points at byte 2104, which contains STALE FREE SPACE.
   pd_lower and pd_upper describe a layout the page does not have.
```

**The page is not stale. It is unparseable.** It is a state that no correct execution ever produced —
a chimera of two versions, self-inconsistent.

### Why delta replay cannot repair it

Recall §32.4: a normal WAL record is a **delta** ("insert this tuple at offset 7 on block 42"), and
applying it requires two things:

1. The page must be **readable and parseable**, so the delta has something to attach to.
2. The page's **`pd_lsn` must be meaningful**, so redo can tell whether the change is already
   applied.

**A torn page has neither.** And the second failure is the lethal one:

> **The sharpest version of the argument.** `pd_lsn` lives in the **first 8 bytes of the page** — so
> it is in sector 0. A torn page can therefore have a **new `pd_lsn` and old contents**.
>
> Redo consults `pd_lsn` to decide whether a record has already been applied. Seeing a `pd_lsn`
> greater than or equal to the record's LSN, **redo skips the very record that would have fixed the
> page.**
>
> The page is permanently corrupt, and **recovery reports success.**

You cannot patch a page you cannot read, and you especially cannot patch a page that is lying to
you about how up to date it is.

### The fix: log the whole page

> **Full-page writes.** The **first** modification of any page after each checkpoint logs the
> **entire page image** rather than (or in addition to) a delta. On redo, that image is written
> **wholesale**, replacing whatever is there.

Replacement rather than patching. It does not need the page to be parseable, and it does not consult
the page's LSN — it overwrites it. Subsequent deltas in the same checkpoint interval then apply on
top of a known-good base.

```
  Checkpoint ─────────────────────────────────────────► next checkpoint
      │
      ├─ page 42 modified 1st time  → FULL 8 KB IMAGE logged
      ├─ page 42 modified 2nd time  → ~150-byte delta
      ├─ page 42 modified 3rd time  → ~150-byte delta
      │  ...
      └─ (after the next checkpoint, page 42's next touch pays the image again)
```

## 32.7 The cost, and why it makes random keys expensive twice over

Full-page writes are not cheap. A 20-byte index insert can generate an 8 KB log record.

**But it amortizes if pages are hot.** If a page is modified *k* times per checkpoint interval:

$$
\text{WAL bytes per modification} = \frac{8192 + 150(k-1)}{k}
$$

| *k* (modifications per page per checkpoint) | WAL bytes per modification |
|---|---|
| **1** | **8,192** |
| 10 | 954 |
| 100 | 232 |
| 1,000 | 158 |

And now recall Volume 3 §20.3, which found the same fork in the road for *data* writes:

| Insert pattern | Pages touched | *k* | WAL per insert |
|---|---|---|---|
| **Random keys**, index ≫ RAM | a different page every time | **≈ 1** | **≈ 8 KB** |
| **Sequential keys** | the same rightmost page, ~160 rows before it fills | **≈ 160** | **≈ 200 B** |

> **Random keys are expensive twice: once in the data files (Volume 3 §20.3's ~500× write
> amplification) and again in the log (a 40× penalty here).** The two effects have the same cause —
> no locality means no amortization — and they compound. This is now the third independent argument
> in this book for time-ordered identifiers over random UUIDs, and they are not the same argument
> restated; they are separate costs that happen to share a root cause.

### The tuning consequences

Everything above turns into three real knobs:

| Knob | Effect | Cost of pushing it |
|---|---|---|
| Longer checkpoint interval | fewer checkpoints → fewer full-page images → less WAL | **longer crash recovery** |
| `wal_compression` (pglz / lz4 / zstd) | compresses full-page images specifically | CPU; usually a clear win, since index pages are mostly similar keys and structured padding and compress well |
| `full_page_writes = off` | eliminates the cost entirely | **only safe on storage guaranteeing atomic 8 KB writes.** Getting this wrong produces silent, unrecoverable corruption — visible only after a crash, in one page, possibly months later. |

WAL volume characteristically **spikes immediately after each checkpoint** and decays until the next
one, as pages pay their image toll one by one. If you have ever seen a sawtooth in a WAL-generation
graph, that is what it is.

## 32.8 Hint bits: the elegant exception, and how checksums close it

An instructive edge case, because it shows the boundary of the whole scheme.

Chapter 33 will introduce **hint bits** — marks a scan leaves on an index page recording "this entry
is dead" (§33.3 layer 1). These are **not WAL-logged**. If a crash loses them, the only cost is a
redundant future check. Logging them would add WAL volume for information that is cheap to
recompute, so not logging them is correct.

**But turn on page checksums and the exception closes.** Any change to a page changes its required
checksum. So a torn page whose only change was a hint bit now **fails checksum validation and is
reported as corruption** — a false alarm caused by an optimization.

Therefore, with checksums enabled (or `wal_log_hints` set), hint-bit changes **do** trigger a
full-page write after all.

> **This is the cleanest illustration in the volume of how these mechanisms interact.** The cheap
> optimization was available *only as long as you were not also asking for a stronger integrity
> guarantee*. You get to choose which you want, and the system will not let you have both for free.
> Chapter 35 argues this shape is general.

## 32.9 Recovery must never modify the tree

Now the architectural payoff of §31.3's deliberate separation of steps 7 and 8, and it is a large
one.

Recall §32.2 Case 3: L and Q written, parent not. §31.5's Recovery Theorem says this state is
**correct for readers**. So recovery has a choice:

**Option 1 — recovery completes the split.** Replay the two-page record, then insert the missing
separator into the parent. This is what PostgreSQL did before version 9.4, and every part of it is a
problem:

- Recovery runs in a context where it **cannot allocate pages freely** (the free space map is not
  yet trustworthy).
- It **cannot take normal latches** (the buffer manager is in a special startup state).
- It **cannot fail** — there is no "abort recovery and try something else."
- And it is **impossible on a hot standby**, which is replaying continuously *while serving read
  queries*, so a structure-modifying replay action would race live readers.

**Option 2 — recovery leaves the incomplete split, and normal operation repairs it.** Mark the left
page with a flag (`BTP_INCOMPLETE_SPLIT`). Any later operation that descends through the parent and
notices the flag calls a routine to insert the missing downlink (`_bt_finish_split`). **The repair is
performed by whoever next passes by**, in full normal operating conditions, with normal latching,
and able to fail and retry.

PostgreSQL moved from Option 1 to Option 2 in version 9.4, and the resulting property is worth
stating as a design principle:

> **Recovery never modifies the tree's structure. It only replays page images and deltas.**
>
> Structural repair is deferred to normal runtime, driven by a flag on a page. This removed an
> entire class of recovery bugs and is what makes hot-standby replay of index changes tractable at
> all.

*(Confidence: high on the change and the version; moderate on the complete list of motivations.)*

Note the shape: this is **deferred repair**, and it is the same move as Volume 3 §18.9 (defer
merging), Volume 3 §20.6 (defer reconciliation to compaction), and Volume 4 §22.4 (lazy propagation).
Chapter 33 is about the family.

## 32.10 One real implementation, concretely

PostgreSQL's `nbtree` defines its own WAL record types. The list is worth seeing because it maps
one-to-one onto Chapter 31's operations:

| Record | Operation | Chapter reference |
|---|---|---|
| `XLOG_BTREE_INSERT_LEAF` | insert on a leaf page | Volume 3 §18.3 |
| `XLOG_BTREE_INSERT_UPPER` | insert a separator on an internal page | §31.3 step 8 |
| `XLOG_BTREE_INSERT_META` | insert plus a metapage update | §31.6.5 |
| `XLOG_BTREE_SPLIT_L` / `_R` | a page split; the suffix records which side the new item landed on | **§31.3 steps 1–6, as ONE record covering both pages** |
| `XLOG_BTREE_NEWROOT` | root split | §31.6.5 |
| `XLOG_BTREE_DEDUP` | a deduplication pass on a page | Volume 3 §20 territory |
| `XLOG_BTREE_VACUUM` | background cleanup removing items | §33.3 layer 4 |
| `XLOG_BTREE_DELETE` | targeted index tuple deletion | §33.3 layers 2–3 |
| `XLOG_BTREE_MARK_PAGE_HALFDEAD` | §31.7 stage 1 | §31.7 |
| `XLOG_BTREE_UNLINK_PAGE` / `_META` | §31.7 stage 2 | §31.7 |
| `XLOG_BTREE_REUSE_PAGE` | a recycled page is about to be reused | §33.6 |

Two of these deserve comment.

**The split is one record covering both pages.** L and Q are made consistent atomically with respect
to redo — which eliminates §32.2's Cases 1 and 2 outright. The **parent insertion is a separate
record**, which deliberately leaves Case 3 reachable, which §32.9 explained is the point.

**`XLOG_BTREE_REUSE_PAGE` exists for replicas, and it is a nice illustration of a distributed
subtlety.** On the primary, whether a deleted page may be recycled is checked against the *primary's*
oldest snapshot (§33.6). But a hot standby may be running **older** queries that the primary knows
nothing about, and recycling a page under one of them is hazard H5 from §30.3. So the record tells
the standby "I am about to reuse this page", and the standby must either **delay replay** or **cancel
the offending query**. That is the mechanism behind `max_standby_streaming_delay` and the
"canceling statement due to conflict with recovery" error that surprises people.

> The general lesson: **a visibility horizon is a local fact, and replication makes it a distributed
> one.** Any deferred-reclamation scheme (Chapter 33) that is replicated has to reconcile two
> horizons, and the reconciliation shows up either as replication lag or as cancelled queries.
> There is no third option.

## 32.11 The alternative: shadow paging and copy-on-write

Everything above assumes **in-place update plus a log**. There is a completely different answer, and
it is the one filesystems tend to pick.

> **Copy-on-write / shadow paging.** Never overwrite a page. To modify a leaf, write a **new** copy
> of it to a free block; then write a new copy of its parent pointing at the new leaf; and so on up
> to the root. Finally, **atomically flip a single pointer** to the new root.

Only the final flip needs to be atomic, and that is achievable: make it a single-sector write, and
double-buffer it so that a torn flip still leaves a valid previous version.

```
  BEFORE                              AFTER updating one leaf

     ROOT ──────┐                        OLD ROOT ────┐      NEW ROOT ───┐
                │                                     │                  │
        ┌───────┴───────┐                     ┌───────┴──┐        ┌──────┴───────┐
        A               B                     A          B        A*        B'
      /   \           /   \                 /   \      /  \      (shared)   /  \
     L1   L2         L3   L4               L1   L2   L3   L4              L3*  L4'
                                                                                  ↑ new copy

  * = SHARED between the two versions.  Only the path from the changed leaf
      to the root is copied — h pages.  Everything else is shared.

  Both roots remain valid → the old one IS A SNAPSHOT, for free.
```

**What this buys:**

- **No log at all** is needed for structural integrity. There is no window in which the tree is
  inconsistent, because the new version is never referenced until it is complete.
- **No torn pages in the tree** — a torn *new* page is simply never referenced, since the root flip
  never happened. Only the superblock needs torn-write protection, and it is small and
  double-buffered.
- **Recovery is instantaneous**: read the newer valid superblock. No log replay, no analysis phase,
  no redo, no undo. Startup time is constant regardless of how much was in flight.
- **Snapshots and MVCC are free.** Retaining an old root *is* a snapshot. One mechanism delivers
  crash safety, snapshots, and multi-version reads.

**What it costs:**

- **Write amplification**: modifying one leaf writes *h* pages, not one. Volume 3's four-level tree
  means four page writes per update.
- **Space retention**: old versions cannot be freed until no reader holds them — which is Chapter
  33's problem, arriving by a different route.
- **Free-space management becomes the hard part.** Every write needs a free block, and blocks are
  freed non-contiguously as versions expire. LMDB's free list and ZFS's space maps are substantial
  pieces of engineering.
- **Fragmentation.** Pages move on every write, so any sequential layout degrades over time — a
  well-known and genuinely difficult issue for CoW filesystems.
- **Usually a single writer**, because two concurrent CoW writers would both want to copy the shared
  path to the root and would conflict there.

**Real systems:** **LMDB** (Howard Chu) is the purest example — a memory-mapped CoW B+tree with two
alternating meta pages, a single writer, and lock-free readers; it has no WAL and needs no recovery
process. **ZFS** keeps a ring of uberblocks with transaction-group numbers and picks the highest
valid one. **Btrfs** uses superblocks with generation numbers. §34.7 returns to these, because CoW is
immutability, and Chapter 34 is about what immutability gives you generally.

### The comparison, and it is closer than you would guess

| | **WAL + in-place** | **Copy-on-write** |
|---|---|---|
| Page writes per leaf update | 1 | ***h*** (≈ 4) |
| Log writes per update | 1 record (~150 B), **or 8 KB on first touch after a checkpoint** | **none** |
| Effective writes, first touch | ~2 pages' worth (page + full-page image) | ~4 pages |
| Log required | **yes** | **no** |
| Recovery time | replay from checkpoint: seconds to minutes | **instant** |
| Torn-page repair | full-page writes | **not applicable** |
| Snapshots | separate mechanism | **free** |
| MVCC | separate mechanism | **free** |
| Concurrent writers | **many** | usually **one** |
| Fragmentation over time | low | **high** |
| Free-space management | moderate | **hard** |

Read the "effective writes" row. Because full-page writes make WAL's first touch of a page cost
roughly two pages' worth of I/O, the gap against CoW's four is a factor of two, not a factor of ten
— and CoW throws in snapshots, MVCC, and instant recovery.

> **That is why the two lineages split by domain rather than by merit.** Databases, which need many
> concurrent writers and low fragmentation, chose WAL. Filesystems, which want snapshots and instant
> mount after a crash and can tolerate a single writer per transaction group, chose copy-on-write.
> Neither is a compromise; each is the right answer to a different weighting.

---

# Chapter 33 — Maintenance: Why Trees Only Grow

## 33.1 The asymmetry

Volume 3 §17.3 established a pleasing fact: the minimum-occupancy invariant is **self-maintaining
under insertion**, because a split's natural output is exactly two half-full pages. No extra work is
needed to preserve it.

It also flagged the other half: **I2 is not self-maintaining under deletion.** Removing a key can
drop a page below the minimum, with no natural repair. Volume 3 §18.7 gave the textbook repairs —
borrow and merge — and §31.6.1 has now proved that **both are forbidden**, because both move keys
leftward and would break the Recovery Theorem.

So the situation is:

```
  INSERT:  splits CREATE pages.        Self-maintaining.  Cheap.
  DELETE:  nothing DESTROYS pages,     Repairs forbidden. So: nothing happens.
           except total emptiness.
```

**A B-tree grows and does not shrink.** A page that loses 95% of its entries stays at 5% occupancy
indefinitely. This is **index bloat**, and it is not a bug, an oversight, or an unfinished feature.
It is the price of §31.4's latch-free descent, paid in space.

And it compounds with a second, independent problem.

## 33.2 The index does not know what is dead

This one is specific to multi-version concurrency control, and it is worth deriving carefully because
it is the reason cleanup is *asynchronous* rather than merely *deferred*.

Under MVCC, a `DELETE` does not remove a row. It marks the row version with the deleting
transaction's identifier. The version must remain visible to any transaction whose snapshot predates
the delete, and becomes removable only when **no snapshot anywhere in the system could still need
it**.

Now look at what an index entry contains:

```
    ┌─────────────────────────────────────────┐
    │  key   │  pointer to the row (page,slot)│
    └─────────────────────────────────────────┘
                    ↑
        THAT IS ALL.  No transaction id.  No visibility information
        of any kind.
```

Therefore, examining the index **in isolation**, you cannot determine whether any given entry is
dead. Answering "is this entry removable?" requires:

1. Fetching the heap page the pointer names, and
2. Comparing that row version against the **oldest snapshot in the entire cluster** — which depends
   on transactions this backend knows nothing about, some of which have not finished.

> **Consequence: synchronous, in-transaction index cleanup is structurally impossible.** The
> deleting transaction does not yet know whether the entry is removable, because that depends on
> other transactions that are still running. It is not that cleanup is *deferred for efficiency*; it
> is that the information required to do it does not exist yet.

### Why indexes carry no visibility information

This is a deliberate design choice, not an accident, and the alternative is worse:

| If indexes carried visibility info | Cost |
|---|---|
| Every entry grows by 8–16 bytes | fanout drops → Volume 3 §17.6's arithmetic → **taller trees** |
| Entries must be updated on **commit** and on **abort** | a transaction touching *k* rows with *m* indexes writes *k*·*m* index pages at commit |
| Entries must be updated as the **visibility horizon advances** | a background process rewriting index pages continuously |

The chosen alternative is to keep indexes ignorant and reconcile later. Everything in the rest of
this chapter is a consequence of that choice.

## 33.3 The five-layer architecture

Real systems do not have "a cleanup algorithm". They have a **stack of layers**, ordered from
nearly-free-and-narrow to expensive-and-thorough. Understanding *why* it is layered is more useful
than memorizing the layers, so here is the principle first:

> **The layers are ordered by cost and by coverage, and the two are inversely related.**
> Opportunistic layers cost almost nothing but only see what ordinary traffic happens to visit.
> Background layers see everything but must scan everything. **A production system runs all of them
> because their coverage is complementary** — the cheap layers handle the common case and the
> expensive one is the backstop that guarantees correctness.

### Layer 1 — Opportunistic hint marking (free)

When an index scan follows a pointer to a row and finds that row dead to all transactions, it marks
the *index* entry as dead on the way back.

**Cost: essentially zero.** The information was obtained anyway — the scan had to fetch and check the
row regardless. The mark is a flag on a line pointer.

**It is a hint, not a fact of record.** Not WAL-logged (§32.8), so it can be lost on a crash; losing
it costs one redundant future check. This is the cheapest possible cleanup and it is free precisely
because it is a byproduct.

**Coverage: only entries that a scan happens to visit.** An index nobody queries is never cleaned by
this layer at all.

### Layer 2 — Kill-before-split (the highest-leverage layer)

When an insertion finds the target leaf full, **before splitting**, it checks for entries marked
dead by layer 1. If there are any, it removes them and compacts the page, and the insertion proceeds
**without splitting**.

> **This is the single most valuable cleanup in the system**, and the reason is timing. It converts
> "the index permanently grows by one page" into "the index reuses space it already had" — at the
> exact moment when that matters, at no scheduling cost, with no background process involved, and
> without holding any latch it was not already holding.
>
> A workload that deletes and re-inserts within the same key range can run **indefinitely with a
> stable index size** on layers 1 and 2 alone.

### Layer 3 — Targeted deletion on overflow

Layers 1 and 2 only help if a *scan* visited the entries. Version churn from `UPDATE`s produces dead
index entries that no scan ever looks at — an index on a column that never changes still accumulates
one dead entry per update of the row.

So: when a leaf is about to overflow **and** the index's logical contents are not actually changing
(the same logical rows keep getting new versions), speculatively visit the relevant heap pages to
determine which entries are dead versions of rows that also have a live version, and delete those.

**The distinguishing feature is the trigger: page overflow, not a garbage threshold.** It is a
last-resort attempt to avoid a split, and it is willing to spend heap I/O to do it — because a split
is *permanent* and the I/O is not. That asymmetry is the justification.

*(In PostgreSQL this is "bottom-up index deletion", added in version 14. It depends on an earlier
change — treating the row pointer as an implicit final key column — which made locating a specific
entry among many duplicates O(log n) instead of O(run length).)*

### Layer 4 — Background bulk cleanup

A background process collects the set of dead row pointers, then scans each index and removes every
entry referencing one of them.

Two implementation details that are more interesting than they look:

**It scans in physical block order, not tree order.** It does not descend the tree at all. Since it
must visit every page anyway, a sequential sweep of the whole file beats a tree traversal with random
access — Volume 3 §15.4's sequential-versus-random argument, applied to maintenance.

**Which creates a race that Chapter 31 caused.** A concurrent split can move entries from a
not-yet-scanned page to a page the sweep has already passed, so the sweep would **miss** them — and
§33.4 shows a missed entry is a *correctness* bug. This is what PostgreSQL's `btpo_cycleid` guards
(§31.8): pages touched during the current cycle are stamped, so the sweep can detect the situation
and backtrack.

### Layer 5 — Page deletion, for completely empty pages only

§31.7's two-stage protocol: half-dead (downlink removed from the parent), then dead (sibling links
spliced around it), then — eventually — recycled (§33.6).

Note how much weaker this is than merging. **The page must be *entirely* empty.** A page holding one
entry out of a possible 400 is left alone forever. That is the §31.6.1 constraint showing up as an
operational limit.

## 33.4 The constraint that makes all of this mandatory

Everything above could be read as "cleanup is an optimization; skip it and you waste space." That
reading is wrong, and this section is why.

> **Row pointers are recycled.** When the background process frees a heap line pointer, that slot can
> later be reused for a **completely different row**.
>
> If an index entry pointing at that pointer still existed, an index scan would follow it, fetch a
> **real, live, visible row that has nothing to do with the indexed key**, and return it. Not an
> error. Not a null. A plausible-looking wrong row.

This is the worst failure mode in the entire book: **silent wrong answers, with no error, no
corruption detectable by any consistency check, and no way for the application to notice.**

It dictates the phase ordering of the background process, absolutely:

```
    PHASE 1:  scan the heap, collect the set of dead row pointers.
    PHASE 2:  clean EVERY index, removing all entries referencing those pointers.
              ↑ every index. Not some. Not the ones that look dirty.
    PHASE 3:  ONLY NOW free the heap line pointers for reuse.
```

> If you have ever wondered why a vacuum process cannot be reordered, partially skipped, or
> interrupted-and-resumed-from-the-middle-of-phase-2, this is the reason. **Phase 2 is a correctness
> barrier, not a housekeeping step.** And it is why an index that cannot be cleaned — because it is
> corrupt, or locked, or on unreachable storage — blocks reclamation of the whole table.

This also explains why the layered architecture of §33.3 has a **mandatory** bottom layer. Layers 1–3
are optimizations and may do nothing. Layer 4 must run, or the system eventually cannot reclaim
anything at all.

## 33.5 Free space maps, and why index ones are different

Reclaimed space has to be findable. The standard mechanism is a **free space map** — a compact
per-relation structure recording available space per block, so a would-be writer can find a
suitable page without scanning.

**For indexes it does something narrower, and the reason is instructive.**

In a heap, a new row can go on *any* page with room. Placement is free, so tracking *partial* free
space is useful: "block 5,000 has 3 KB available" is actionable.

In a B-tree, **a tuple's placement is determined entirely by its key.** So:

> Knowing that block 5,000 has 3 KB free is **worthless** if your key belongs on block 12,000.
> **Space in the wrong place is not space.**

Therefore an index's free space map tracks only **entirely free, recyclable pages** — it is
effectively a free list of whole blocks, consumed when the tree needs to allocate. And it follows
directly that **intra-page free space in an index can only ever be reclaimed by an insertion whose
key lands on that specific page**, which is exactly why §33.3's layer 2 is so valuable and why bloat
in a shifting key distribution is so persistent.

## 33.6 Deferred recycling: the bill for Chapter 31

Here is the most direct causal link in this volume, and §31.7 promised it.

Recall §31.4: a descending thread **releases the parent's latch before latching the child**, so it
holds a block number while holding no latch. That was the whole point.

Now suppose page X is deleted (§31.7 stages 1–2) and **immediately reallocated** as a new page
elsewhere in the tree:

```
    Reader holds a stale block number for X, obtained before the deletion.
    Meanwhile X is deleted and re-allocated as a leaf in a distant part
    of the keyspace, and filled with unrelated keys.

    The reader latches X and applies the move-right rule:
        the page is structurally VALID
        the high key is a real high key
        the right-link points somewhere real
        → the check passes or fails ARBITRARILY, on unrelated data.

    NOTHING DETECTS THIS.  §30.3 hazard H5.
```

So the page cannot be recycled immediately. The protocol is:

> Record, on the deleted page, the transaction identifier at the moment of deletion. The page becomes
> **recyclable** only when the system can prove that **no transaction that existed at that moment is
> still running** — i.e. the visibility horizon has advanced past it. Only then does it go to the
> free space map.

In the interim it is a fully allocated page occupying disk that nothing can use. **A third category:
not live, not free, waiting.**

> **The trade, stated plainly: §31.4 bought latch-free descent by allowing threads to hold stale
> pointers. §33.6 is the invoice — you cannot reuse a page until every possible holder of a stale
> pointer to it has gone away.** These are not two independent design decisions. They are one
> decision and its consequence.

And §32.10 already noted the distributed complication: on a replica, the relevant horizon is the
*replica's*, which may be older. Hence replication lag or cancelled queries; there is no third
option.

## 33.7 Online versus offline cleanup: the actual trade

The book has now used deferred cleanup five times (Volume 1 §1.4's tombstones, Volume 3 §18.9,
Volume 3 §20.6's compaction, Volume 4 §22.4's lazy propagation, §32.9's deferred split repair). It is
time to derive the trade properly rather than keep asserting it is a good idea.

Let cleanup work accumulate at rate *r* (bytes of reclaimable space produced per second) and be
performed in batches every *T* seconds.

**Steady-state bloat.** Space is consumed continuously and reclaimed periodically, so:

$$
\text{steady-state bloat} \approx r \times T
$$

**Bloat is directly proportional to the cleanup interval.** Double the interval, double the wasted
space. This is the whole of capacity planning for a deferred-cleanup system, in one line.

**Peak cleanup load.** Each run must process *r*·*T* worth of work in some duration *d*, so the
instantaneous I/O demand during a run is:

$$
\text{peak load} \approx \frac{r \times T}{d}
$$

**A longer interval means a bigger, spikier job** competing with foreground traffic.

**Total work.** Here the naive analysis is wrong in an interesting way. Deferring does not merely
move the same work later — it genuinely *reduces* it, for two reasons:

1. **Batching converts random I/O into sequential I/O** (§33.3 layer 4's physical-order sweep).
2. **Some work is never done at all**, because it was made unnecessary. Reclaim a page eagerly and
   the next insertion may split it again immediately; wait, and you may find the space was re-used
   in place. Volume 4 §22.4's lazy propagation is the pure form of this: work deferred into a
   subtree nobody ever visits is work never performed.

So:

| | **Online** (in the writer's path) | **Offline** (background) |
|---|---|---|
| Who pays the latency | **the writer** | nobody, directly |
| Latency profile | uniform, slightly higher | **low, with periodic spikes** |
| Total work done | higher — some is immediately undone | **lower** — batched and sometimes elided |
| I/O pattern | random | **sequential** |
| Space overhead | ~none | ***r* × *T*** |
| Latches required | multiple pages — **often forbidden (§31.6.1)** | one page at a time |
| Tuning burden | none | **substantial** — it becomes a discipline |
| If it falls behind | cannot | **unbounded bloat, then correctness limits (§33.4)** |

> **The summary: deferring cleanup lowers total work and smooths writer latency, and pays for both
> in space and in operational risk.** The space cost is *r*·*T* and is predictable. The operational
> risk is that the cleaner becomes load-bearing infrastructure whose failure mode is unbounded
> growth — and, because of §33.4, eventually a hard stop rather than a gradual degradation.

The most common production pathology follows directly: **anything that pins the visibility horizon
stops reclamation entirely.** A long-running transaction, an abandoned replication slot, an idle
session holding a snapshot — each makes *r* effectively positive and *T* effectively infinite, and
bloat grows without bound while the cleaner runs dutifully and reclaims nothing. **This is precisely
the classic garbage-collection pathology of a live reference preventing collection**, and §34.8
makes that identification exact.

## 33.8 The best cleanup is the write you never make: HOT

Everything above is about cleaning up index entries after the fact. There is a better idea: **do not
create them.**

The problem: under MVCC, an `UPDATE` creates a new row version at a new location. A new location
means every index on the table needs a new entry pointing to it. So updating one unindexed column on
a table with six indexes writes one heap tuple **and six index entries**, at six random locations in
six different files, each dirtying a page, each generating WAL, each paying §32.7's full-page toll —
for a change no index's contents depend on.

**The optimization.** Perform a **heap-only tuple** update when two conditions both hold:

1. **No indexed column changed.** Checked against every column of every index on the table, plus
   index expressions and partial-index predicates.
2. **The new version fits on the same heap page** as the old one.

If both hold, write the new version on the same page and chain it from the old row's line pointer.
**No index is touched at all.** Existing index entries still point at the original line pointer, and
a scan arriving there follows the chain within the page to find the version its snapshot should see.

```
  Heap page 42, after two such updates:

    line pointers:  [1]────┐    [2]───┐    [3]───┐
                           │          │          │
    versions:            v1 ──chain──► v2 ──────► v3  (current)

    The index still points at line pointer 1.  It has NEVER been updated.
```

**The failure modes are the interesting part**, and both are actionable:

- **Condition 1 is all-or-nothing across all indexes.** A single index on a frequently-updated column
  disables this optimization for *every* update that touches that column. **This is one of the
  highest-leverage schema decisions in a relational database and it is almost never considered:
  adding one index on a hot column can multiply the write cost of your entire update workload by the
  number of indexes on the table.**
- **Condition 2 fails when heap pages are full.** Which is what a table's fill factor is *for* —
  reserving space on each heap page specifically so future updates can stay local. The default is
  usually 100%, which is optimal for insert-mostly tables and actively harmful for update-heavy ones.

**And the second half of the win: page-local pruning.** Because no index points at intermediate
versions in the chain, dead versions can be removed by a **page-local** operation, triggered
opportunistically whenever the page is accessed. No index cleanup, no background process, no
cross-page coordination. A hot-spot row updated thousands of times per second can be maintained
entirely by pruning, and the indexes never learn anything happened.

> **Note the structure of this optimization: it works by arranging for the expensive cross-structure
> coordination not to be necessary.** That is a more powerful move than making the coordination
> cheaper, and it is worth looking for. Chapter 34 is the same move applied to concurrency.

## 33.9 Measuring and fixing bloat

Since bloat is designed-in rather than pathological, it has to be measured rather than prevented.

**What to measure:**

| Metric | What it tells you |
|---|---|
| **Average leaf page density** | the direct bloat measure. ~90% healthy, <50% badly bloated |
| Leaf fragmentation | how far leaf pages have drifted from physical key order — predicts range-scan cost |
| Deleted-but-not-recyclable page count | how much §33.6 is holding hostage |
| **Age of the oldest snapshot / horizon** | the leading indicator for §33.7's pathology; watch this above all |
| Time since the last successful background cleanup per relation | whether the cleaner is keeping up |

**What to do about it**, in increasing order of disruption:

- **Lower the index fill factor** for indexes on randomly-keyed, heavily-updated columns, so freshly
  built pages have headroom.
- **Lower the table fill factor** to preserve §33.8's condition 2.
- **Drop indexes on hot columns** — see §33.8's first failure mode. Frequently the largest single win
  and the least often attempted.
- **Rebuild the index.** Space is *reused* by the free space map but not *released* to the
  filesystem, because relation truncation requires the **trailing** blocks to be empty and in a
  B-tree the physically last block is arbitrary. So the file stays at its historical maximum size
  essentially forever, and a rebuild is the only thing that repacks pages to the target fill factor —
  because it is the only operation that moves keys leftward, which §31.6.1 forbade for everything
  else. Concurrent rebuild (building a fresh index and swapping it in without blocking writes) is
  the production form.

> **§31.6.1 forbade moving keys leftward. Rebuilding the index is how you move keys leftward
> anyway — by building a new tree instead of modifying the old one.** Which is, note, exactly
> Chapter 34's move.

## 33.10 The same problem in every lineage

Step back and the specific mechanisms above turn out to be one pattern with five costumes:

| Lineage | What is deferred | The debt it accumulates | The collector |
|---|---|---|---|
| **B-tree** (§33.1–33.6) | merging, page reclamation | index bloat | background vacuum + rebuild |
| **MVCC heap** (§33.2) | removing dead row versions | table bloat | background vacuum |
| **LSM-tree** (Volume 3 §20.6) | reconciling overlapping runs | **read** and **space** amplification | compaction |
| **Copy-on-write** (§32.11) | freeing superseded versions | space retention | free-list / space-map management |
| **Managed runtimes** | freeing unreachable objects | heap growth | garbage collection |
| **Git** (§34.7) | removing unreferenced objects | repository growth | `git gc` |

> **Every production data structure with a cheap write path defers reclamation, and the tuning knob
> is always the same one: how far behind you let the cleaner get.** The bloat equation *r*·*T* from
> §33.7 applies to all six rows. So does the pathology: a live reference — a long transaction, a held
> snapshot, an old reflog entry, a leaked object handle — pins the horizon and stops collection
> entirely.

And the three-way trade among read cost, write cost, and space is exactly Volume 3 §20.9's **RUM
conjecture**: optimize two of Read, Update and Memory overhead, and sacrifice the third. Deferred
cleanup is the standard way of *buying* Update at the expense of Memory, and compaction strategy is
the dial that sets the exchange rate.

---

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

# Chapter 35 — The Three Pressures, and Why They Fight

## 35.1 What each pressure wants

Volume 5 has had three subjects. Stated as demands on the structure:

| Pressure | What it wants |
|---|---|
| **Concurrency** (Ch 30–31) | No ancestor latches during descent. Content moving in **one direction only**. No multi-page atomic operations. Ideally, no writes to shared memory on the read path. |
| **Durability** (Ch 32) | Every structural change described in a durable log **before** it can reach the data files. Whole-page images available to repair torn writes. |
| **Maintenance** (Ch 33) | Prompt reclamation of space that is no longer needed. |

Each is individually reasonable. **They are mutually incompatible**, and every real system is a
particular choice about which one to under-serve.

## 35.2 The conflicts, enumerated

**Conflict 1 — Concurrency forbids the repair Maintenance needs.** §31.6.1: merging and borrowing
move keys leftward, breaking invariant I1 and with it the Recovery Theorem. So a B-tree cannot
rebalance on delete. **Result: permanent index bloat (§33.1), reclaimable only by rebuilding the
index (§33.9) — which works precisely because it builds a new tree rather than modifying the old
one.**

**Conflict 2 — Concurrency forbids the prompt reuse Maintenance wants.** §31.4's latch-free descent
lets threads hold stale block numbers. §33.6: therefore a deleted page cannot be recycled until every
possible holder of a stale pointer is gone. **Result: a third category of page — not live, not free,
waiting.** And on a replica, two horizons must be reconciled, which surfaces as replication lag or
cancelled queries (§32.10).

**Conflict 3 — Durability's repair mechanism increases Maintenance's workload.** §32.7: full-page
writes cost up to 8 KB of log per modification, and the cost fails to amortize exactly when keys are
random — which is the same condition under which Volume 3 §20.3's data-file write amplification is
worst. **Two independent costs, one shared root cause, and they compound.**

**Conflict 4 — Durability imposes a global ordering that Concurrency dislikes.** The WAL rule
(§32.3) requires an ordering between log flushes and page writes, and log records must be assigned
monotonic positions — a global sequence. Group commit and lock-free log insertion mitigate it, but
the log's insertion point is a serialization point in a system that spent two chapters eliminating
serialization points.

**Conflict 5 — Maintenance trades Latency against Space, and cannot avoid choosing.** §33.7:
steady-state bloat is *r*·*T*. Clean online and the writer pays latency; clean offline and you pay
*r*·*T* in space plus periodic I/O spikes plus the operational risk of a load-bearing background
process.

**And one resolution.** §34.3: **immutability resolves Conflicts 1, 2 and much of Durability, all at
once.**

- Nothing moves at all, so I1 is trivially satisfied — Conflict 1 dissolves.
- Readers hold snapshots legitimately rather than accidentally, so there are no stale pointers to
  fear — Conflict 2 dissolves.
- There is never an inconsistent intermediate state, so no log is needed for structural integrity
  and torn pages cannot corrupt the tree (§32.11) — most of Durability dissolves.
- And snapshots and MVCC come free rather than as separate mechanisms.

**Its bill is paid entirely in Maintenance and write throughput** (§34.4): reclamation becomes the
central difficulty, space is retained while readers hold old versions, writers do not scale past
one, and physical layout fragments over time.

> **So the three pressures reduce to one trade after all: you may relax mutation, and pay in space
> and write concurrency; or you may permit mutation, and pay in coordination machinery and deferred
> cleanup.** Volume 3 §20.9's RUM conjecture said you may optimize two of Read, Update and Memory
> overhead. Chapter 35 is the same statement with the third axis renamed: **the coordination you
> avoid, you pay for in space.**

## 35.3 The operator's view

Volume 5's material is unusual in this book in that it turns directly into things you monitor and
things you set. A short practical distillation.

**Watch these, in this order of importance:**

| Signal | Why it is the leading indicator |
|---|---|
| **Age of the oldest snapshot / visibility horizon** | §33.7's pathology. When this grows, *nothing* can be reclaimed anywhere, and every other metric follows it. Watch this above all. |
| Time since the last successful cleanup per relation | whether the cleaner is keeping up (*T* in §33.7's *r*·*T*) |
| Average leaf density per index | the direct bloat measure (§33.9) |
| Deleted-but-not-yet-recyclable page count | how much §33.6 is holding hostage |
| WAL generated per unit of logical work | §32.7 — a sawtooth here is full-page writes; a high plateau means random-key locality problems |
| Checkpoint frequency and duration | §32.7's trade between WAL volume and recovery time |
| Replication lag / cancelled-query rate on replicas | §32.10 — two horizons being reconciled |

**Set these deliberately rather than by default:**

| Knob | Set it when | §|
|---|---|---|
| Index fill factor below 100% | randomly-keyed, heavily-updated indexes | §33.9 |
| **Table** fill factor below 100% | update-heavy tables (preserves heap-only-tuple eligibility) | §33.8 |
| **Drop indexes on hot columns** | frequently the largest single win, and the least often attempted | §33.8 |
| Longer checkpoint interval + larger log budget | write-heavy, with tolerance for longer recovery | §32.7 |
| WAL compression | almost always — index pages compress well | §32.7 |
| Time-ordered identifiers instead of random ones | the third independent argument for this in the book | §32.7 |
| More aggressive cleanup scheduling | when *r*·*T* bloat exceeds what you want to store | §33.7 |
| `full_page_writes = off` | **only** with storage guaranteeing atomic page writes | §32.7 |

---

# Volume 5 Retrospective

**1. The concurrency failure is a wrong answer, not a crash (§30.1).** A reader that read a downlink
before a split and follows it afterwards reports that a present key does not exist — silently,
non-deterministically, under load. Everything in Chapter 31 defends against that one interleaving.

**2. The modern binding cost is cache coherence on the latch word, not exclusive contention on the
root (§30.4).** With fanout 500 a root split happens once in four billion insertions, so exclusive
root access is genuinely rare. The real problem is that **acquiring even a shared latch is an atomic
write to shared memory**, so throughput on any single latch caps at roughly one acquisition per
coherence round trip — around 14 million per second — *regardless of core count*, and degrades as
cores are added. **Readers that must announce themselves do not scale**, and that reframing drives
§31.9, §34.3 and §34.9.

**3. Two additions to a page buy latch-free descent (§31.2–31.4).** A right-link and a high key. A
reader compares its key to the high key; if it exceeds it, the keys moved right, so follow the link
and repeat. One latch at a time, no ancestor latches, no restarts.

**4. And the theorem behind it is one line (§31.5).** *A stale downlink always points at or to the
left of the correct page, never to the right — so under-approximations are recoverable by moving
right.* That is the load-bearing sentence of the volume, and it holds because splits move content
only rightward and install the right-link before releasing the latch.

**5. Four separate engineering mysteries were one theorem (§31.6).** No merging, no B\*-trees,
asymmetric backward scans, and root splits needing no special case — all corollaries of "content
moves only rightward". They are not four decisions; they are one invariant seen from four angles.
Volume 3 asserted each of them and pointed here.

**6. Crash safety is two problems, and WAL solves only one (§32.1, §32.6).** Multi-page atomicity is
solved by logging. **Torn pages are not**, because a delta record needs the page to be parseable and
its LSN to be trustworthy — and a torn page can have a **new LSN with old contents**, so redo skips
the record that would have fixed it and *reports success*. Full-page writes exist because you cannot
patch a page that is lying to you about how current it is.

**7. Recovery should never modify the tree (§32.9).** Splitting the split into two log records
deliberately leaves an "incomplete split" state reachable after a crash — which §31.5 proves is
correct for readers — so recovery only ever replays images and deltas, and structural repair is done
later by whoever passes by. This removed a class of recovery bugs and is what makes hot-standby
replay of index changes tractable.

**8. Copy-on-write is closer to WAL than the framing suggests (§32.11).** WAL writes one page plus a
log record, but full-page writes make the first touch cost roughly two pages' worth. CoW writes *h* ≈
4 pages and needs no log at all — and throws in snapshots, MVCC and instant recovery. A factor of
two, not ten. **That is why databases chose WAL and filesystems chose CoW: different weightings, not
different levels of sophistication.**

**9. Cleanup is layered because cost and coverage are inversely related (§33.3).** Opportunistic
layers are nearly free and only see what traffic visits; the background sweep sees everything and must
scan everything. Systems run all of them for complementary coverage — and the bottom layer is
**mandatory**, because §33.4's row-pointer reuse means a missed index entry produces a live,
visible, wrong row.

**10. The bloat equation is *r* × *T* (§33.7).** Deferring cleanup lowers total work and smooths
latency, and pays for both in space proportional to the cleanup interval — plus the operational risk
that the cleaner is load-bearing infrastructure whose failure mode is unbounded growth.

**11. Immutability copies a logarithm, not the data (§34.2).** Path copying creates log_*f*(*n*)
nodes — twenty for a million-element binary tree, four at fanout 32, and 0.002% of the structure.
And it rewards fanout for an entirely different reason than Volume 3 did, which is why persistent
maps are 32-way tries and why §34.9's kernel structure is a B-tree.

**12. Immutability solves the read-path problem completely, and charges for it in space and write
throughput (§34.3, §34.4).** Zero latches, zero shared writes, freely-held snapshots. The cost is
reclamation — and naive reference counting reintroduces the exact cache-line contention it
eliminated, so the working answers all have readers announcing themselves **once per operation in a
thread-local slot**, or (RCU) not at all.

**13. MVCC is immutability with a hand-written garbage collector (§34.8).** Row versions are
immutable, a snapshot is a root pointer, and the vacuum process is the collector — which makes the
"long transaction stops all reclamation" pathology the oldest problem in GC: a live reference
prevents collection. Volume 1 §3.2's DAG warning, Volume 4 §27.6's git object model, and §33.7's
horizon pathology are the same phenomenon in three costumes.

**14. Concurrency-friendliness is mostly about whether a structure has an operation that transiently
breaks its own invariants (§31.10, §34.9).** Skip lists have no rebalancing; B-trees have no
rotations. Both are consequently easy to make safe for lockless readers. Red-black trees rotate, and
a lockless reader can observe a state that is not a tree. **The absence of a rebalancing operation is
the concurrency feature** — which is a strange and useful thing to know when choosing a structure.

---

# Volume 5 is complete

**File: `volume-5-concurrency-and-durability.md`** — ready.

## What Volume 6 will cover: SYNTHESIS, REAL-WORLD MAP, AND OPEN FRONTIERS

The final volume does not introduce a new problem. It argues that there was only ever one.

- **One lens for the whole book.** Every design choice in Volumes 1–5 traces back to two questions:
  **where does the data live** — register, cache, RAM, disk, network — and **what operation is
  expensive there**. I will walk back through all five volumes and show the pattern explicitly:
  Volume 1's pointer-chasing, Volume 2's four balance philosophies, Volume 3's fanout, Volume 4's
  choice of summary, Volume 5's coordination costs. The claim is that they are five instances of one
  question, and that you could have derived most of the book from it.
- **Cache-oblivious and cache-aware trees.** How the CPU cache hierarchy recreates Volume 3's
  disk problem at a smaller scale — a point this book has now made four times in passing (Volume 1
  §6.2, Volume 3 §18.2, Volume 4 §21.6, Volume 4 §24.5) — and how tree design is adapting again:
  van Emde Boas layout, Eytzinger/BFS layout, B-trees tuned to cache lines, and the cache-oblivious
  model that gets the right answer without knowing the parameters.
- **A comprehensive reference table**: tree type → the problem it solves → real production systems
  using it today. Covering at minimum the Linux kernel scheduler and memory management,
  filesystems (ext4, Btrfs, NTFS, APFS), relational database indexes (PostgreSQL, MySQL, Oracle),
  LSM/NoSQL engines, DNS, compilers and parsers, git's object model, the browser DOM, network
  routing tables, autocomplete and search, game-engine spatial partitioning, and ML models.
- **Open problems and frontier research**: distributed trees at massive scale, formally verified
  tree algorithms, and hardware-accelerated tree operations — including the observation from Volume
  4 §25.5 that GPUs now contain silicon dedicated to traversing one.
- **A closing curiosity section**: the strangest tree-adjacent structures worth knowing exist —
  van Emde Boas trees, finger trees, zippers, tango trees — brief and playful, as an invitation
  rather than a syllabus.

Say **continue** when you would like me to start Volume 6, the final one.
