# Six Things Worth Keeping

If the book compresses to anything, it compresses to these.

**1. Identify the cost unit before optimizing anything.** It is whatever the next level down charges
for, and it varies by nine orders of magnitude. Almost every wrong optimization in this subject comes
from optimizing the previous level's cost unit — counting comparisons when you are paying for page
reads, counting page reads when you are paying for round trips, counting anything at all when you
are paying for cache-line coherence.

**2. Slack is the design variable.** Every structure that maintains itself under continuous
modification has a parameter controlling how far from ideal it tolerates being: AVL's ±1, red-black's
black-height, a B-tree's fill factor, a hash table's load factor, an LSM's level ratio, a cleanup
interval. **Find the slack parameter and you have found where the trade-off is encoded.**

**3. An invariant is information, and information you can derive is information you need not
store.** A B+-tree separator only needs to *separate*, so truncate it. A Fenwick tree's operation is
invertible, so discard half the segment tree. A suffix array's leaf order encodes the tree's
structure, so throw the tree away — and then compress the array until it is smaller than the text.
Every step in that progression discarded something re-derivable.

**4. Ask whether a repair can propagate, not merely what it costs.** Red-black trees beat AVL trees
on writes because *the case that can repeat performs no rotations, and the cases that rotate cannot
repeat*. Separating "does work" from "triggers more work" is a general analytical move and it is
usually more informative than counting.

**5. Guarantees come in four flavours and they are not interchangeable.** Worst-case (every
operation, always). Amortized (the sequence is fast; any single operation may not be). Expected (fast
over *our* coin flips; nothing certain about one run). Average-case (fast **if** the input is
distributed as assumed). **The last is an assumption, not a guarantee** — and the input distribution
is sometimes chosen by someone who wants you to fail.

**6. The cheapest way to do work is to promise to do it later — then measure the debt.** Tombstones,
deferred merging, lazy propagation, compaction, garbage collection, deferred split repair. All the
same move, and all with the same bill: steady-state waste proportional to *r* × *T*, plus the
operational risk that the cleaner has become load-bearing infrastructure whose failure mode is
unbounded growth.

---

