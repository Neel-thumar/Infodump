# Chapter 14 — Comparison, and What This Volume Was Really About

## 14.1 The comparison table

Complexities are for a tree of *n* nodes. "Metadata" is per-node overhead beyond a key and two
child pointers.

| | Plain BST | AVL | Red-black | Splay | Treap |
|---|---|---|---|---|---|
| **Search** | O(*n*) worst<br>O(log *n*) if random input | **O(log *n*) worst** | **O(log *n*) worst** | O(log *n*) **amortized**<br>O(*n*) single op | O(log *n*) **expected**<br>O(*n*) worst |
| **Insert** | O(*n*) worst | **O(log *n*) worst** | **O(log *n*) worst** | O(log *n*) amortized | O(log *n*) expected |
| **Delete** | O(*n*) worst | **O(log *n*) worst** | **O(log *n*) worst** | O(log *n*) amortized | O(log *n*) expected |
| **Height bound** | *n* − 1 | **1.44 log₂ *n*** | 2 log₂ *n* | unbounded | ≈ 3 log₂ *n* expected |
| **Rotations / insert** | 0 | ≤ 2 | ≤ 2 | O(depth), every access | O(1) expected |
| **Rotations / delete** | 0 | **Θ(log *n*)** | **≤ 3** | O(depth) | O(log *n*) expected |
| **Metadata / node** | **none** | 2 bits – 4 bytes | **1 bit** (packable into a pointer) | **none** | 4–8 bytes (priority) |
| **Reads mutate?** | no | no | no | **YES** | no |
| **Concurrent readers?** | fine | fine | fine | **impossible** | fine |
| **`split` / `join`** | hard | hard | hard | **easy** | **easy** |
| **Adapts to access skew?** | no | no | no | **YES** | no |
| **Implementation difficulty** | trivial | moderate | **hard** (deletion) | easy | **easy** |
| **Worst case is adversary-reachable?** | **yes** | no | no | per-op yes | **no** (randomized) |

### Best fit

| Structure | Use it when |
|---|---|
| **Plain BST** | Never in production, unless you can prove the input is randomly ordered. Excellent for teaching. |
| **AVL** | Read-dominated workloads. In-memory indexes over near-static data. Where the ~44% height advantage is measurable. |
| **Red-black** | The general-purpose default. Mixed reads and writes, frequent deletion, worst-case bounds needed, concurrent readers, stable iterators. Hence `std::map`, `TreeMap`, the Linux kernel. |
| **Splay** | Strongly skewed access, single-threaded, no latency SLO. As a *component* of link-cut trees. When you need zero metadata. |
| **Treap** | When you need `split`/`join` or sequence operations (ropes). When you are hand-writing it. When adversarial input is a concern and expected-case bounds suffice. |

## 14.2 The four philosophies, which is the real content of this volume

Strip away the mechanisms and there are only four distinct answers to §9's problem, plus one that
Volume 3 will supply.

**1. Enforce a tight invariant. — AVL**
Check balance after every update; restore it immediately. Tightest height, most rebalancing work,
worst deletion behaviour. *Pay on writes, win on reads.*

**2. Enforce a loose invariant. — Red-black**
Accept a weaker balance condition, chosen so that the *propagating* repair case needs no rotation
and the *rotating* repair cases cannot propagate. Taller trees, bounded structural change, stable
iterators, safe for concurrent readers. *Pay a little on both, win on predictability.*

**3. Enforce nothing; repair opportunistically. — Splay**
No invariant, no metadata. Restructure the access path on every touch. Adaptive to skew, provably
near-optimal against a static competitor, and every read becomes a write.
*Pay on reads, win on locality.*

**4. Enforce nothing; make the bad case improbable. — Treap**
No invariant. Attach randomness the adversary cannot control, so the shape distribution is the
good one regardless of input. Expected rather than worst-case bounds, trivial code, cheap
`split`/`join`. *Pay a little space, win on simplicity and adversary-resistance.*

**5. Change the node so the tree cannot get tall. — B-trees, Volume 3**
None of the above touches the *fanout*. All four accept "binary" and manage shape within that
constraint. Volume 3's move is different: increase the number of children per node from 2 to
several hundred, so height collapses from log₂ *n* to log₄₀₀ *n* — from 30 levels to 4 for a
billion keys — and the balance problem becomes almost incidental by comparison.

That fifth answer is not a competitor to the first four; it operates on a different axis. And
§7.1 explained why it is pointless in RAM (fanout does not reduce comparisons) and §11.2 has
already shown you a B-tree in disguise. Volume 3 is about the environment in which that axis
becomes the only one that matters.

## 14.3 Three transferable lessons

**Slack is the design variable.** §10.3's Fibonacci height bound came directly from choosing ±1 as
the permitted imbalance. Red-black's 2 log *n* came from choosing a looser condition. The
structures differ not in cleverness but in **how much deviation from perfect they tolerate**, and
tolerance buys cheaper repair. This dial exists in almost every self-maintaining system — B-tree
fill factors, load factors in hash tables, watermarks in queues, replication lag bounds. Whenever
you see a system that must maintain a property under continuous modification, look for the slack
parameter; it is where the trade-off is encoded.

**The right question about a repair operation is not "how expensive is it?" but "can it
propagate?"** §11.5's key insight — that red-black's propagating case does no rotations and its
rotating cases cannot propagate — is what bounds structural change at a constant. AVL deletion is
expensive for precisely the opposite reason: its repair can both rotate *and* propagate.
Separating "does work" from "triggers more work" is a general analytical move.

**Guarantees come in four flavours and they are not interchangeable.** This volume gave you one of
each:

| Flavour | Structure | What it promises | What it does not |
|---|---|---|---|
| **Worst case** | AVL, red-black | Every operation, always | Nothing about typical performance |
| **Amortized** | Splay | The *sequence* is fast | Any *individual* operation may be slow |
| **Expected** | Treap | Fast on average over *our* coin flips | Nothing certain about any single run |
| **Average case** | Plain BST | Fast if input is randomly ordered | Anything, if input is sorted or chosen by an adversary |

The last is the weakest and the one most often quoted as if it were the first. An average-case
bound is a claim about the *input distribution*, and §9.5 showed the input distribution is
sometimes chosen by someone who wants you to fail. **Amortized and expected bounds are real
guarantees; average-case bounds are assumptions.** Knowing which flavour you have is the
difference between a system that degrades gracefully and one that falls over on a Tuesday.

---

