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

