# Volume 6 Retrospective

**1. There was one question, asked at six scales (§36).** Where does the data live, and what is
expensive there? The derived quantity is the **access-to-compute ratio**, and it spans nine orders of
magnitude from a register to a cross-region round trip. When the ratio is near 1, minimize
instructions; when it is large, minimize accesses and spend computation freely.

**2. And the same five rules fall out at every level (§36.7).** Make the node the size of the
transfer unit. Minimize the number of levels. Keep the top of the structure small enough to live in
the level above. Turn dependent chains into sequential streams where you can. Do not write to shared
state on the read path. **Five volumes derived those independently, for five different parameter
values.**

**3. The same fanout trade appears five times (§36.8)**, each time discovered separately, each time
with the constant `access_unit_size / entry_size`: B-tree pages, ART node types, *d*-ary heaps,
immutable path copying, and cache-line-sized in-memory nodes.

**4. But there are two lenses, not one (§36.5).** Volume 4 §29's — *what summary does each node
store?* — determines **what question the structure can answer**. Volume 6 §36's — *at what level
does an access live?* — determines **how it must be shaped**. The axes are nearly independent, which
is why you can put an interval tree's summary on a B-tree, or a B-tree's fanout on a persistent
immutable map. And neither lens explains the curse of dimensionality, cryptographic guarantees, or
statistical correctness — those come from elsewhere.

**5. The cache hierarchy recreates the disk problem, and layout alone is worth 3× (§37.3).** Same
comparisons, same asymptotics, three arrangements of one million integers: textbook binary search
~1,100 ns, Eytzinger with branchless descent and speculative prefetching ~350 ns, cache-line B-tree
layout ~550 ns. **The measured winner is the B-tree layout**, and Eytzinger's real advantage comes
not from locality alone but from being *branchless*, which is what allows prefetching two levels
ahead regardless of the comparison outcome.

**6. Cache-obliviousness is beautiful and mostly unnecessary (§37.4, §37.6).** The van Emde Boas
layout achieves O(log_*B* *n*) transfers **for every *B* simultaneously**, without knowing *B* —
because recursive √-decomposition makes the layout self-similar, so some level of the recursion
matches whatever granularity the hardware uses. And it is little used, because *B* = 64 bytes has been
stable for two decades. **It solved a parameter-uncertainty problem that turned out not to be very
uncertain** — which is an empirical fact about the hardware market, not a fact about algorithms.

**7. GPUs break the book's central assumption, and it is worth knowing exactly how (§37.7).** Volume
3 §15.4 argued that height is unavoidable serial latency because a descent is a dependent chain. That
holds **for one query at a time**. With thousands of independent descents in flight the memory system
saturates and the objective flips from *minimize accesses* to *minimize bytes transferred* — which
recommends **narrower** nodes and a **deeper** tree, the opposite of Volume 3's conclusion. It is
also why dedicating silicon to tree traversal makes sense only for embarrassingly parallel workloads
like ray tracing.

**8. The map has edges (§38.14).** A tree is the right answer when you need an ordering or a
hierarchy over data too large or too dynamic for a flat structure. Drop the ordering and a hash table
wins; drop the dynamism and a sorted array wins; add dimensions and the hierarchy stops being
informative; add hardware parallelism and a TCAM beats the descent outright. **The domain is real and
it is not everything.**

**9. The frontier is where silent wrong answers live (§39.2).** Volume 5's two worst failure modes
produce results that look right, which is exactly the class of bug testing cannot find and formal
methods exist for. And Volume 5 §31.5's invariants are statements about *histories*, not states,
which is why verifying them is hard.

**10. And the sharpest challenge to the whole book is that a tree might just be a function
(§39.4).** If a B-tree is a piecewise-constant map from key to position that assumes nothing about
the key distribution, and real distributions are not adversarial, then a learned model may be
smaller and faster. That is a real idea. What a B-tree offers in exchange is O(log_*B* *n*) **for
every input, forever, with no assumptions** — which Volume 2 §14.3 already argued is worth a great
deal.

---

