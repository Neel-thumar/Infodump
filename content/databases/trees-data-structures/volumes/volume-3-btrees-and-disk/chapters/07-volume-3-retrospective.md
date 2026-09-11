# Volume 3 Retrospective

Six chapters, one cost model, and everything derived from it.

**1. The cost unit changes when data leaves RAM, and the change is nine orders of magnitude
(Ch. 15).** L1 to hard disk is one second to three months on the human-scaled table. And because
the marginal bytes of a transfer are nearly free — 250 KB costs about what one byte costs on NVMe,
1.6 MB on a hard disk — the objective function is **minimize the number of trips**, not minimize
comparisons. Volume 2 §7.1's claim that fanout does not reduce comparisons is still true; it just
stopped being the bill.

**2. Tree descent is a dependent chain, which is why height is unavoidable serial latency
(§15.4).** You cannot know which page to read at level 3 until you have read level 2, so no amount
of parallelism or queue depth helps. This is Volume 1 §1.6's pointer-chasing argument three orders
of magnitude larger, and it is what makes height, specifically, the quantity to minimize.

**3. ISAM is the failure that forced the structure (§16.2).** A static index plus overflow chains is
Volume 1's sorted array bolted to Volume 1's linked list, and it inherits the worst of both:
performance that degrades unevenly across the keyspace and can only be restored by taking the
system offline. Bayer and McCreight's contribution was not the shape but the **maintenance** — local,
bounded, self-correcting, with no rebuild ever.

**4. High fanout makes balance easy rather than hard (§16.6, §17.3).** This is the counterintuitive
one. There are no rotations in a B-tree, no colour bits, no balance factors, no priorities, no
amortized potential argument. Volume 2 needed all of that because a binary node has no slack; a
node with 500 slots has slack to spare, and the minimum-occupancy invariant turns out to be
**self-maintaining under insertion** — a split's natural output is exactly two half-full nodes. The
tree grows at the root, so uniform leaf depth is structurally unbreakable rather than maintained.

**5. Fanout is derived, not chosen, and key width therefore costs you latency (§17.6).** Fanout is
`page_bytes / entry_bytes`. So a 200-byte text primary key instead of a `bigint` costs two extra
levels on a billion-row index — two extra serial device round trips on every lookup, forever, plus
the same again in every secondary index that references it. That is a schema decision with a
measurable, permanent latency price.

**6. "Split at the median" is a legality constraint, not an aesthetic one (§18.3).** For odd order
it is the *only* split point that leaves both halves satisfying the minimum-occupancy invariant.
Everything else about split behaviour — the rightmost-page heuristic that recovers ~2× on
sequential keys, the choice biased toward shorter separators — is layered on top of that hard
constraint.

**7. Deletion is textbook-correct and production-rejected (§18.7, §18.9).** Borrow and merge are
elegant, provably correct, and mostly not implemented — because a merge moves keys **leftward**,
and the high-concurrency algorithm every real system uses depends on content only ever moving
**rightward**. The accepted price is index bloat. This is Volume 2 §8.4's Hibbard-deletion lesson at
scale: when real systems reject a textbook algorithm, the interesting question is which constraint
the textbook was not modelling.

**8. B+-trees win by noticing that a separator is a boundary, not a datum (Ch. 19).** Records in
leaves only, leaves linked. This makes internal fanout independent of row size, makes range scans a
sequential stream instead of an interleaved dependent chain, and — because a boundary needs only
enough information to separate — permits **suffix truncation**, which is worth one to two levels on
wide keys. The plain B-tree's compensating advantage, early termination, applies to ~1% of lookups
and costs a level on 100%.

**9. In-place update and random writes are the same property (§20.4).** A B+-tree gives every key
exactly one home determined by its value, which is what makes reads cheap and what makes
random-key inserts cost 500× amplification. You cannot keep one and discard the other — you can
only batch (Bε) or stop placing immediately (LSM).

**10. There is one axis, not a menagerie (§20.5, §20.10).** ε is a dial: ε = 1 is a B-tree, ε → 0
is LSM-shaped, ε = ½ is a Fractal Tree. And the lineages have converged — an SSTable's block index
*is* a static B-tree, and a B-tree's deferred cleanup *is* compaction. The RUM conjecture then says
you may optimize read, update, or space overhead — pick two.

## The thread left dangling

Volume 3 has been carefully silent about two things, and both were flagged repeatedly.

**Everything here assumed one thread.** §18.6 (preemptive splitting), §18.9 (why merge is
rejected), §19.6 (why backward scans need retries), §20.2 (why B\*-trees died) all turned on
concurrency, and every one of them deferred the argument. The recurring claim — that **content must
only ever move rightward** so a reader with a stale pointer can recover — has been asserted four
times and never justified.

**Everything here assumed writes complete.** §17.6 mentioned torn pages; §20.3 counted full-page
log images without explaining them. A split touches three pages, and no device writes three pages
atomically. What happens when the power fails between the second and the third?

Those are Volume 5. Volume 4 comes first, because there is a large family of trees that exist not
to be *fast* but because the problem was a tree all along — and Volume 1 §2.6 promised we would get
to them.

---

