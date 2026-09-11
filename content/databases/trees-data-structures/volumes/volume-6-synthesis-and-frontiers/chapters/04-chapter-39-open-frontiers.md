# Chapter 39 — Open Frontiers

## 39.1 Distributed trees at massive scale

> **Confidence: moderate on specifics; the architectures are documented but details change.**

Add a row to §36.1's table — the network, ratio 10⁶ to 10⁹ — and ask what a tree spanning a thousand
machines looks like.

**The naive answer fails immediately.** A tree whose root lives on one machine makes that machine
handle every operation, at network latency. Volume 5 §30.4's cache-coherence problem, six orders of
magnitude larger.

**What is actually built is a two-level architecture**, and its shape is a direct application of
something this book derived in Volume 3:

```
   ┌─────────────────────────────────────────────────────────────┐
   │  ROUTING LAYER: key range → server                          │
   │  Small (thousands of entries), and REPLICATED TO EVERY       │
   │  CLIENT, cached aggressively, refreshed on miss.             │
   └──────────┬──────────────┬──────────────┬────────────────────┘
              ▼              ▼              ▼
       ┌────────────┐ ┌────────────┐ ┌────────────┐
       │  server A  │ │  server B  │ │  server C  │
       │ local B+-  │ │ local LSM  │ │ local ...  │   ← deep, local, fast
       │ tree/LSM   │ │            │ │            │
       └────────────┘ └────────────┘ └────────────┘
```

> **Volume 3 §15.5 observed that the top of a search tree is tiny and therefore stays cached. This is
> that observation taken to its logical extreme: the top of the tree is small enough to replicate to
> every client on Earth, so descending it costs zero network round trips.** The routing layer is a
> tree whose upper levels are cached *everywhere*, and only the leaf hop crosses the network.

**Real instances:** Bigtable and HBase (`META` tables locating tablets), Spanner (Paxos groups per
split), CockroachDB and TiKV (ranges with Raft consensus groups), and essentially every
range-partitioned store.

**And range splitting is Volume 3's page split, at network scale — with Volume 5's problem
attached.** When a range grows too large it splits, which requires atomically updating the routing
metadata *and* both new ranges. That is Volume 5 §32.2's multi-page atomicity, across machines,
which means it requires **consensus** — Raft or Paxos — rather than a WAL record. A page split costs
microseconds; a range split costs a consensus round.

**The alternative is to abandon the tree.** Consistent hashing (Dynamo, Cassandra) partitions by hash
with no metadata tree to keep consistent and no hot-range problem — at the cost of **losing range
queries entirely**, which is Volume 3 §20.11's "hash index" row, at distributed scale.

**What is genuinely open:**

- **Distributed range queries with strong consistency and low latency.** A range scan spanning *k*
  servers needs *k* round trips, or speculative parallel fetches, or a consistent snapshot across all
  of them. Doing this well is unsolved.
- **Hot *keys*, as opposed to hot ranges.** A range can be split; a single hot key cannot. The
  answers — caching, replication with read-your-writes complications, request coalescing — are all
  workarounds rather than solutions.
- **Geo-distribution where replica latencies differ by 100×.** §36.1's table assumes one latency per
  level; a globally distributed tree has a *distribution* of latencies per level, and the optimal
  shape depends on where the query originated.
- **Disaggregated memory.** If CXL-attached memory pools become common (§37.7), "RAM" becomes a
  network hop at ~1 µs, and the question of what a tree looks like when its levels live at
  *different* latencies becomes urgent rather than academic.

## 39.2 Verified tree algorithms

> **Confidence: moderate-high on the named projects; moderate on the state of the art.**

**The motivation comes straight out of Volume 5.** Its two worst failure modes are:

- §30.1's interleaving: a reader reports that a present key does not exist — silently, only under
  load, only sometimes.
- §33.4's row-pointer reuse: an index scan returns a **real, live, plausible, wrong row**.

**Testing does not find these reliably.** Both require a specific interleaving or a specific
crash point, and neither produces an error, an exception, or a detectable inconsistency. They produce
*wrong answers that look right*. That is precisely the class of bug formal methods exist for.

**What exists:**

| Project | What it verified |
|---|---|
| **seL4** | A fully verified microkernel, including its internal data structures |
| **CompCert** | A verified C compiler |
| **FSCQ** (Chen et al., SOSP 2015) | A **crash-safe filesystem**, proved correct using *Crash Hoare Logic* — an extension of separation logic that reasons about states reachable after a crash |
| **Iris** and concurrent separation logic | The framework where verification of *lock-free* structures is happening — which is exactly Volume 5's hard case |
| **Amazon's use of TLA+** (Newcombe et al., *CACM* 2015) | Model checking rather than proof, applied to S3 and DynamoDB — and it found exactly the §30.1-shaped interleaving bugs that testing had missed |

**Why it is hard**, specifically for the structures in this book:

1. **Volume 5 §31.5's invariants are statements about *histories*, not states.** "Content only ever
   moves rightward" is not a predicate you can evaluate on a snapshot; it is a constraint on the
   sequence of all past operations. Reasoning about that requires temporal logic or history-based
   specification, both of which are much harder than state invariants.
2. **Crashes and concurrency compose badly.** Verifying a concurrent structure is hard. Verifying a
   crash-safe one is hard. Verifying a structure that is concurrent *and* crash-safe multiplies the
   state space, and Volume 5's Chapters 31 and 32 are jointly exactly that case.
3. **Verified implementations tend to be simpler or slower** — often substantially — than the
   production ones they model. Volume 5 §34.10's honest note about the Bw-tree applies here too: the
   gap between "provably correct" and "competitively fast" is the frontier.

**The pragmatic middle ground is worth knowing about**, because it is deployed today: **runtime
invariant checking.** PostgreSQL's `amcheck` extension verifies a live B-tree's structural
invariants — key ordering, parent/child consistency, sibling links, the Volume 5 §31.5 relations —
on demand. It is not a proof, but it converts "silent wrong answer" into "loud error," which is
most of the practical value.

## 39.3 Hardware acceleration

Some of this is already shipping, which makes it the least speculative section in the chapter.

**Already real:**

| Hardware | What it does |
|---|---|
| **GPU ray-tracing units** (NVIDIA RT cores from Turing, 2018; AMD Ray Accelerators) | **Silicon dedicated to traversing a BVH.** Volume 4 §25.5 and §37.7 — feasible only because ray tracing has thousands of *independent* descents in flight, so the dependent-chain problem does not apply. |
| **TCAM** in routers | Ternary content-addressable memory performs **longest-prefix match in one cycle** by comparing all entries in parallel. This is not an accelerator for a trie; it is a **replacement** for one. Costs: power, density, price per bit. |
| **SIMD instructions** | Already standard for within-node search: AVX-512 compares 8–16 keys in one instruction (V4 §21.6's ART Node16, §37.2's FAST). |

> **The TCAM is the most interesting entry, because it is the clean case of hardware defeating an
> algorithm.** A trie's log-depth descent is the best you can do with sequential comparisons. Give up
> sequential comparison — compare everything at once, in parallel, in silicon — and the tree
> disappears entirely. §38.14's table has it as a row for this reason.

**Research and early stage:**

- **In-storage / near-data processing.** Computational SSDs that can traverse an index internally and
  return only the answer, rather than shipping pages to the host. This directly attacks §36.1's
  worst ratio, and if it works it changes B+-tree design (why minimize page reads if the pages never
  cross the bus?).
- **Smart NICs and DPUs** performing lookups in the network path.
- **FPGA index accelerators**, including in-network aggregation.

**And the frontier observation, which I find the most striking thing in this chapter:**

> §36.1's table has grown twice during this book's own timeframe — the inter-core level became
> dominant as core counts rose, and persistent memory appeared and then largely vanished. CXL may add
> another. **Hardware is adding levels to the hierarchy faster than software is adapting to them**,
> and every new level re-poses the same question with a new constant. The design rules of §36.7 have
> held for fifty years; the arithmetic changes every few.

## 39.4 Learned indexes: the challenge to the premise

> **Confidence: high on the papers; moderate on the current assessment, which is contested and
> moving.**

The most direct attack on this book's premise, and it deserves to be taken seriously rather than
mentioned politely.

**The reframe** (Kraska, Beutel, Chi, Dean, Polyzotis, "The Case for Learned Index Structures",
SIGMOD 2018):

> A B-tree is a **function** that maps a key to a position. It is a *piecewise-constant step
> function*, implemented as a tree of comparisons, and it makes **no assumptions whatsoever** about
> the distribution of the keys.
>
> But real key distributions are rarely adversarial. If keys are roughly uniform, or roughly
> log-normal, or monotonically increasing timestamps, then **position ≈ f(key)** for some smooth,
> cheap function *f*. So: learn *f*.

If *f* can be represented in a few hundred bytes and evaluated in a few nanoseconds, it replaces a
multi-level tree with a couple of arithmetic operations, and the "index" becomes small enough to sit
entirely in L1.

**The line of work:**

| Work | Contribution |
|---|---|
| **RMI** (Kraska et al., 2018) | *Recursive model index* — a hierarchy of simple models (often linear regressions), each narrowing the position estimate, with a final local search to correct the residual |
| **ALEX** (Ding et al., SIGMOD 2020) | An **updatable** learned index — the original was effectively read-only |
| **PGM-index** (Ferragina & Vinciguerra, VLDB 2020) | Piecewise-linear ε-approximation with **provable** worst-case bounds and optimal space for a given error tolerance |

> **Ferragina, for the second time in this book** — the FM-index of Volume 4 §26.6 is his too. Add him
> to the list with McCreight (Volumes 3, 4) and Bender & Farach-Colton (Volume 3, §37.5, §40.8).

**The honest assessment:**

**For:** on read-mostly data with a smooth key distribution, learned indexes can be dramatically
smaller and faster than a B-tree, and the PGM-index line gives real worst-case guarantees rather
than only empirical results.

**Against:** updates are hard (the model goes stale, and retraining is expensive); adversarial or
highly irregular distributions defeat the premise; the early papers' baselines were criticized for
comparing against unoptimized B-trees rather than against §37.2-grade cache-aware ones; and the
guarantee a B-tree offers — **O(log_B n), for every input, forever, with no assumptions** — is worth
a great deal operationally, which is Volume 2 §14.3's point about worst-case versus average-case
bounds arriving in a new context.

**Why it belongs in this chapter regardless:** it is the sharpest available challenge to the whole
book. If a tree is fundamentally *just a way of mapping keys to positions*, then it is one
implementation of a function, and there may be better ones. Volume 4 §29 said a tree is a machine for
hierarchical summarization; the learned-index line says the summarization can sometimes be replaced
by regression. That is a real idea and it is not obviously wrong.

## 39.5 Still-open classics

Two questions that have been open for a long time and are worth knowing are still open.

**Dynamic optimality.** Volume 2 §12.5's conjecture: are splay trees within a **constant factor** of
the offline optimal binary search tree? Sleator and Tarjan asked in 1985. Forty years later the best
known bound is **O(log log *n*)-competitive** (tango trees, §40.4, and successors: multi-splay
trees, chain-splay, the greedy-BST line). **Nobody has proved constant-competitiveness and nobody has
disproved it.** It is arguably the most famous open problem in data structures, and it is about the
oldest structure in this book.

**Succinct trees, and whether the theory is used.** The information-theoretic minimum to store one of
the Catalan(*n*) shapes on *n* nodes is

$$
\log_2 C_n \approx 2n - O(\log n) \text{ bits}
$$

— roughly **2 bits per node**, against a pointer-based node's 256. And it is achievable: LOUDS
(Jacobson, 1989) and balanced-parentheses representations (Munro & Raman) store a tree in
2*n* + o(*n*) bits **with O(1) navigation** — parent, child, subtree size — using rank/select
structures over bitvectors. *(Confidence: moderate-high.)*

This is a **solved** problem that is **underused**. It appears in genomic indexes, succinct tries
(`marisa-trie`), and libraries like SDSL, and almost nowhere else. The open question is not
theoretical but sociological: why does a 128× space saving with O(1) operations not get adopted more
widely? Plausible answers: the constants on rank/select are real, the implementations are hard, and
most trees are not the memory bottleneck. But it remains a striking gap between what is known and
what is used.

---

