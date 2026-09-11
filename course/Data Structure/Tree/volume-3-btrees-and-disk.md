# Trees: A Complete Guide to the Data Structure, From First Principles to Production Systems

## Volume 3 — Crossing the Memory Wall: B-Trees and Disk Structures

---

### Where we left off

Volume 2 solved a problem completely. Given an in-memory binary search tree, we now have four
independent ways to guarantee its height stays O(log *n*) regardless of insertion order, and we
can say precisely which one to use for which workload. That problem is closed.

Volume 2 §14.2 then named a fifth answer and refused to develop it:

> **5. Change the node so the tree cannot get tall. — B-trees, Volume 3**
> None of the above touches the *fanout*. All four accept "binary" and manage shape within that
> constraint.

And Volume 2 §7.1 gave three reasons why fanout is pointless in RAM, the sharpest of which was:
**fanout does not reduce the comparison count.** A *k*-ary node with *k*−1 keys requires you to
search within the node, and the arithmetic works out to log₂(*n*) total comparisons no matter what
*k* you choose. Fanout buys you nothing.

That statement is true, and it is about to become irrelevant, because it assumes the comparison is
the unit of cost. Volume 1 §1.2 warned that this assumption is wrong once data leaves RAM, and
Volume 1 §6.6 put a number on it — a pointer dereference costing 10⁵ times more than a cache hit —
and then deferred the consequences to here.

**Volume 3 is those consequences.** Chapter 15 establishes the cost model from measured hardware
behaviour rather than assertion. Everything else in the volume is derived from it. By the end you
should be able to look at any storage structure — B+-tree, LSM-tree, fractal tree — and reconstruct
its design from three facts about the device it runs on.

Chapter numbering continues from Volume 2. Conventions from Volume 1 §3.4 still hold: root at depth
0, leaf height 0, empty tree height −1.

---

# Chapter 15 — The Physics of Access

## 15.1 The hierarchy, with numbers

Volume 1 §1.6 gave the top four rows of this table. Here is the whole thing, for hardware of
roughly the 2020s. All figures are **latency for a single, dependent access** — the time from
"I need this" to "I have it", with nothing else in flight.

| Level | Typical latency | Cycles @ 3 GHz | Typical capacity |
|---|---|---|---|
| Register | ~0.3 ns | 1 | ~1 KB |
| L1 cache | ~1 ns | ~4 | 32–128 KB |
| L2 cache | ~4 ns | ~12 | 0.5–2 MB |
| L3 cache | ~15–40 ns | ~50–120 | 8–256 MB |
| Main memory (DRAM) | ~80–100 ns | ~250–300 | 16 GB – 4 TB |
| NVMe SSD (PCIe 4/5) | **~20–100 µs** | ~10⁵ | 0.5–30 TB |
| SATA SSD | ~100–200 µs | ~5 × 10⁵ | 0.5–8 TB |
| 7200 RPM hard disk | **~8–10 ms** | ~3 × 10⁷ | 1–24 TB |
| Same-datacentre network round trip | ~100–500 µs | ~10⁶ | — |
| Cloud object store (first byte) | ~20–100 ms | ~2 × 10⁸ | ∞, effectively |
| Cross-region network round trip | ~50–150 ms | ~3 × 10⁸ | — |

The numbers are unwieldy because they span nine orders of magnitude. The standard trick is to
rescale so that L1 takes one second — multiply everything by 10⁹:

| Level | If L1 took one second… |
|---|---|
| L1 cache | **1 second** |
| L2 cache | 4 seconds |
| L3 cache | 30 seconds |
| Main memory | **1.7 minutes** |
| NVMe SSD | **14 hours** |
| SATA SSD | 1.7 days |
| Hard disk | **3 months** |
| Cloud object store | 1–3 years |
| Cross-region network | 3 years |

That table is the whole of Volume 3 in one image. **In human terms, the gap between checking your
own memory and asking a hard disk is the gap between one second and one financial quarter.** No
amount of algorithmic cleverness within a level compensates for one unnecessary trip to a lower
one.

## 15.2 Why the hierarchy exists at all

It is worth knowing that this is an economic structure, not a technical accident, because that
tells you it is not going away.

| Technology | Approximate cost per GB | Approximate latency | Volatile? |
|---|---|---|---|
| SRAM (caches) | $1,000s | ~1 ns | yes |
| DRAM (main memory) | ~$2–5 | ~100 ns | yes |
| NAND flash (SSD) | ~$0.05–0.15 | ~50 µs | no |
| Magnetic platter (HDD) | ~$0.01–0.02 | ~8 ms | no |

> **Confidence: low on the specific prices** — they move constantly and vary by market. The
> *ratios* are stable and are the point: roughly two to three orders of magnitude of cost
> difference between adjacent tiers, matched by two to three orders of magnitude of latency
> difference in the other direction.

Nobody would build a hierarchy if one technology were both fast and cheap. The hierarchy is a
**price-performance staircase**, and every level exists because someone wanted more capacity than
the level above could affordably provide. Which means:

> **The hierarchy is permanent, and its shape recurs at every scale.** Volume 1 §1.6 showed the
> RAM-versus-cache version of this problem. This volume solves the disk-versus-RAM version.
> Volume 6 returns to the observation that the *solution* transfers back up: the cache hierarchy
> recreates the disk problem in miniature, and B-tree-shaped answers work there too.

## 15.3 You cannot read a byte

Now the fact that does the real damage.

At every level below the register file, **the smallest unit of transfer is fixed and larger than
what you asked for**:

| Level | Minimum transfer unit | Why |
|---|---|---|
| Cache | **64-byte cache line** | Tag overhead and bus width make finer granularity uneconomic |
| DRAM | 64 bytes (a burst) | DDR transfers in bursts of 8 × 64-bit |
| NAND flash | **4 KB page** (read); erase in 128 KB – 4 MB **blocks** | Physics of the flash array |
| Hard disk | **512 B or 4 KB sector** | Formatting; error-correction coding is per sector |
| Filesystem / OS | **4 KB page** typically | Virtual memory page size |
| Database | **4–32 KB page** | Design choice, see §17.6 |
| Object store | Whole object, or a ranged GET with per-request overhead | Protocol |

So when you ask a hard disk for 24 bytes — a binary tree node from Volume 1 §6.1 — the disk reads
a 4 KB sector and hands you 24 bytes of it. **You paid for 4,096 bytes and used 0.6%.**

This is not a rounding error. It is the central inefficiency that B-trees exist to remove.

## 15.4 Latency versus bandwidth, and the number that matters

There are two independent costs to an access: the **latency** to get the first byte, and the
**bandwidth** consumed by the bytes themselves. Look at what happens when you vary the request
size on each device:

| Device | Latency | Bandwidth | Time for 24 B | Time for 8 KB | Time for 256 KB |
|---|---|---|---|---|---|
| DRAM | 100 ns | 30 GB/s | 100 ns | 100 ns + 0.27 µs | 100 ns + 8.5 µs |
| NVMe SSD | 50 µs | 5 GB/s | 50 µs | **50 µs + 1.6 µs** | 50 µs + 51 µs |
| Hard disk | 8 ms | 200 MB/s | 8 ms | **8 ms + 0.04 ms** | 8 ms + 1.3 ms |

Read the two bolded cells. On a hard disk, **reading 8 KB costs 0.5% more than reading 24 bytes.**
On NVMe, 3% more. The transfer is free; the *trip* is what costs.

Define the **breakeven size** as latency × bandwidth — the request size at which transfer time
finally equals latency:

$$
\text{breakeven} = L \times B
$$

| Device | Breakeven request size |
|---|---|
| DRAM | 100 ns × 30 GB/s = **3 KB** |
| NVMe SSD | 50 µs × 5 GB/s = **250 KB** |
| SATA SSD | 150 µs × 550 MB/s = **82 KB** |
| Hard disk | 8 ms × 200 MB/s = **1.6 MB** |

**On NVMe, reading 250 KB costs about the same as reading one byte. On a hard disk, 1.6 MB costs
about the same as one byte.**

That is the derivation the rest of the volume rests on. It says: *if you are going to make a trip
at all, bring back as much as you can possibly use, because the marginal bytes are nearly free.*

### One critical caveat, and it is the reason tree descent is special

You might object: modern SSDs achieve their headline throughput at high **queue depth** — hundreds
of requests in flight simultaneously. If you can issue 64 reads at once, per-request latency stops
mattering and you become bandwidth-limited. True.

**But a tree descent cannot do that.** To know which page to read at level 2, you must first read
and examine the page at level 1. Each read *depends* on the previous one. This is a **dependent
chain**, and no amount of parallelism helps a dependent chain — you pay the full latency, serially,
once per level.

This is exactly the pointer-chasing argument from Volume 1 §1.6 and §6.2, reappearing three orders
of magnitude larger. It is why:

- **Tree height translates directly into unavoidable serial latency.** Height 4 means four full
  latencies, back to back, with nothing to overlap them against.
- **Sequential scans are the opposite case.** You know all the addresses in advance, so you can
  issue them all at once (or let readahead do it). This asymmetry — descents pay latency, scans
  pay bandwidth — is why §19 pushes so hard on making scans sequential, and why Chapter 20's
  LSM-trees are built entirely around converting random writes into sequential ones.

## 15.5 The derivation: access count beats comparison count

Now put it together. Take a billion keys and compare a balanced binary tree against a high-fanout
tree, measuring both by comparisons and by page accesses.

**Balanced binary tree, *n* = 10⁹.** Height ≈ 30 (Volume 1 §3.5). Each node is ~24 bytes, at an
address determined by the previous node.

**B-tree with fanout 500, *n* = 10⁹.** Height 4 (derived properly in §17.5). Each node is one 8 KB
page.

| | Binary tree | Fanout-500 tree |
|---|---|---|
| **Comparisons** | 30 | ~4 × log₂(500) ≈ 36 |
| **Distinct pages touched** | **30** | **4** |
| **Bytes transferred** | 30 × 4 KB = 120 KB | 4 × 8 KB = 32 KB |

The fanout-500 tree does **more** comparisons — 36 against 30 — exactly as Volume 2 §7.1 promised.
Now price it on each device:

| Device | Binary (30 accesses) | Fanout-500 (4 accesses) | Speed-up |
|---|---|---|---|
| All in DRAM | 30 × 100 ns = **3 µs** | 4 × 100 ns = 0.4 µs + more compares ≈ **0.5 µs** | ~6× |
| NVMe SSD | 30 × 50 µs = **1.5 ms** | 4 × 50 µs = **0.2 ms** | **7.5×** |
| SATA SSD | 30 × 150 µs = **4.5 ms** | 4 × 150 µs = **0.6 ms** | 7.5× |
| Hard disk | 30 × 8 ms = **240 ms** | 4 × 8 ms = **32 ms** | 7.5× |
| Cross-region | 30 × 100 ms = **3 seconds** | 4 × 100 ms = 0.4 s | 7.5× |

And now the real number, because the top of any search tree is small and stays cached (Volume 1
§6.2 established this in miniature). For the fanout-500 tree, level sizes are:

```
root      :      1 page  =    8 KB   ← permanently cached, always
level 2   :    500 pages =    4 MB   ← permanently cached, trivially
level 3   :  250,000 pages = 2 GB    ← probably cached on a real server
leaves    : 2,000,000 pages = 16 GB  ← not cached
```

So a realistic lookup is **one or two physical reads**, not four. On NVMe: ~50–100 µs. The binary
tree's 30 accesses cannot be similarly cached away, because its levels are not small — level 20 of
a binary tree over 10⁹ keys holds a million nodes.

**The honest summary:**

| | Comparisons | Page accesses | Which one you pay for |
|---|---|---|---|
| In RAM | ~equal | 30 vs 4 | Both matter; binary is fine |
| On SSD | ~equal | 30 vs 4 | **Page accesses, overwhelmingly** |
| On disk | ~equal | 30 vs 4 | **Page accesses, catastrophically** |
| Over a network | ~equal | 30 vs 4 | **Page accesses; round trips are everything** |

**Volume 2 §7.1 was right that fanout does not reduce comparisons. It just turns out that
comparisons stopped being the bill.**

## 15.6 The other half: the bytes you paid for and threw away

There is a second, independent argument for high fanout, and it is worth separating because it
applies even when everything is cached.

A 24-byte binary node in a 4 KB page uses **0.6%** of what was transferred. A 8 KB B-tree node
holding 500 entries uses **~100%**. So:

| | Binary tree | Fanout-500 tree |
|---|---|---|
| Useful bytes per page read | 24 | ~8,100 |
| Utilization | **0.6%** | **~99%** |
| Pages needed to hold 10⁹ keys | 10⁹ nodes ≈ 24 GB (plus allocator overhead ≈ 32–48 GB) | ~2 × 10⁶ pages = **16 GB** |
| Effective cache capacity | you cache 0.6%-useful pages | you cache 99%-useful pages |

That last row is the subtle one and it compounds the first argument. If your buffer pool is 4 GB,
a B-tree fits three levels of a billion-key index into it with room to spare. A binary tree fits
about 12% of its nodes, chosen essentially at random by access pattern, and its hot upper levels
are not small enough to pin.

**So high fanout wins twice: fewer trips, and each trip fully used.**

## 15.7 The fix, derived rather than announced

We can now write down the structure we need without having seen one. Three requirements, each
forced by the preceding sections:

**Requirement 1 — one node must be exactly one block.** From §15.3 (you cannot read less than a
block) and §15.4 (the marginal bytes are free). Any node smaller than a block wastes the transfer;
any node larger than a block costs multiple trips for one logical step.

**Requirement 2 — therefore fanout is `block_size / entry_size`, and it is large.** Not chosen —
*derived*. An 8 KB block and a 16-byte entry give fanout ~500. This is why §17 has no
configurable order parameter: the order is whatever arithmetic says it is.

**Requirement 3 — all leaves must be at the same depth.** From §15.5: height is unavoidable serial
latency, so the *worst* path is what determines your p99 lookup time, and cost predictability is
what the query planner needs (Volume 1 §2.3 made the same argument in miniature). A structure whose
depth varied by path would have unpredictable latency, which on a device where one extra hop costs
8 ms is not acceptable.

Then height follows immediately:

$$
h \approx \log_{f}(n) \quad\text{with } f \approx 500 \text{ instead of } 2
$$

$$
\log_{500}(10^9) = \frac{\ln 10^9}{\ln 500} = \frac{20.7}{6.21} = 3.3
$$

**Four levels for a billion keys.** Requirements 1–3, plus a maintenance algorithm that preserves
requirement 3 under insertion and deletion, *is* a B-tree. Chapter 16 is who worked out the
maintenance algorithm and why they needed to.

## 15.8 A note on the phrase "memory wall"

> **Confidence: high on the paper, moderate on how the term is now used.**

The term comes from Wm. A. Wulf and Sally A. McKee, "Hitting the Memory Wall: Implications of the
Obvious", *ACM Computer Architecture News*, 1995. Their observation was that CPU speed was
improving much faster than DRAM latency, so the *ratio* between them was widening exponentially,
and therefore any program's performance would eventually be determined entirely by memory access
rather than computation.

They were right, and the effect is bigger than they framed it, because the same divergence applies
at every boundary in §15.1's table. Storage capacity and bandwidth have improved enormously since
1995; **storage latency has improved far less**, because latency is bounded by physics (rotational
speed, then flash programming time, then speed of light for network hops) rather than by density.

The practical consequence for this volume: **the design pressure that produced B-trees in 1972 has
gotten stronger, not weaker.** A structure invented for a device with 25 ms seek times is, if
anything, better justified on NVMe, because the ratio between compute and access has widened.

## 15.9 What wins where — the map for this volume

| Situation | The binding constraint | The right structure |
|---|---|---|
| Everything in RAM, read-heavy | Comparisons and cache lines | Balanced binary tree (Volume 2), or a cache-conscious B-tree (Volume 6) |
| Data exceeds RAM, read-heavy, range queries matter | **Page accesses per lookup** | **B+-tree** (§19) |
| Data exceeds RAM, write-heavy, random keys | **Random write cost** | **LSM-tree** (§20.6) or **Bε-tree** (§20.5) |
| Data exceeds RAM, both heavy | Everything at once | Pick two — the RUM conjecture (§20.8) |
| Data on a remote object store | **Round trips** | Very high fanout; aggressive caching; batched formats |

---

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

# Chapter 17 — B-Tree Mechanics

## 17.1 The terminology minefield, cleared

Volume 1 §3.4 flagged this and promised to untangle it here. There are two incompatible
conventions in wide use, they differ by a factor of two, and formulas written in one are wrong in
the other.

**Knuth's convention — "order *m*".** A B-tree of order *m* has **at most *m* children** per node,
hence at most *m* − 1 keys. Every non-root internal node has at least ⌈*m*/2⌉ children.

**CLRS's convention — "minimum degree *t*".** Every node has between *t* − 1 and 2*t* − 1 keys, and
between *t* and 2*t* children. The root may have as few as 1 key.

They describe the same structure with *m* = 2*t*. The trap: "a B-tree of order 5" means 5 children
under Knuth and would be an odd thing to say under CLRS; "a B-tree of degree 5" means 10 children.

There is a third usage in the wild — some authors and a great deal of code use "order" to mean the
maximum number of **keys** rather than children — and a fourth in database documentation, where
"order" sometimes just means "fanout, approximately."

> **Practical rule, and it is the same one Volume 1 §3.4 gave for tree height:** when you read a
> formula containing "order", test it against a tiny concrete case. If the formula gives a sensible
> answer for a node holding two keys, you have matched conventions. If it is off by a factor of
> two, you have not.

**This volume uses Knuth's order *m*** — *m* children, *m* − 1 keys — because it is the convention
in the original paper and in most database literature. And in practice I will mostly avoid the
word entirely in favour of **fanout**, meaning the actual number of children a node has, because
that is the quantity §15 showed us to care about.

## 17.2 The invariants

> **B-tree of order *m*.** For every node:
>
> **I1 — Capacity.** A node holds at most *m* − 1 keys and at most *m* children.
>
> **I2 — Minimum occupancy.** Every node except the root holds at least ⌈*m*/2⌉ − 1 keys, and every
> non-leaf non-root node has at least ⌈*m*/2⌉ children.
>
> **I3 — Root exception.** The root holds at least 1 key (if the tree is non-empty), and has at
> least 2 children if it is not a leaf.
>
> **I4 — Uniform leaf depth.** Every leaf is at exactly the same depth.
>
> **I5 — Separation.** A node with *k* keys *k*₁ < *k*₂ < … < *k*ₖ has exactly *k* + 1 children
> *c*₀ … *c*ₖ, and every key in subtree *c*ᵢ lies strictly between *k*ᵢ and *k*ᵢ₊₁ (with *k*₀ = −∞
> and *k*ₖ₊₁ = +∞).

For order *m* = 5, which I will use for all worked examples because it is the smallest order with
legible diagrams and an unambiguous split rule (§18.3):

| | Value |
|---|---|
| Max keys per node | 4 |
| Max children | 5 |
| Min keys, non-root | **2** |
| Min children, non-root internal | **3** |
| Min keys, root | 1 |

Here is a valid order-5 B-tree, which will be the running example:

```
                          ┌────┐
                          │ 90 │
                          └─┬──┘
              ┌─────────────┴─────────────┐
        ┌──────────┐                 ┌───────────┐
        │  30, 60  │                 │ 120, 150  │
        └────┬─────┘                 └─────┬─────┘
     ┌───────┼───────┐            ┌────────┼────────┐
┌────────┐┌───────┐┌───────┐ ┌──────────┐┌──────────┐┌──────────┐
│ 10, 20 ││ 40,50││ 70,80 │ │ 100, 110 ││ 130, 140 ││ 160, 170 │
└────────┘└───────┘└───────┘ └──────────┘└──────────┘└──────────┘

Check I5 on the left internal node [30, 60]:
   c₀ = [10,20]  — all keys < 30            ✔
   c₁ = [40,50]  — all keys between 30 and 60 ✔
   c₂ = [70,80]  — all keys > 60            ✔
Check I2: every non-root node has exactly 2 keys = the minimum  ✔
Check I4: all six leaves at depth 2         ✔
Check I3: root has 1 key, 2 children        ✔
```

**Note what is absent from that list.** There is no colour, no balance factor, no priority, no
height field, no rotation. Volume 2's entire apparatus is gone, and §16.6 explained why: with
hundreds of slots per node there is enough slack that the invariants maintain themselves.

## 17.3 Why "half full", and why it is self-maintaining

Two questions about I2. Why does a minimum exist at all, and why is the minimum *half*?

**Why a minimum exists.** Without one, nodes could hold a single key each, the fanout would collapse
to 2, and §17.5's height bound would evaporate. The minimum is what converts "the tree has high
fanout" from a hope into a guarantee. It is also what bounds the *storage*: a tree with no
occupancy floor could occupy arbitrarily many pages for a given key count, and §15.6 showed page
count is the currency.

**Why half, specifically, and this is the good part.** Because half is exactly what a split
produces. A full node has *m* − 1 keys; adding one gives *m*; sending one key up leaves *m* − 1 keys
to divide between two nodes, so each gets about (*m* − 1)/2 ≈ half of capacity.

> **The minimum-occupancy invariant is self-maintaining under insertion.** The only operation that
> creates new nodes is the split, and the split's natural output is precisely two nodes at the
> minimum. You never do extra work to preserve I2 — you get it for free from the mechanism that
> handles overflow.

That is why B-tree insertion has no case analysis. Compare Volume 2 §10.4's four AVL rotation cases
or §11.5's four red-black insertion cases, both of which exist because a binary node has no room
to absorb anything and every repair therefore has to move structure around.

Under **deletion**, I2 is *not* self-maintaining — removing a key can drop a node below the
minimum with no natural repair — and that asymmetry is exactly why §18.7 is the hard part of the
chapter. This mirrors Volume 2 precisely: AVL insertion needed one rotation and AVL deletion needed
Θ(log *n*). Insertion adds slack; deletion consumes it.

## 17.4 Why all leaves stay at the same depth

I4 looks like the hardest invariant to maintain and is in fact the easiest, for one structural
reason that is worth stating carefully because it is the heart of the design.

**A binary search tree grows at the leaves.** Insert a key, attach a new node below an existing
one, and *that one path* gets longer. Different paths grow at different rates, so the tree skews —
Volume 2 Chapter 9 in one sentence.

**A B-tree grows at the root.** When a leaf overflows it splits into two leaves *at the same
depth*, and one key moves up into the parent. The leaf level got **wider**, not deeper. If the
parent overflows it splits and pushes up again, cascading toward the root. Only when the **root**
itself overflows does a new root get created above it — and that adds one level to **every path
simultaneously.**

```
                      HOW A B-TREE GROWS

  before the root splits            after the root splits

        [ full root ]                      [ new root ]
        /  |  |  |  \                       /        \
       ▪   ▪  ▪  ▪   ▪              [left half]    [right half]
                                     / | | \        / | | \
                                    ▪  ▪ ▪  ▪      ▪  ▪ ▪  ▪

   every leaf at depth 1               every leaf at depth 2
                                       ALL paths grew together
```

The consequence:

> **I4 cannot be violated, because there is no operation that lengthens one root-to-leaf path
> without lengthening all of them.** Balance is not maintained by rebalancing; it is
> **structurally impossible to break.**

This is the same argument Volume 1 §2.3 made about B-trees in general and it is worth restating
because it explains the absence of rotations. A B-tree does not have a balancing algorithm. It has
a splitting algorithm, and balance is a side effect.

Mirror image: the only operation that *decreases* height is the root losing its last key when its
two children merge (§18.7). Growth and shrinkage both happen exclusively at the top.

## 17.5 The height formula, both directions

### Maximum keys for a given height

Every node full: *m* − 1 keys, *m* children. Leaves at depth *h*, root at depth 0.

- Nodes at depth *d*: at most *m*^*d*
- Total nodes: at most (m^(h+1) − 1)/(m − 1)
- Total keys: at most (m − 1) × that = **m^(h+1) − 1**

$$
n_{\max} = m^{h+1} - 1
$$

### Minimum keys for a given height — this gives the height bound

Be as sparse as I2 and I3 allow. Let *t* = ⌈*m*/2⌉ be the minimum children of a non-root internal
node.

- Root: 1 key, 2 children
- Depth *d* ≥ 1: at least 2*t*^(*d*−1) nodes, each with *t* − 1 keys

$$
n \ge 1 + (t-1)\sum_{d=1}^{h} 2t^{d-1} = 1 + 2(t-1)\cdot\frac{t^h - 1}{t - 1} = \mathbf{2t^h - 1}
$$

Inverting:

$$
\boxed{\;h \le \log_t\!\left(\frac{n+1}{2}\right), \qquad t = \left\lceil \frac{m}{2} \right\rceil \;}
$$

**Sanity check** at *m* = 5 (*t* = 3), *h* = 2: *n* ≥ 2·3² − 1 = 17. Count it directly on the
sparsest possible order-5 tree of height 2: root 1 key / 2 children; depth 1 has 2 nodes × 2 keys
= 4 keys and 3 children each = 6 nodes; depth 2 has 6 nodes × 2 keys = 12 keys.
1 + 4 + 12 = **17** ✔.

### What the bracket looks like at scale

For *m* = 500 (*t* = 250):

| Levels (*h*+1) | Minimum keys (2*t*^*h* − 1) | Maximum keys (*m*^(*h*+1) − 1) |
|---|---|---|
| 1 | 1 | 499 |
| 2 | 499 | 249,999 |
| 3 | 124,999 | 1.25 × 10⁸ |
| **4** | **3.1 × 10⁷** | **6.25 × 10¹⁰** |
| 5 | 7.8 × 10⁹ | 3.1 × 10¹³ |

A four-level order-500 B-tree holds somewhere between 31 million and 62 billion keys — a factor of
2,000 of uncertainty, which is the price of I2's generous slack. §17.7 shows real trees sit near
the top-middle of that range.

For *n* = 10⁹: *h* ≤ log₂₅₀(5 × 10⁸) = 20.03 / 5.52 = 3.63, so **h ≤ 3 — four levels, worst
case, guaranteed.** That confirms §15.7's estimate with a proper bound rather than an
approximation.

### The comparison that motivates everything

| *n* | Binary tree height | Order-500 B-tree height (max) |
|---|---|---|
| 10³ | 10 | 1 |
| 10⁶ | 20 | 2 |
| **10⁹** | **30** | **3** |
| 10¹² | 40 | 4 |

**A thousand-fold increase in data costs a B-tree one extra level.** And §15.5 priced each level at
one full device latency in a dependent chain that cannot be parallelized. That is the entire
argument of this volume, now with a proven bound behind it.

## 17.6 The fanout arithmetic, with real numbers

Fanout is not configured. It is `usable_page_bytes / entry_bytes`, and that has a direct,
frequently-underappreciated practical consequence.

Take an 8 KB page with ~40 bytes of header and bookkeeping: **~8,150 usable bytes.** An internal
node's entry is a key plus a child pointer (4–8 bytes).

| Key type | Key bytes | Entry bytes | **Fanout** | Levels for *n* = 10⁹ |
|---|---|---|---|---|
| `int32` | 4 | 16 (aligned) | **509** | **4** |
| `int64` / `bigint` | 8 | 16 | **509** | **4** |
| UUID | 16 | 24 | 339 | 4 |
| 32-byte hash | 32 | 40 | 203 | 4 |
| 64-byte text | 64 | 72 | 113 | **5** |
| 200-byte text | 200 | 208 | 39 | **6** |

> **Read the last two rows as an engineering instruction.** Choosing a 200-byte text column as your
> primary key instead of a `bigint` costs you **two extra levels** on a billion-row index. §15.5
> priced a level at one full device latency in a serial chain. So that schema decision costs two
> extra round trips on *every single lookup*, forever — and it costs the same again on every
> secondary index that has to reference the primary key (§19.9).
>
> Note also that `int32` and `int64` give **identical** fanout, because alignment padding absorbs
> the difference. Narrowing a key from 8 bytes to 4 buys you nothing here. This surprises people
> who assume smaller is always better; the granularity that matters is the aligned entry, not the
> key.

### Why 8 KB? Or 16 KB? Or 4 KB?

Larger pages give higher fanout and shorter trees:

| Page size | Usable | Fanout (16 B entries) | Levels for *n* = 10⁹ |
|---|---|---|---|
| 4 KB | ~4,050 | 253 | 4 |
| **8 KB** | ~8,150 | 509 | 4 |
| **16 KB** | ~16,340 | 1,021 | **3** |
| 32 KB | ~32,720 | 2,045 | 3 |

16 KB gets you to three levels for a billion keys, which is exactly why **InnoDB's default page
size is 16 KB** while PostgreSQL's is 8 KB. Neither is wrong; they weight the counter-pressures
differently, and there are five of them:

**1. Write amplification.** Modifying one 16-byte entry requires writing the whole page. On a 32 KB
page that is 32 KB of I/O for 16 bytes of change — and if the system logs full page images for
crash safety, the log entry is 32 KB too. This is the dominant argument against large pages and
§20.3 quantifies it.

**2. Lock and latch granularity.** A page is typically the unit of concurrency control. A 32 KB
leaf holds four times as many keys as an 8 KB leaf, so four times as many concurrent writers
contend for the same lock. Volume 5 develops this.

**3. Buffer cache granularity.** The cache holds a fixed number of fixed-size slots. If a query
needs one row and you must cache 32 KB to hold it, you evict more useful data. Fine-grained
caching wants small pages.

**4. Torn writes.** Devices guarantee atomicity at sector granularity — 512 B or 4 KB. Any page
larger than that can be half-written by a crash, producing a page that is not merely stale but
*unparseable*. Larger pages make this worse and make the repair mechanism (full-page logging) more
expensive. Volume 5, again.

**5. Read amplification for point queries.** Reading 32 KB to extract one 100-byte row wastes
bandwidth, which matters at high queue depth where §15.4's latency argument no longer dominates.

8 KB and 16 KB are where these five curves are simultaneously tolerable. The values have been
stable for decades, which is usually a sign that the optimum is broad and flat rather than that
nobody has looked.

### The maximum item size, and why it is about progress rather than space

Real implementations refuse to index a value larger than roughly **one third of a page**. The reason
is not space efficiency — it is a **termination guarantee**.

A page must be able to hold at least **three** items: two data items plus one separator (or, in a
B+-tree, a high key). If only one data item fits, then splitting a full page produces a page that
is *still* full, the insertion cannot make progress, and you get an infinite loop or a corrupt
tree. The 1/3 rule is what makes "split makes progress" provable.

The practical consequence: you cannot build a B-tree index directly on large values. The standard
answers are to index a hash or prefix of the value, or to use a structure designed for it (Volume 4
covers tries for exactly this case).

## 17.7 Space utilization: the 69% rule

I2 guarantees ≥50% occupancy. What do real trees actually achieve?

> **Confidence: high on the result, moderate on the exact citation.** For random insertions with
> median splits, the expected steady-state page occupancy converges to **ln 2 ≈ 69.3%.** The
> classic analysis is usually attributed to A. C. Yao, "On random 2-3 trees" (*Acta Informatica*,
> 1978), and the result generalizes to any order.

The intuition: after a split, both halves sit at ~50%. Insertions then fill them toward 100%, at
which point they split again and return to 50%. Occupancy is roughly uniformly distributed over
[50%, 100%], and the expected value works out to ln 2 rather than the naive 75% because pages
spend more time near the bottom of the range (a nearly-empty page needs many insertions to fill,
while a nearly-full one splits immediately).

**So a B-tree is intrinsically ~1/0.693 = 1.44× larger than its data strictly requires.** That 44%
is not waste — it is the headroom that makes an insertion a local page modification instead of a
global reorganization. It is the direct purchase price of everything ISAM could not do (§16.2).
§20.2 shows what it costs to buy the space back.

### The sequential-insertion trap

The 69% figure assumes **random** insertion order. Sequential insertion — the autoincrement primary
key, the timestamp, the sorted bulk load; Volume 2 §9.3's whole list — behaves completely
differently, and much worse if you are not careful:

```
Sequential keys with a naive median split:

  page P fills up          →  splits 50/50  →  all further keys go RIGHT
  [.....100% full.....]       [50%][50%]        ↑
                                                 the LEFT page's key range is
                                                 permanently in the past.
                                                 It will NEVER receive another
                                                 insertion. It sits at 50% forever.

  Repeat for every page  ⟹  THE ENTIRE INDEX IS PERMANENTLY 50% FULL
```

The index is twice the size it needs to be, and half your buffer cache is holding empty space.

The fix, used by every serious implementation, is to detect that the splitting page is the
**rightmost page at its level** — the signature of sequential insertion — and split lopsidedly,
leaving the left page at 90–100% and putting only the new key on the right. This single heuristic
nearly halves index size for the most common key pattern in existence.

> Volume 2 §14.3 said slack is the design variable. Here it is again: the *split point* is a slack
> parameter, and choosing it based on a cheap observation about position (am I rightmost?) recovers
> almost 2× in space. Note that this is the first appearance in this book of a structure adapting
> to its access pattern *without* the splay tree's cost of mutating on reads (Volume 2 §12.6). It
> is possible to be adaptive cheaply if you pick the right signal.

## 17.8 What fanout does not buy you

Closing the loop on Volume 2 §7.1 honestly, because it is easy to over-learn this volume's lesson.

**Comparisons are unchanged.** Searching a fanout-*f* tree of height *h* requires *h* × log₂(*f*)
comparisons if you binary-search within each node — which is log₂(*n*) total, exactly the same as a
binary tree. Volume 2 §7.1 was right and remains right. A B-tree does **not** reduce CPU work.
In-memory, against a well-laid-out binary tree, a B-tree's advantage comes entirely from cache
behaviour, not from comparison count.

**Within-node search recreates the problem one level down.** An 8 KB page spans 128 cache lines.
Binary-searching within it jumps around that region unpredictably, incurring ~7–9 cache misses —
the same pointer-chasing pathology from Volume 1 §6.2, at a smaller scale. Real implementations
therefore often binary-search down to a small range and then scan linearly, or use SIMD to compare
several keys at once. Volume 6 is about taking this seriously and designing the *within-page*
layout for the cache hierarchy explicitly.

**Fanout costs write amplification.** A large node means a large minimum write. §20.3 quantifies
this, and it is the reason an entire competing lineage of structures exists.

---

# Chapter 18 — Search, Insert, Delete

## 18.1 Search

```
def search(node, k):
    while node is not None:
        i = 0
        while i < node.num_keys and k > node.keys[i]:
            i += 1
        if i < node.num_keys and k == node.keys[i]:
            return (node, i)                      # found
        if node.is_leaf:
            return None                           # not present
        node = node.children[i]                   # descend
```

One page read per level. Note the plain B-tree can **terminate early** — if the key happens to be
in an internal node, you stop there. §19.1 explains why this apparent advantage is worthless.

### Worked example

On §17.2's running tree, searching for **140** and then for **145**:

```
                          ┌────┐
                          │ 90 │
                          └─┬──┘
              ┌─────────────┴─────────────┐
        ┌──────────┐                 ┌───────────┐
        │  30, 60  │                 │ 120, 150  │
        └────┬─────┘                 └─────┬─────┘
     ┌───────┼───────┐            ┌────────┼────────┐
┌────────┐┌───────┐┌───────┐ ┌──────────┐┌──────────┐┌──────────┐
│ 10, 20 ││ 40,50││ 70,80 │ │ 100, 110 ││ 130, 140 ││ 160, 170 │
└────────┘└───────┘└───────┘ └──────────┘└──────────┘└──────────┘

search(140):
  READ 1 — root [90].           140 > 90        → child c₁
  READ 2 — node [120, 150].     120 < 140 < 150 → child c₁
  READ 3 — leaf [130, 140].     140 == 140      → FOUND
                                                    3 page reads.

search(145):
  READ 1 — root [90].           145 > 90        → child c₁
  READ 2 — node [120, 150].     120 < 145 < 150 → child c₁
  READ 3 — leaf [130, 140].     145 > 140, leaf → NOT PRESENT
                                                    3 page reads.
```

Two observations that will matter later. **A failed search costs exactly the same as a successful
one** — unlike Volume 1 §1.2's unsorted array where proving absence always cost the maximum. And
**the failed search terminated exactly at the position where 145 would have to be inserted**, which
is the same fact Volume 2 §8.3 exploited: insertion is a failed search plus a local modification.

## 18.2 Within-node search: a real design decision

With ~500 keys per node, how you search *inside* a node is not a triviality.

| Method | Comparisons | Cache behaviour | When to use |
|---|---|---|---|
| **Linear scan** | ~*f*/2 = 250 | **Excellent** — sequential, prefetchable | Small nodes; cheap comparisons |
| **Binary search** | log₂(*f*) ≈ 9 | **Poor** — ~7–9 cache misses within the page | Large nodes; expensive comparisons (strings, collations) |
| **Hybrid** | ~9 then ~8 | Good | What most real implementations do |
| **SIMD scan** | 250/8 vector ops | Excellent | Fixed-width integer keys |

The tension is exactly §15's tension, one level down: binary search minimizes *comparisons*, linear
scan minimizes *cache misses*, and which wins depends on how expensive a comparison is. For 8-byte
integers, comparisons are nearly free and linear or SIMD scanning often beats binary search
outright. For collated text comparisons costing hundreds of nanoseconds each, binary search wins
easily.

> This is the same question §15.5 answered for page accesses, appearing at the cache-line level.
> It is the clearest possible illustration of the thesis Volume 6 will build on: **the memory
> hierarchy poses the same problem at every boundary, and the answer always has the same shape.**

## 18.3 Insertion, and why the median

Insertion is: descend to the correct leaf, insert in order, and if the node overflows, split.

```
def insert(root, k):
    leaf = descend_to_leaf(root, k)      # recording the path
    insert_into_node(leaf, k)            # keys stay sorted
    node = leaf
    while node.num_keys > m - 1:         # overflow
        node = split(node)               # may return the parent to re-check
    ...
```

### The split, derived

A split must turn one overfull node into **two legal nodes plus one key to send up.** Legality
means both halves satisfy I2: at least ⌈*m*/2⌉ − 1 keys each.

Overflow state: the node holds *m* keys (its maximum *m* − 1, plus the one we just added). Split at
position *i* (0-indexed): the left node gets keys[0…*i*−1] = ***i*** keys, key[*i*] goes **up**,
and the right node gets keys[*i*+1…*m*−1] = ***m* − 1 − *i*** keys.

Both must satisfy I2:

$$
i \ge \left\lceil \tfrac{m}{2} \right\rceil - 1
\qquad\text{and}\qquad
m - 1 - i \ge \left\lceil \tfrac{m}{2} \right\rceil - 1
$$

The second rearranges to *i* ≤ *m* − ⌈*m*/2⌉ = ⌊*m*/2⌋. So:

$$
\left\lceil \tfrac{m}{2} \right\rceil - 1 \;\le\; i \;\le\; \left\lfloor \tfrac{m}{2} \right\rfloor
$$

Now evaluate that interval:

- **Odd *m* = 2*t* + 1:** ⌈*m*/2⌉ = *t* + 1, so *i* ∈ [*t*, *t*]. **Exactly one legal split point,
  and it is the median.**
- **Even *m* = 2*t*:** ⌈*m*/2⌉ = *t*, so *i* ∈ [*t* − 1, *t*]. **Two adjacent legal choices**, one
  either side of centre.

> **So "split at the median" is not an aesthetic preference about balance. For odd order it is the
> only legal split point — every other choice violates the minimum-occupancy invariant on one
> side. For even order there are exactly two choices, and the median-ish one is preferred because
> it maximizes the smaller half, and therefore maximizes how many future insertions either side can
> absorb before splitting again.**

Verify at *m* = 5 (*t* = 2): overflow gives 5 keys; *i* = 2; left gets 2 keys, the 3rd key goes up,
right gets 2 keys. Both at exactly the minimum — §17.3's self-maintenance, concretely.

And note the exception that §17.7 already flagged: the *rightmost-page* heuristic deliberately
violates the preference for the median (though never the *legality* constraint) in order to fix the
sequential-insertion trap. Legality is mandatory; centring is a heuristic.

## 18.4 Building a tree from scratch — fully worked

Order 5 (max 4 keys). Insert 10, 20, 30, …, 170 in order. This is the sequential-insertion pattern,
using naive median splits so you can see the mechanism cleanly.

```
STEP 1 — insert 10, 20, 30, 40.  All fit in the root leaf.

    ┌────────────────┐
    │ 10, 20, 30, 40 │       4 keys = max. Legal, but full.
    └────────────────┘
```

```
STEP 2 — insert 50.  Overflow: [10,20,30,40,50] = 5 keys.
         Split at i = 2:  left = {10,20},  UP = 30,  right = {40,50}
         There is no parent, so a NEW ROOT is created. Height 0 → 1.

              ┌────┐
              │ 30 │
              └─┬──┘
         ┌──────┴──────┐
    ┌────────┐    ┌────────┐
    │ 10, 20 │    │ 40, 50 │
    └────────┘    └────────┘
```

```
STEP 3 — insert 60, 70.  Both go to the right leaf.

              ┌────┐
              │ 30 │
              └─┬──┘
         ┌──────┴──────┐
    ┌────────┐  ┌────────────────┐
    │ 10, 20 │  │ 40, 50, 60, 70 │   full
    └────────┘  └────────────────┘
```

```
STEP 4 — insert 80.  Right leaf overflows: [40,50,60,70,80].
         Split at i = 2:  left = {40,50},  UP = 60,  right = {70,80}
         The parent [30] has room, so 60 is simply inserted there.

                  ┌──────────┐
                  │  30, 60  │
                  └────┬─────┘
         ┌─────────────┼─────────────┐
    ┌────────┐    ┌────────┐    ┌────────┐
    │ 10, 20 │    │ 40, 50 │    │ 70, 80 │
    └────────┘    └────────┘    └────────┘
```

```
STEP 5 — insert 90, 100.  Right leaf → [70,80,90,100], full.
STEP 6 — insert 110.  Overflow → split: left {70,80}, UP = 90, right {100,110}
         Parent becomes [30, 60, 90].

                     ┌──────────────┐
                     │  30, 60, 90  │
                     └──────┬───────┘
        ┌──────────┬────────┴────────┬──────────┐
   ┌────────┐ ┌────────┐      ┌────────┐  ┌──────────┐
   │ 10, 20 │ │ 40, 50 │      │ 70, 80 │  │ 100, 110 │
   └────────┘ └────────┘      └────────┘  └──────────┘
```

```
STEP 7 — insert 120, 130 → rightmost leaf [100,110,120,130], full.
STEP 8 — insert 140.  Overflow → split: left {100,110}, UP = 120, right {130,140}
         Parent becomes [30, 60, 90, 120] — 4 keys, FULL but still legal.

                    ┌────────────────────┐
                    │  30, 60, 90, 120   │
                    └─────────┬──────────┘
      ┌──────────┬────────────┼────────────┬────────────┐
 ┌────────┐ ┌────────┐  ┌────────┐  ┌──────────┐  ┌──────────┐
 │ 10, 20 │ │ 40, 50 │  │ 70, 80 │  │ 100, 110 │  │ 130, 140 │
 └────────┘ └────────┘  └────────┘  └──────────┘  └──────────┘
```

```
STEP 9 — insert 150, 160 → rightmost leaf [130,140,150,160], full.

STEP 10 — insert 170.  THE CASCADE.

  (a) Leaf [130,140,150,160,170] overflows.
      Split at i = 2: left = {130,140}, UP = 150, right = {160,170}

  (b) The parent is [30,60,90,120] — already full. Inserting 150 gives
      [30,60,90,120,150] = 5 keys → THE PARENT OVERFLOWS TOO.
      Split at i = 2: left = {30,60}, UP = 90, right = {120,150}

  (c) There is no parent above. A NEW ROOT is created holding 90.
      HEIGHT 1 → 2.
```

```
FINAL TREE:
                          ┌────┐
                          │ 90 │
                          └─┬──┘
              ┌─────────────┴─────────────┐
        ┌──────────┐                 ┌───────────┐
        │  30, 60  │                 │ 120, 150  │
        └────┬─────┘                 └─────┬─────┘
     ┌───────┼───────┐            ┌────────┼────────┐
┌────────┐┌───────┐┌───────┐ ┌──────────┐┌──────────┐┌──────────┐
│ 10, 20 ││ 40,50││ 70,80 │ │ 100, 110 ││ 130, 140 ││ 160, 170 │
└────────┘└───────┘└───────┘ └──────────┘└──────────┘└──────────┘

VERIFY:
  I1 no node exceeds 4 keys                                    ✔
  I2 every non-root node has ≥ 2 keys                          ✔
  I3 root has 1 key, 2 children                                ✔
  I4 all six leaves at depth 2                                 ✔
  I5 left node [30,60]: children <30, 30–60, >60               ✔
     right node [120,150]: children <120, 120–150, >150        ✔
  In-order traversal: 10,20,30,40,50,60,70,80,90,100,110,120,
                      130,140,150,160,170                       ✔ sorted, 17 keys
```

**17 keys is exactly the minimum for a height-2 order-5 tree** (§17.5's sanity check). The
sequential-insertion pattern produced the sparsest legal tree — which is §17.7's trap, visible in
the finished artifact: every non-root node sits at exactly 50% occupancy, and none of the left-hand
nodes will ever receive another key.

## 18.5 The cascade and the root split

Two properties are now visible, and they are the ones to remember.

**Splits cascade upward, and each level costs O(1) pages.** A split writes two pages at level *d*
and modifies one at level *d*+1. Worst case it repeats at every level: **O(*h*) page writes**,
which is O(log_f *n*) — four writes for a billion keys. Nothing outside the root-to-leaf path is
ever touched, which is exactly what ISAM could not achieve (§16.2).

**The root split is the only operation that increases height.** And it increases it for every path
at once, which is why I4 holds automatically (§17.4). A root split is also the only operation that
changes *which page is the root*, which turns out to matter enormously for implementation: readers
must be able to find a root that can move. The standard solution is a fixed-location **metapage**
whose contents are a pointer to the current root — one level of indirection so the root can
relocate. Volume 5 returns to this.

**How often does a cascade happen?** Rarely, and the arithmetic is reassuring. Splits at the leaf
level happen roughly once every *f*/2 insertions. A split at level 1 happens once every *f*/2 leaf
splits, so once every (*f*/2)² insertions. For *f* = 500: leaf split every ~250 insertions, level-1
split every ~62,500, level-2 split every ~15.6 million, root split every ~4 billion.

$$
\text{amortized page writes per insertion} \approx 1 + \frac{2}{f/2} + \frac{2}{(f/2)^2} + \cdots \approx 1.008
$$

**Amortized, an insertion writes barely more than one page.** The worst case is O(*h*), the average
is essentially 1. This is the same structure of result as Volume 1 §1.3's amortized array growth
and Volume 2 §11.5's amortized red-black restructuring — and it carries the same caveat: the rare
expensive operation is a real latency spike, not a fiction.

## 18.6 Preemptive versus reactive splitting

A genuine design fork, and one whose motivation is entirely about concurrency.

**Reactive (bottom-up), what §18.4 did.** Descend to the leaf, insert, split on the way back up as
needed. Requires remembering the path (a stack, or parent pointers) so you can revisit ancestors.

**Preemptive (top-down), which is what CLRS presents.** On the way *down*, split every full node
you pass through, whether or not it needs it. Since you split the parent before descending, **the
parent always has room when a child splits, so a split never cascades.**

| | Reactive | Preemptive |
|---|---|---|
| Splits performed | Only when necessary | Some unnecessary ones |
| Average occupancy | ~69% (§17.7) | **Lower** — you split nodes that would have been fine |
| Needs the path remembered? | **Yes** | No — single downward pass |
| Can release a lock on a node once you leave it? | **No** — you may have to come back | **Yes** |
| Cascade possible? | Yes, O(*h*) | **No, never** |

That fourth row is the whole reason preemptive splitting exists. Under concurrency, holding locks
on ancestors while you descend is what kills parallelism — the root is touched by *every*
operation, so any scheme that holds a lock on it serializes the entire index. Preemptive splitting
lets a writer release each node's lock as it moves down, because it will never need to return.

The cost is measurably worse space utilization, and the modern answer is neither: it is Lehman &
Yao's algorithm, which achieves single-node locking *with* reactive splitting by adding sibling
links and a clever recovery rule for readers. That is Volume 5's central topic, and this section
exists mainly so you know what problem it is solving.

## 18.7 Deletion

Deletion is the hard half, for the reason §17.3 gave: **I2 is self-maintaining under insertion and
not under deletion.** Removing a key can drop a node below ⌈*m*/2⌉ − 1 keys — an **underflow** — and
there is no natural mechanism that repairs it.

There are exactly two repairs, and each is forced by an invariant that would otherwise break.

### Repair 1 — borrow from a sibling (redistribution)

If an adjacent sibling has **more than** the minimum, take one of its keys.

But you cannot simply move a key sideways, and **understanding why is the derivation.** Suppose
node *X* is deficient, its right sibling *Y* has a spare key, and the parent's separator between
them is *s*. If you moved *Y*'s smallest key *y* directly into *X*, then *X* would contain *y* > *s*
— and *X* is the child *left* of separator *s*. **I5 broken.**

So the separator must move too, and there is only one arrangement that works: **rotate through the
parent.**

```
BEFORE — X is deficient, Y has a spare key                AFTER — rotate through the parent

        parent:  [ …, s, … ]                                  parent:  [ …, y₁, … ]
                  /       \                                             /        \
     X: [ too few keys ]   Y: [ y₁, y₂, y₃ ]              X: [ …, s ]              Y: [ y₂, y₃ ]

    s comes DOWN into X (it is greater than           I5 restored: X's keys are all < y₁ ✔
    everything in X, so it appends legally)                        Y's keys are all > y₁ ✔
    y₁ goes UP to become the new separator            X gained a key; Y is still ≥ minimum ✔
```

The separator's job is to be a boundary between the two children. Move the boundary to *Y*'s new
first key, and the old boundary — which is genuinely between *X*'s keys and *Y*'s remaining keys —
becomes *X*'s new largest key. Every key still appears exactly once, and I5 holds.

### Repair 2 — merge

If **no** adjacent sibling can spare a key, then every sibling sits at exactly ⌈*m*/2⌉ − 1. There
is nothing to borrow. So instead, **combine** the deficient node, one sibling, and the separator
between them into a single node.

**Does it fit?** This is the question the invariants must answer, and they do:

- deficient node: ⌈*m*/2⌉ − 2 keys
- sibling at minimum: ⌈*m*/2⌉ − 1 keys
- the separator pulled down: 1 key
- **total: 2⌈*m*/2⌉ − 2**

Against the maximum of *m* − 1:

| | Total after merge | Max allowed | Fits? |
|---|---|---|---|
| Odd *m* = 2*t*+1 | 2*t* = *m* − 1 | *m* − 1 | ✔ **exactly full** |
| Even *m* = 2*t* | *m* − 2 | *m* − 1 | ✔ one slot spare |

**A merge always fits, and for odd order it produces a completely full node.** That is not luck —
it falls directly out of choosing the minimum to be half the maximum (§17.3). The same choice that
makes splitting self-maintaining makes merging always feasible.

**And then the parent loses a key**, because the separator went down into the merged node. So the
parent may underflow, and the repair **cascades upward** — the exact mirror of the split cascade.
If the cascade reaches the root and the root loses its last key, the merged child becomes the new
root and **the tree's height decreases by one.** The only height-decreasing operation, mirroring
the root split.

### The algorithm

```
def delete(node, k):
    if k is in an internal node:
        # cannot remove it directly — it is a separator, and I5 needs a boundary there.
        # Same trick as Volume 2 §8.4: replace it with its in-order predecessor or
        # successor (which lives in a LEAF), then delete THAT from the leaf.
        replace k with its predecessor p from the leftmost leaf of the right subtree
        k, node = p, that leaf
    remove k from the leaf
    while node is not root and node.num_keys < ceil(m/2) - 1:
        if a sibling has a spare key: borrow(node); break          # terminates
        else:                         node = merge(node)           # may cascade
```

Note the internal-node case reuses Volume 2 §8.4's insight exactly: do not remove the *node*,
remove the *key*, by first moving a legally-substitutable key into its place from a position where
deletion is easy. In a B-tree that position is always a leaf, so the recursion terminates
immediately.

## 18.8 Deletion, fully worked

Both repairs, on concrete trees.

### Part A — a borrow

Start from §18.4's final tree with 180 additionally inserted, so one leaf has a spare key:

```
                          ┌────┐
                          │ 90 │
                          └─┬──┘
              ┌─────────────┴─────────────┐
        ┌──────────┐                 ┌───────────┐
        │  30, 60  │                 │ 120, 150  │
        └────┬─────┘                 └─────┬─────┘
     ┌───────┼───────┐            ┌────────┼──────────┐
┌────────┐┌───────┐┌───────┐ ┌──────────┐┌──────────┐┌───────────────┐
│ 10, 20 ││ 40,50││ 70,80 │ │ 100, 110 ││ 130, 140 ││ 160, 170, 180 │
└────────┘└───────┘└───────┘ └──────────┘└──────────┘└───────────────┘

DELETE 130.

  Leaf [130,140] → [140].  1 key < 2 minimum → UNDERFLOW.
  Right sibling [160,170,180] has 3 keys > 2 → CAN SPARE. Borrow.

  Separator between them in the parent [120,150] is 150.
    → 150 comes DOWN into the deficient leaf:      [140] → [140, 150]
    → 160 goes UP to be the new separator:          parent [120,150] → [120,160]
    → sibling loses its first key:                  [160,170,180] → [170,180]
```

```
RESULT:
                          ┌────┐
                          │ 90 │
                          └─┬──┘
              ┌─────────────┴─────────────┐
        ┌──────────┐                 ┌───────────┐
        │  30, 60  │                 │ 120, 160  │
        └────┬─────┘                 └─────┬─────┘
     ┌───────┼───────┐            ┌────────┼────────┐
┌────────┐┌───────┐┌───────┐ ┌──────────┐┌──────────┐┌──────────┐
│ 10, 20 ││ 40,50││ 70,80 │ │ 100, 110 ││ 140, 150 ││ 170, 180 │
└────────┘└───────┘└───────┘ └──────────┘└──────────┘└──────────┘

VERIFY I5 on [120, 160]:  children <120 ✔, 120–160 ✔, >160 ✔
VERIFY I2: every non-root node has ≥ 2 keys ✔
In-order (right subtree): 100,110,120,140,150,160,170,180
  — original was 100,110,120,130,140,150,160,170,180; we removed 130. ✔
  Note 150 and 160 each still appear EXACTLY ONCE — 150 moved from an
  internal node into a leaf, 160 moved from a leaf into an internal node. ✔
  No key was duplicated or lost; only their positions rotated.
```

### Part B — a merge that cascades to the root

Back to §18.4's final tree, where **every** non-root node has exactly the minimum 2 keys — so no
borrow is ever possible:

```
                          ┌────┐
                          │ 90 │
                          └─┬──┘
              ┌─────────────┴─────────────┐
        ┌──────────┐                 ┌───────────┐
        │  30, 60  │                 │ 120, 150  │
        └────┬─────┘                 └─────┬─────┘
     ┌───────┼───────┐            ┌────────┼────────┐
┌────────┐┌───────┐┌───────┐ ┌──────────┐┌──────────┐┌──────────┐
│ 10, 20 ││ 40,50││ 70,80 │ │ 100, 110 ││ 130, 140 ││ 160, 170 │
└────────┘└───────┘└───────┘ └──────────┘└──────────┘└──────────┘

DELETE 10.

  (a) Leaf [10,20] → [20].  UNDERFLOW.
      No left sibling (leftmost). Right sibling [40,50] has exactly 2 = minimum.
      → CANNOT BORROW. MERGE.

      Merge [20] + separator 30 (pulled down) + [40,50]  →  [20, 30, 40, 50]
      = 4 keys = m − 1. Exactly full, as the odd-order derivation predicts. ✔

      Parent [30,60] loses 30 → becomes [60], with 2 children.

              ┌────┐
              │ 90 │
              └─┬──┘
        ┌───────┴────────┐
     ┌──────┐        ┌───────────┐
     │  60  │        │ 120, 150  │        ← [60] has 1 key < 2 → UNDERFLOW
     └──┬───┘        └─────┬─────┘           at the INTERNAL level
   ┌────┴─────┐         ┌──┼───┐
[20,30,40,50] [70,80]  ...

  (b) Internal node [60] underflows.
      Its only sibling [120,150] has exactly 2 = minimum → CANNOT BORROW. MERGE.

      Merge [60] + separator 90 (pulled down from the root) + [120,150]
        →  [60, 90, 120, 150]   = 4 keys ✔
      Children collected in order:
        [20,30,40,50], [70,80], [100,110], [130,140], [160,170]  = 5 children ✔
        (4 keys + 1 = 5 children, satisfying I5)

  (c) The root loses its only key 90 → the root is now empty.
      The merged node becomes the NEW ROOT.  HEIGHT 2 → 1.
```

```
RESULT:
                  ┌──────────────────────┐
                  │  60, 90, 120, 150    │
                  └──────────┬───────────┘
     ┌──────────────┬────────┼────────┬──────────────┐
┌──────────────┐┌───────┐┌──────────┐┌──────────┐┌──────────┐
│ 20,30,40,50  ││ 70,80││ 100, 110 ││ 130, 140 ││ 160, 170 │
└──────────────┘└───────┘└──────────┘└──────────┘└──────────┘

VERIFY I5:  separators 60, 90, 120, 150 → ranges <60, 60–90, 90–120, 120–150, >150
   [20,30,40,50] all < 60          ✔
   [70,80]       between 60 and 90 ✔
   [100,110]     between 90 and 120 ✔
   [130,140]     between 120 and 150 ✔
   [160,170]     > 150             ✔
VERIFY I4: all five leaves at depth 1 ✔
In-order: 20,30,40,50,60,70,80,90,100,110,120,130,140,150,160,170
   — 16 keys, the original 17 minus the deleted 10. ✔
```

**One deletion cascaded through two levels and shrank the tree.** Compare §18.4 Step 10, where one
insertion cascaded through two levels and grew it. The operations are exact mirrors, and both are
O(*h*) page writes in the worst case.

## 18.9 Why real systems often do not do this

Everything in §18.7 is correct, elegant, and **widely not implemented.** Most production B-tree
systems do not merge and do not borrow. They delete the key, leave the node underfull, and move on.

Three reasons, and they are all about the environment rather than the algorithm.

**1. Merging requires locking multiple pages at once.** A merge touches the deficient node, a
sibling, and the parent, and must do so atomically. §18.6 already showed that holding locks across
multiple nodes and levels is the thing that destroys concurrency. Worse — and this is the deep
reason — a merge moves keys **leftward**, while the standard high-concurrency algorithm (Lehman &
Yao) depends critically on content only ever moving **rightward**, so that a reader with a stale
pointer can always recover by walking right. **Implementing merge would break the concurrency
scheme outright.** Volume 5 develops this properly; it is the single most important trade-off in
production B-tree design.

**2. In an MVCC database, the index does not know what is dead.** A deleted row's index entry
cannot be removed at deletion time, because concurrent transactions with older snapshots may still
need to see it — and index entries typically carry no visibility information at all. So deletion
becomes an asynchronous, deferred, batched activity rather than something the deleting transaction
does. Volume 5.

**3. Deferred cleanup is usually cheaper.** Rebalancing on every deletion does work that the next
insertion may immediately undo. The cheapest way to do work is often to promise to do it later and
then do it in bulk — Volume 1 §1.4 noted the same thing about tombstones in sorted arrays, and
§20.6 shows an entire structure built on that principle.

**The cost paid:** an index whose key distribution shifts over time accumulates sparsely-filled
pages that are never reclaimed. This is **index bloat**, and the only true remedy is to rebuild the
index. It is not a bug; it is the deliberate price of cheap concurrent descent.

> **The transferable lesson**, and it is Volume 2 §8.4's Hibbard-deletion lesson at a larger scale:
> a textbook algorithm can be individually correct and collectively wrong for its environment.
> §18.7's merge is *provably* correct and *practically* rejected, and the rejection is not
> laziness — it is a considered trade of space against concurrency. When you find that real systems
> do not implement the algorithm you were taught, the interesting question is always which
> constraint the textbook was not modelling.

---

# Chapter 19 — B+-Trees: Push the Data to the Leaves

## 19.1 The first failure: range scans

Everything in Chapters 17 and 18 describes the structure Bayer and McCreight published: records
live in **every** node, internal and leaf. A node is a sequence of (key, record, child-pointer)
triples.

Now try to answer a query that is not a point lookup. `SELECT * FROM t ORDER BY k` — or
`WHERE k BETWEEN 100 AND 200`, or `ORDER BY k LIMIT 50`, or supplying sorted input to a merge join.
These are not exotic; they are an enormous fraction of real query volume.

To emit keys in order from a plain B-tree you must perform a genuine **in-order traversal**
(Volume 1 §4.4), which for a multi-way node means: descend into child 0, come back up, emit key 1,
descend into child 1, come back up, emit key 2, and so on. Watch the page-access sequence on
§17.2's running tree:

```
                          ┌────┐
                          │ 90 │  ← root
                          └─┬──┘
              ┌─────────────┴─────────────┐
        ┌──────────┐                 ┌───────────┐
        │  30, 60  │ ← A             │ 120, 150  │ ← B
        └────┬─────┘                 └─────┬─────┘
     ┌───────┼───────┐            ┌────────┼────────┐
   [10,20] [40,50] [70,80]   [100,110] [130,140] [160,170]
      L1      L2      L3         L4        L5        L6

PAGE VISIT SEQUENCE for a full in-order scan:

  root → A → L1 → A → L2 → A → L3 → root → B → L4 → B → L5 → B → L6

  14 page visits to read 6 leaves.
  Internal node A is visited 4 times. The root is visited 2 times.
  The pattern jumps between levels: down, up, down, up, up, down, down…
```

Three distinct problems here, and it is worth separating them because they have different weights.

**Problem 1 — internal nodes are revisited, and you cannot skip them.** In a plain B-tree, key 30's
*record* is in node A. So you must visit A to emit it. Revisits are not an implementation
inefficiency you could optimize away; they are required by where the data lives.

**Problem 2 — the access pattern is not sequential, so §15.4's cheap case is unavailable.** This is
the big one. The scan zigzags between levels, so the addresses are not consecutive, readahead
cannot predict them, and — critically — you cannot issue them in parallel, because a scan of a
plain B-tree is another **dependent chain** (§15.4).

**Problem 3 — cache pressure during a large scan evicts exactly the pages you keep revisiting.** A
scan of a billion-key index streams 16 GB through the buffer pool. Under most replacement policies
that flushes the upper levels you are relying on being cached, so the revisits start becoming real
reads part-way through.

Put a number on the whole thing for *n* = 10⁹, *f* = 500, 8 KB pages:

| | Plain B-tree scan | B+-tree scan (§19.3) |
|---|---|---|
| Leaf pages to read | 2 × 10⁶ | 2 × 10⁶ |
| Internal page **visits** | ~2 × 10⁶ (revisits) | *h* = 4, once |
| Access pattern | **interleaved across levels** | **strictly sequential** |
| On HDD, assuming 25% of internal visits miss cache | 5 × 10⁵ random reads × 8 ms ≈ **1.1 hours** + the leaves | 16 GB at 200 MB/s ≈ **80 seconds** |
| On NVMe | ~5 × 10⁵ × 50 µs ≈ 25 s + leaves | 16 GB at 5 GB/s ≈ **3.2 seconds** |

> **Confidence: the structure of this comparison is solid; the "25% miss" figure is my
> assumption, not a measurement.** The point does not depend on the exact figure — it depends on
> the categorical difference between a sequential stream and an interleaved dependent chain, which
> §15.4 established is worth 3–4× on NVMe and hundreds of times on rotating media.

## 19.2 The second failure: records in internal nodes destroy fanout

Independent of scans, there is a pure point-lookup argument.

An internal node's entry in a plain B-tree is key + record + child pointer. Suppose 8-byte keys,
8-byte pointers, and 100-byte records:

| | Entry size | **Internal fanout** (8,150 usable) | Levels for *n* = 10⁹ |
|---|---|---|---|
| Plain B-tree, 100-byte records | 8 + 100 + 8 = 116 | **70** | **5** |
| Plain B-tree, 200-byte records | 8 + 200 + 8 = 216 | **37** | **6** |
| B+-tree, separators only | 8 + 8 = 16 | **509** | **4** |

**One to two extra levels on every single lookup**, and §15.5 priced a level at one full device
latency in a serial chain.

### And the compensating advantage is worthless

The plain B-tree's claimed benefit is **early termination**: if your key happens to sit in the
root, you found the record in one access. Quantify it. With internal fanout *f*, the fraction of
all keys that live above the leaf level is:

$$
\frac{1}{f} + \frac{1}{f^2} + \cdots \approx \frac{1}{f-1}
$$

| Internal fanout | Fraction of keys not in a leaf |
|---|---|
| 70 | **1.4%** |
| 509 | **0.2%** |

So early termination helps on ~1% of lookups, and the fanout loss that enables it costs an extra
level on **100%** of lookups. This is not a close call. **Plain B-trees lose the point-lookup
argument too.**

## 19.3 The B+-tree

Two changes, both consequences of the two failures above.

> **B+-tree.**
> **1.** All records live in the **leaves**. Internal nodes hold only (separator key, child
>    pointer) pairs and carry no payload.
> **2.** The leaves are **linked** into a list, so they can be traversed in key order without
>    touching internal nodes at all.

```
                        ┌───────────────┐
                        │  40  │  90    │        ← separators only. No records.
                        └───┬──┴───┬────┘
             ┌──────────────┘      └──────────────┐
      ┌──────────────┐      ┌──────────────┐   ┌──────────────┐
      │  20  │  30   │      │  60  │  80   │   │  110 │  150  │
      └──┬───┴───┬───┘      └──┬───┴───┬───┘   └──┬───┴───┬───┘
   ┌─────┘   ┌───┘  └───┐   ┌──┘   ┌───┘ └──┐  ┌──┘  ┌────┘ └────┐
┌───────┐ ┌───────┐ ┌───────┐ ┌───────┐ ┌───────┐ ┌───────┐ ┌───────┐
│10,20+ │→│30,35+ │→│40,50+ │→│60,70+ │→│80,85+ │→│90,100+│→│150,…+ │→ …
└───────┘ └───────┘ └───────┘ └───────┘ └───────┘ └───────┘ └───────┘
    ▲                                                                  
    └── every record lives HERE, and the → links let you scan
        the entire keyspace in order with zero internal-node visits.
        "+" denotes the record (or a pointer to it).
```

Now re-run both failures:

**Range scan.** Descend once to the first matching leaf — *h* page reads. Then follow sibling links.
Leaves are typically allocated in ascending key order, so the pages are physically near each other
and readahead works: **the scan becomes a sequential stream.** `ORDER BY k LIMIT 50` becomes four
page reads plus one leaf.

**Fanout.** Internal entries are 16 bytes regardless of how big the records are, so internal fanout
is ~509 for any schema. **The height of a B+-tree is independent of the row size.** That is a
strong and rather elegant property: your index's depth depends on your key, not on your table.

**The cost:** every search must go all the way to a leaf; there is no early termination. §19.2 just
showed that is worth ~1% of lookups. And in practice it costs nothing at all, because §15.5 showed
the upper levels are small enough to be permanently cached.

## 19.4 Separators are boundaries, not data — and three things follow

This is the conceptual shift that matters, and it is easy to skim past. In a plain B-tree an
internal key **is** a record. In a B+-tree an internal key is a **routing decision**. It only needs
to be a value that correctly separates the two subtrees below it.

That weaker requirement buys three things.

**1. Leaf splits *copy* the separator up; internal splits *move* it.** When a leaf splits, the key
sent upward must **also remain in the leaf**, because that is where the data is. When an internal
node splits, the key sent up can simply move — there is nothing to preserve. In a plain B-tree
every split moves; in a B+-tree the behaviour differs by level. Implementations get this wrong and
the bug manifests as missing rows.

**2. A separator may be stale, and nobody has to fix it.** Delete the row whose key is 90 from
§19.3's diagram. The separator 90 in the root is now a key that exists nowhere in the data — and
it is still a *perfectly valid boundary*: everything left of it is < 90, everything right is ≥ 90.
No repair is needed, no cleanup pass, nothing. This is a real and significant simplification: it
means leaf-level deletion never has to propagate upward to correct separators.

**3. A separator can be *truncated* to just enough to separate.** This is the one with teeth.

## 19.5 Suffix truncation, and why it buys you a level

Consider a composite index on `(tenant_id, created_at, id)` — three 8-byte columns, so a 24-byte
key. Now a leaf splits, and the boundary happens to fall where `tenant_id` changes:

```
Left leaf's last key :  (tenant=41, created=…, id=…)
Right leaf's first key: (tenant=42, created=…, id=…)

A valid separator must be > everything left and ≤ everything right.

  FULL separator:      (42, 1719400000, 88213)    → 24 bytes
  TRUNCATED separator: (42)                        →  8 bytes
                        ↑ sufficient! Anything with tenant < 42 goes left,
                          anything with tenant ≥ 42 goes right. The other
                          two columns are not needed to make the decision.
```

The effect on fanout:

| | Separator size | Entry size (+8 B pointer) | Internal fanout | Levels for *n* = 10⁹ |
|---|---|---|---|---|
| Untruncated | 24 | 32 | 254 | 4 (log = 3.75) |
| **Truncated to 8** | 8 | 16 | **509** | **4** (log = 3.30) |
| Untruncated 64-byte key | 64 | 72 | 113 | **5** |
| Truncated to 8 | 8 | 16 | **509** | **4** |

For long text keys, truncation is the difference between four levels and five or six — **one to two
fewer device round trips on every lookup**, bought purely by noticing that a boundary does not have
to be a value.

Two refinements real implementations add:

- **Choosing the split point to enable truncation.** If shifting the split boundary by a few slots
  lets the separator be much shorter, that is often worth slightly worse space balance —
  permanently smaller separators mean permanently higher fanout. So the split-point choice from
  §18.3 gets a second objective beyond legality and centring.
- **Prefix truncation / front compression.** Within a node, all keys often share a long prefix.
  Store it once in the node header and only the differing suffixes per entry. On sorted text keys
  this can multiply the effective fanout several times over.

## 19.6 The leaf linked list

**Singly linked (forward only)** is sufficient for `ORDER BY k ASC` and for all forward range
scans. **Doubly linked** additionally supports `ORDER BY k DESC` and backward scans.

Most production implementations maintain both directions, and it is worth flagging now that this
introduces an asymmetry you will meet again:

> A page splits by moving content **rightward** and installing a right-link before releasing its
> lock. So walking **forward** is always safe — anything that left a page went right, and the link
> is there. Walking **backward** is not protected by the same argument: the page to your left may
> split while you are traversing, so backward traversal needs a verify-and-retry step. **Forward
> and backward scans are not symmetric operations**, and the reason is entirely about concurrency.
> Volume 5.

## 19.7 Plain B-tree versus B+-tree, summarized

| | Plain B-tree | B+-tree |
|---|---|---|
| Records stored in | **every** node | **leaves only** |
| Internal fanout (100-byte rows) | ~70 | **~509** |
| Height, *n* = 10⁹ | 5–6 | **4** |
| Height depends on row size? | **Yes** | **No** |
| Early termination on lookup | Yes (~1% of keys) | No |
| Range scan access pattern | interleaved, dependent chain | **sequential, prefetchable** |
| Leaf-level sibling links | no | **yes** |
| Separator may be stale/truncated | no (it is data) | **yes** — big win (§19.5) |
| Leaf split behaviour | move key up | **copy** key up |
| Used by real databases | essentially never | **essentially always** |

## 19.8 Where B+-trees actually are

> **Confidence: high for the databases; moderate for several filesystem details, flagged
> individually.**

**Databases:**

| System | Structure | Page size | Notes |
|---|---|---|---|
| **InnoDB** (MySQL) | B+-tree, **clustered** | 16 KB | The table *is* the index (§19.9) |
| **PostgreSQL** (`nbtree`) | B+-tree, non-clustered | 8 KB | Heap + independent indexes |
| **Oracle** | B+-tree | 2–32 KB | Heap tables by default; index-organized tables optional |
| **SQL Server** | B+-tree | 8 KB | Clustered index optional per table |
| **SQLite** | **both** | 512 B – 64 KB | *(moderate confidence)* "Table b-trees" store data only in leaves (B+-tree); "index b-trees" store keys in all nodes (plain B-tree). A single system demonstrating both variants. |
| **LMDB** | B+-tree, copy-on-write, mmap | 4 KB | Single-writer; the clean counterexample to Chapter 20's LSM lineage |
| **Berkeley DB** | B+-tree | configurable | The classic embedded implementation |
| **WiredTiger** (MongoDB) | B+-tree **or** LSM | configurable | Both engines, selectable per collection |

**Filesystems:**

| System | Where | Confidence |
|---|---|---|
| **NTFS** | Directory indexes (`$INDEX_ROOT` / `$INDEX_ALLOCATION`) as B+-trees | moderate-high |
| **XFS** | B+-trees throughout: free space indexed twice (by offset *and* by size), inode allocation, extent maps, directories | high |
| **Btrfs** | Copy-on-write B-trees for **everything** — the name is literally "B-tree filesystem" | high |
| **ext4** | Extent trees for block mapping; **HTree** for directory indexing | high on existence; HTree is B-tree-*like* but hash-keyed and depth-limited, so calling it a B+-tree is a stretch |
| **APFS** | B-trees for object maps and filesystem records | moderate |
| **ZFS** | **Notable exception** — the on-disk block map is an indirect-block tree (radix-like) and directories use hash-based ZAP structures, not B-trees | moderate |
| **Linux kernel — maple tree** | RCU-safe range-based B-tree; replaced the VMA red-black tree in Linux 6.1 | high on the change |

That last row is the Volume 2 §11.8 callback landing. The kernel moved a hot, heavily-read
structure *from* a balanced binary tree *to* a B-tree, and the two stated motivations were exactly
this volume's thesis and the next volume's: **cache behaviour** (higher fanout, fewer cache lines
per lookup) and **lock-free concurrent reads** (much more tractable on a wide, shallow structure).

## 19.9 A consequence worth its own section: clustered versus heap

The B+-tree decision "records live in the leaves" leaves one question open, and how a system answers
it shapes almost everything about its performance profile. **What exactly is "the record" in a
leaf — the row itself, or a pointer to it?**

### Clustered: the table *is* the B+-tree

InnoDB's answer. The leaves of the primary-key B+-tree contain the **complete rows**, in primary
key order. There is no separate table storage.

```
CLUSTERED (InnoDB)

  PRIMARY KEY index                    SECONDARY index on (email)
  ┌──────────────┐                     ┌──────────────┐
  │  separators  │                     │  separators  │
  └──────┬───────┘                     └──────┬───────┘
    ┌────┴────┐                          ┌────┴────┐
  ┌───────────────────┐               ┌──────────────────────┐
  │ id=7 │ FULL ROW   │               │ email=a@… │ id=7     │  ← stores the PK,
  │ id=8 │ FULL ROW   │               │ email=b@… │ id=41    │    not a row pointer
  └───────────────────┘               └──────────────────────┘
                                                    │
       lookup by email:  descend secondary  ────────┘
                         → get id → DESCEND THE CLUSTERED INDEX AGAIN
                         = TWO full descents
```

Consequences, all of them practically important:

- **Primary-key lookups are one descent** and return the whole row with no further fetch. Excellent.
- **Secondary-index lookups cost two descents** — the secondary index yields a primary key, which
  must then be looked up in the clustered index. Roughly double the page reads.
- **The primary key is replicated into every secondary index.** A 200-byte PK (§17.6's warning)
  bloats every secondary index by 200 bytes per entry, cutting *their* fanout too. This is the
  single strongest argument for narrow primary keys.
- **Physical order = primary key order.** So the insertion pattern matters enormously:
  - **Sequential PK** (autoincrement, time-ordered UUID): every insert lands on the rightmost leaf,
    which is hot and cached. §17.7's rightmost-split heuristic applies. Nearly optimal.
  - **Random PK** (UUID v4): every insert lands on a different random leaf, splitting pages all
    over the index and touching a working set equal to the whole index. §20.3 quantifies how bad
    this is.
- **Range scans on the primary key are perfectly sequential** and return full rows.

> This is the real reason behind the modern advice to use time-ordered identifiers (UUID v7, ULID,
> Snowflake) rather than random UUID v4 as a primary key. It is not about the 16 bytes. It is that
> in a clustered B+-tree, **random keys destroy insertion locality** — and Volume 2 §9.3 already
> noted the irony that this pushes the industry *toward* sequential insertion, the very pattern
> that was catastrophic for a plain BST and merely requires a split heuristic here.

### Heap: rows live separately, all indexes are equal

PostgreSQL's answer, and Oracle's default. Rows go into an unordered **heap** file; every index is
a B+-tree whose leaves hold **row locations** (a page number and slot).

```
HEAP + INDEXES (PostgreSQL)

  index on (id)          index on (email)              HEAP FILE
  ┌──────────┐           ┌──────────┐            ┌──────────────────────┐
  │  leaves  │           │  leaves  │            │ page 41: row, row, … │
  │ id → TID │           │email→TID │            │ page 42: row, row, … │
  └────┬─────┘           └────┬─────┘            │ page 43: row, row, … │
       └──────────┬───────────┘                  └──────────────────────┘
                  ▼                                        ▲
          both point into ──────────────────────────────────┘
          the heap by (page, slot)
```

Consequences:

- **All indexes are symmetric.** No privileged one, no double descent for secondary lookups.
- **But every index lookup needs an extra heap fetch** to get the row — so even a primary-key
  lookup is (descend index) + (one heap page read). The mitigation is an **index-only scan**, which
  is possible when the index covers every column the query needs *and* the system can prove the
  heap rows are visible without checking.
- **No physical clustering**, so a range scan gets its rows in index order but its *heap pages* in
  arbitrary order — potentially a random read per row. The mitigations are **bitmap scans** (collect
  the row locations, sort them by physical page, then fetch pages in order, converting random I/O
  into near-sequential) and periodic explicit reclustering.
- **Updates that change no indexed column can sometimes avoid touching any index at all**, if the
  new row version fits on the same heap page. This is a substantial write-path advantage that a
  clustered design cannot have, since in a clustered design the row *is* in the index.

**Neither design is better.** They trade the cost of secondary-index access against the cost of
primary access and update locality, and the right answer depends on your read/write mix and how
many secondary indexes you have. What matters for this volume is that **both are consequences of
one B+-tree design question**, and knowing which one you are running on explains most of the
performance advice you will encounter for either system.

---

# Chapter 20 — The Design Space: B*, Bε, and the LSM Lineage

## 20.1 Two things a B+-tree is bad at

The B+-tree is the right answer to §15's problem, and it has held that position for fifty years.
It has exactly two structural weaknesses, and each has produced a family of variants.

**Weakness 1 — space.** §17.7 established ~69% average occupancy, 50% worst case. A B+-tree is
~1.44× larger than its data requires. §20.2 addresses this.

**Weakness 2 — write amplification.** Updating one row rewrites a whole page, and if keys are
random, every update rewrites a *different* page. §20.3 quantifies it and §20.5–20.9 are two
different families of answer.

## 20.2 B*-trees: buy the space back

Knuth's term. The idea: **before splitting a full node, try to redistribute keys into an adjacent
sibling that has room.** Only if both siblings are also full do you split — and then you perform a
**2-to-3 split**: two full nodes become three nodes at ~2/3 occupancy each.

The minimum occupancy invariant rises from 1/2 to **2/3**.

### The utilization formula, derived

There is a clean generalization. If your split turns *j* full nodes into *j*+1 nodes, the expected
steady-state utilization under random insertions is:

$$
U(j) = j \cdot \ln\!\left(\frac{j+1}{j}\right)
$$

| Split type | Minimum occupancy | Expected utilization |
|---|---|---|
| **1 → 2** (ordinary B-tree) | 50% | *U*(1) = ln 2 = **69.3%** |
| **2 → 3** (B\*-tree) | 66.7% | *U*(2) = 2 ln(3/2) = **81.1%** |
| 3 → 4 | 75% | *U*(3) = 3 ln(4/3) = **86.3%** |

> **Confidence: moderate.** I am reporting this formula from memory, but note that it correctly
> reproduces the independently well-established ln 2 result at *j* = 1, which is a meaningful
> self-consistency check. The direction and rough magnitude of the B\* improvement are not in
> doubt.

**So B\*-trees buy about 12 percentage points of utilization — a ~15% smaller index**, which means
~15% fewer pages to cache and to read.

### Why nobody uses them

The cost is not space or CPU. It is **concurrency**, and it is disqualifying.

A redistribution or 2-to-3 split must atomically modify **three pages plus their parent**. That
means holding locks on multiple siblings and their parent simultaneously, in an order that can
conflict with another operation doing the same thing from the opposite direction — deadlock-prone
in exactly the way §18.6 described.

And worse, structurally:

> **Redistribution moves keys *leftward*.** §19.6 flagged and §18.9 stated the invariant that
> high-concurrency B-tree algorithms depend on: **content only ever moves rightward**, so a reader
> holding a stale page pointer can always recover by walking right. Redistribution violates this
> directly. **B\*-trees and Lehman & Yao concurrency are mutually incompatible**, and every
> production system chose concurrency.

What real systems do instead is recover most of the same space with cheaper mechanisms: the
rightmost-split heuristic (§17.7), which is nearly free and worth ~2× on sequential keys, and
opportunistic reclamation of dead entries before splitting a page. Those get you most of the way
without touching more than one page at a time.

## 20.3 Write amplification, derived properly

Now the second weakness, and it is the one that spawned a rival lineage.

**Insert one 100-byte row with a random key into a clustered B+-tree** with 16 KB pages, in a
database with crash safety. Count the bytes that reach storage:

```
  Logical data written by the application ........................    100 bytes

  1. Read the target leaf page (not cached — random key, index > RAM)  16 KB read
  2. Modify it in memory
  3. Write a redo/WAL record describing the change ..............     ~150 bytes
  4. If this is the page's first modification since the last
     checkpoint, log a FULL PAGE IMAGE (needed to repair torn
     writes — §17.6 point 4, Volume 5) ...........................     16 KB
  5. Eventually the dirty page is written back ..................      16 KB
  6. The SSD's own internal amplification (NAND program/erase) ..      × 1.5–4

  Bytes to storage:  ~32 KB × (1.5 to 4)  =  48 KB – 128 KB
  ────────────────────────────────────────────────────────────────────────────
  WRITE AMPLIFICATION:                          roughly  500× to 1,300×
```

**And every one of those writes is to a random location**, because the key was random.

> **Confidence: the mechanism is exact; the multiplier depends heavily on configuration.** Full-page
> logging can be disabled on storage that guarantees atomic page writes; device amplification
> varies enormously with over-provisioning and workload. Treat 500–1,300× as "the bad case, and it
> is reachable in default configurations."

### The crucial condition: this is a *random key* problem

Now redo it with a **sequential** key. Every insert lands on the same rightmost leaf. That page
stays hot in the buffer pool, absorbs ~160 rows before it fills, and is written **once**:

```
  Sequential keys: 160 rows × 100 bytes = 16 KB of logical data
                   → one 16 KB page write + ~160 small WAL records
                   WRITE AMPLIFICATION ≈ 2×
```

**Random keys: ~500×. Sequential keys: ~2×.** A factor of 250, from nothing but key ordering.

That single comparison explains an enormous amount of practical database advice:

- Why time-ordered identifiers beat random UUIDs (§19.9).
- Why bulk-loading sorted data is dramatically faster than inserting it randomly.
- Why an index on a high-cardinality random column is the expensive index on your table.
- Why "just add an index" is a write-throughput decision, not only a read-latency one.

**And it defines the problem the rest of this chapter solves:** how do you get B+-tree-quality
reads without paying random-write costs on random-key inserts?

## 20.4 The diagnosis

Why does a B+-tree have this problem at all? Because of one property that is otherwise its greatest
strength.

> **A B+-tree performs updates *in place*.** Every key has exactly one home, determined by its
> value, and an update goes to that home. That is precisely what makes reads cheap — one descent,
> one page, done, no ambiguity about where a key might be.
>
> But "the location is determined by the key" means that if keys arrive in random order,
> **locations are visited in random order.** In-place update and random writes are the same
> property viewed from two sides. You cannot keep one and discard the other.

So there are only two ways out, and both lineages in the rest of this chapter take one of them:

**(a) Batch the writes** so that many logical updates share one physical page write. → Bε-trees.
**(b) Stop updating in place** — write new data somewhere sequential and reconcile later. → LSM-trees.

## 20.5 Bε-trees: batch the writes

> **Confidence: high on the concept and the bounds; moderate on citations and commercial dates.**

The theoretical foundation is Gerth Brodal and Rolf Fagerberg, "Lower bounds for external memory
dictionaries" (SODA 2003), which established the trade-off curve. The engineering came from
Michael Bender, Martin Farach-Colton, Bradley Kuszmaul and colleagues, commercialized by
**Tokutek** as the **Fractal Tree Index** in **TokuDB** (a MySQL storage engine), and explored in
the **BetrFS** research filesystem. Tokutek was acquired by Percona around 2015; TokuDB was
deprecated a few years later in favour of RocksDB-based storage.

**The idea.** Split each node's space in two. Give a fraction to **pivots** (child pointers, as
usual) and the rest to a **buffer of pending messages** — inserts, deletes and updates that logically
belong somewhere below but have not been pushed down yet.

```
A Bε-tree internal node:

  ┌──────────────────────┬────────────────────────────────────────────┐
  │  pivots: B^ε entries │  BUFFER: pending messages, ~B entries      │
  └──────────────────────┴────────────────────────────────────────────┘
     ↑ fanout is now B^ε      ↑ inserts land HERE, at the root, and
       instead of B             trickle down in BATCHES when full

  An insert:  append a message to the ROOT's buffer.  Done. O(1) pages.
  When a buffer fills: flush its messages to the appropriate children,
                       in one batch per child.
  A search:   descend as usual, but also check each node's buffer on
              the way down for pending messages about your key.
```

**The bounds.** With node capacity *B* items and pivot fraction *B*^ε:

| | B-tree | Bε-tree |
|---|---|---|
| Height | log_*B* *N* | (1/ε) log_*B* *N* |
| **Search** | O(log_*B* *N*) | O((1/ε) log_*B* *N*) |
| **Insert** | O(log_*B* *N*) | O((1/ε) log_*B* *N* / *B*^(1−ε)) |

At ε = 1/2: search is **2× worse**, insert is **√*B*× better**. For *B* = 500, √*B* ≈ 22.

**Why insert gets cheaper: batching.** A B-tree writes a page to store one item. A Bε-tree
accumulates ~*B* items in a buffer and moves them down together, so the page write is amortized
across many items. §20.4(a), realized.

### The unifying observation, which is the reason to care

Look at what ε does at its extremes:

| ε | Fanout | Buffer | What you get |
|---|---|---|---|
| **ε = 1** | *B* | none | **A B-tree.** All space to pivots. |
| ε = 1/2 | √*B* ≈ 22 | ~*B* | The Fractal Tree sweet spot |
| **ε → 0** | constant | ~*B* | **Something LSM-shaped** — a few very wide sorted runs, batched merges |

> **ε is a dial between a B-tree and an LSM-tree.** They are not two rival structures; they are two
> endpoints of one parameterized family, and the parameter is *how much of each node you spend on
> routing versus on buffering*. Once you see that, the whole design space in this chapter becomes
> one axis rather than a menagerie.
>
> *(This framing is the standard one in the literature; I am confident it is the right way to
> present it, less confident that any single paper states it exactly this way.)*

## 20.6 LSM-trees: stop updating in place

> **Confidence: high on the citations.**

The **Log-Structured Merge-tree** was described by Patrick O'Neil, Edward Cheng, Dieter Gawlick and
Elizabeth O'Neil in "The Log-Structured Merge-Tree (LSM-Tree)", *Acta Informatica* 33, 1996. Its
direct ancestor is Mendel Rosenblum and John Ousterhout's **log-structured filesystem** (SOSP 1991
/ *TOCS* 1992), which applied the same insight to file storage: on a device where sequential writes
are hundreds of times cheaper than random ones, **never write anything but a log.**

Google's **Bigtable** paper (2006) popularized the modern memtable+SSTable formulation, and
**LevelDB** (Sanjay Ghemawat and Jeff Dean, 2011) and its Facebook fork **RocksDB** (2012) made it
the default building block for a generation of storage engines.

### Deriving it from Volume 1

The LSM-tree is already implicit in something Volume 1 §1.4 said:

> *"A sorted array is not a data structure you can maintain; it is a data structure you can build
> once and then only read. … The way to make a sorted array work is to stop inserting into it."*

Take that literally. A sorted array has *perfect* read properties — binary searchable, perfectly
sequential to scan, 100% space utilization, zero pointer overhead — and one fatal flaw, Θ(*n*)
insertion. So:

1. **Never insert into a sorted array.** Build it once, seal it, treat it as immutable.
2. Accumulate new writes in a small **mutable, in-memory** structure — the **memtable** (typically
   a skip list or a balanced BST; Volume 2's material, finally load-bearing).
3. When the memtable fills, **write it out as a new immutable sorted array** — one big sequential
   write. This file is an **SSTable** (sorted string table).
4. You now have several sorted runs. A read must check them all, newest first.
5. Periodically **merge** runs together in the background — a sequential read of several sorted
   files and a sequential write of one — to keep their number bounded. This is **compaction**.

```
                      THE LSM STRUCTURE

  writes ──►  ┌──────────────────┐        every write: append to a WAL (sequential)
              │  MEMTABLE (RAM)  │        plus insert into the in-memory sorted structure
              │  mutable, sorted │
              └────────┬─────────┘
                       │ when full: flush as ONE SEQUENTIAL WRITE
                       ▼
  L0     ┌────────┐ ┌────────┐ ┌────────┐      immutable sorted runs,
         │ SSTable│ │ SSTable│ │ SSTable│      possibly overlapping key ranges
         └────────┘ └────────┘ └────────┘
                       │ compaction: merge-sort several runs into one
                       ▼
  L1     ┌──────────────────────────────┐     ~10× bigger, non-overlapping
         └──────────────────────────────┘
                       │
  L2     ┌────────────────────────────────────────────────┐   ~10× bigger again
         └────────────────────────────────────────────────┘
                       │
  …up to L5 or L6, each ~10× the size of the one above

  A READ must check: memtable → L0 runs → L1 → L2 → … until found.
  A DELETE writes a TOMBSTONE — a marker meaning "this key is gone" — which
  shadows older values until compaction physically removes both.
```

**Every write to storage is sequential.** The WAL is an append. The memtable flush is one big
sequential write. Compaction is sequential reads and sequential writes. **Nothing is ever updated
in place.**

Note that Volume 1 §1.4 also predicted the tombstone: *"there is a mitigation — tombstones, marking
a slot dead without moving anything — which converts deletion to Θ(1) at the cost of the array
growing monotonically."* That is exactly the LSM delete, and the "growing monotonically" cost is
exactly what compaction pays down.

## 20.7 The three amplifications, and the compaction dial

LSM-trees do not eliminate cost; they move it. There are three currencies and compaction strategy
decides how you pay.

**Write amplification** — bytes written to storage per byte of logical data. Every row is written
once on flush, then again each time compaction moves it down a level.

**Read amplification** — pages read per lookup. A read may have to check every level.

**Space amplification** — storage used per byte of live data. Superseded versions and tombstones
occupy space until compaction removes them.

### Leveled compaction (LevelDB, RocksDB default)

Each level *L*ᵢ holds non-overlapping SSTables, ~*T*× bigger than *L*ᵢ₋₁ (*T* ≈ 10). To push one
SSTable from *L*ᵢ to *L*ᵢ₊₁ you must merge it with the ~*T* SSTables it overlaps down there,
rewriting all of them. So each level costs ~*T* in write amplification, across ~*L* levels:

$$
\text{write amp} \approx T \times L \approx 10 \times 5 = 50
$$

> **Confidence: moderate.** Measured RocksDB leveled write amplification is commonly reported in the
> 10–30× range, i.e. lower than the crude model, because of tuning and because upper levels are
> small. The *shape* of the result — write amp proportional to *T*·*L* — is the standard analysis.

**Read amp:** one page per level, but see Bloom filters below. **Space amp:** low, ~1.1×, since
each level is non-overlapping and holds one version of each key.

### Tiered (size-tiered) compaction (Cassandra's classic default)

Accumulate several similar-sized runs at a level, then merge them all into one run at the next
level. Each row is written **once per level**, not *T* times:

$$
\text{write amp} \approx L \approx 5\text{–}10
$$

**But:** each level contains multiple *overlapping* runs, so a read may check several runs per
level (higher read amp), and multiple copies of a key coexist (space amp 2–10×, and it spikes
during a large compaction which needs room for both input and output).

### Bloom filters: the read-amplification fix

> **Confidence: high.** Burton H. Bloom, "Space/time trade-offs in hash coding with allowable
> errors", *CACM* 1970.

Each SSTable carries a small probabilistic set membership filter. Query it before reading the
table: it can say "definitely not present" (skip the table entirely, zero I/O) or "possibly
present" (read it). False positives are possible; false negatives are not.

At the standard 10 bits per key with ~7 hash functions, the false positive rate is **~0.8%.** So a
lookup that would have read *L* levels instead reads:

$$
1 + 0.008 \times (L - 1) \approx 1.03 \text{ pages}
$$

**Read amplification collapses from ~5 to ~1**, for 10 bits per key — 1.25 MB per million keys.
This single trick is what makes LSM-trees viable for point lookups, and it is why every production
LSM engine ships them.

The one thing Bloom filters cannot help with is **range scans**, which must merge across all levels
because you cannot filter a range by membership. This is LSM's genuine remaining weakness against a
B+-tree, whose leaf list makes range scans as sequential as it gets (§19.3).

## 20.8 Why sequential writes are worth so much — and why the answer changed

The whole LSM bet is that trading more bytes written for *sequential* placement is worth it. How
big is the sequential bonus?

| Device | Random 4 KB writes | Sequential writes | **Ratio** |
|---|---|---|---|
| 7200 RPM HDD | ~150 IOPS ≈ 0.6 MB/s | ~200 MB/s | **~330×** |
| SATA SSD | ~40k IOPS ≈ 160 MB/s | ~500 MB/s | **~3×** |
| NVMe SSD | ~300k IOPS ≈ 1.2 GB/s | ~5 GB/s | **~4×** |

Combine with §20.3 and §20.7:

| | Bytes written | Pattern | Effective cost on HDD | Effective cost on NVMe |
|---|---|---|---|---|
| B+-tree, random keys | ~500× | **random** | 500 × 330 = **165,000** | 500 × 4 = **2,000** |
| LSM, leveled | ~10–50× | sequential | 50 × 1 = **50** | 50 × 1 = **50** |
| B+-tree, sequential keys | ~2× | sequential | **2** | **2** |

> **Confidence: this is a deliberately crude model** — it ignores caching, queue depth, and the
> fact that both structures behave better in practice than the worst case. Do not quote the
> numbers. Do keep the three conclusions, which are robust:

**1. On rotating media, LSM's advantage for random-key writes was overwhelming** — three to four
orders of magnitude. That is why the LSM lineage exploded during the era when data outgrew RAM and
SSDs were not yet cheap.

**2. On NVMe the advantage narrows sharply**, because the sequential bonus fell from ~330× to ~4×.
B+-trees became competitive again for many workloads, which is why the "B-tree vs LSM" debate is
live rather than settled, and why systems like WiredTiger ship both.

**3. Sequential keys make a B+-tree nearly optimal on any device.** If you control your key
ordering, you can have B+-tree reads *and* LSM-grade write costs. §19.9's advice about time-ordered
identifiers is not a micro-optimization; it moves you between rows of that table.

## 20.9 The RUM conjecture: you get to pick two

> **Confidence: high on the paper.** Manos Athanassoulis, Michael Kester, Lukas Maas, Radu Stoica,
> Stratos Idreos, Anastasia Ailamaki and Mark Callaghan, "Designing Access Methods: The RUM
> Conjecture", EDBT 2016.

The conjecture states that when designing an access method you can optimize for at most two of:

- **R**ead overhead
- **U**pdate overhead
- **M**emory (space) overhead

Map this chapter onto it:

| Structure | Read | Update | Space | Sacrificed |
|---|---|---|---|---|
| **B+-tree** | **excellent** (1 page) | poor (§20.3) | **good** (1.44×) | **Update** |
| **B\*-tree** | excellent | worse still | **best** (1.23×) | **Update**, harder |
| **Bε-tree** (ε=1/2) | good (2×) | **excellent** | good | a little Read |
| **LSM, leveled** | good (Bloom) | **good** | **excellent** (1.1×) | some Read (ranges) |
| **LSM, tiered** | poor | **excellent** | poor (2–10×) | **Read and Space** |
| Hash index | **excellent** | good | poor; **no ranges at all** | **Space and ordering** |

Read that table as the answer to "which structure should I use?" It is: **whichever overhead you
can most afford to pay.** There is no dominant choice, and any claim that one structure is simply
better than another is a claim about a workload, stated carelessly.

## 20.10 Real systems, and the convergence

**LSM-based:** LevelDB, RocksDB (and its Go reimplementation Pebble, used by CockroachDB),
Cassandra, ScyllaDB, HBase, InfluxDB, MyRocks, TiKV.

**B+-tree-based:** InnoDB, PostgreSQL, Oracle, SQL Server, SQLite, LMDB, Berkeley DB, and most
filesystems (§19.8).

**Both, selectable:** WiredTiger (MongoDB).

And then the interesting part, which is that the two lineages have been quietly converging:

- **LSM-trees contain B-trees.** An SSTable is not scanned linearly — it has an internal block
  index, which is a static, immutable, perfectly-packed B-tree. §15.7's requirements do not stop
  applying just because the file is immutable; if anything they apply more cleanly, since an
  immutable tree can be built at 100% occupancy.
- **B-trees have adopted LSM ideas.** Bε-trees are exactly a B-tree with LSM-style buffering
  (§20.5). And the deferred-cleanup behaviour §18.9 described — don't merge, don't rebalance, let a
  background process reclaim later — is compaction by another name.
- **Both use a write-ahead log**, for the same reason, and Volume 5 covers it.
- **ε parameterizes the space between them** (§20.5), so they are not really separate families at
  all.

> The honest summary of fifty years: **there is one problem — the access-count cost model of §15 —
> and one family of answers, parameterized by how much you buffer before you place data in its
> final sorted home.** Place immediately: B-tree, cheap reads, expensive random writes. Buffer a
> little: Bε-tree. Buffer a lot and reconcile in the background: LSM-tree, cheap writes, more
> expensive reads. There is no third idea.

## 20.11 Choosing

| If your workload… | Use | Because |
|---|---|---|
| Reads dominate; ranges and ordered scans matter | **B+-tree** | One page per lookup; leaf list makes scans sequential (§19.3) |
| Writes dominate; keys are **random**; data ≫ RAM | **LSM (leveled)** | §20.3's amplification is the binding cost; sequential writes avoid it |
| Writes dominate; you can tolerate space and read overhead | **LSM (tiered)** | Lowest write amplification of anything here |
| Writes dominate but you need B-tree-ish reads | **Bε-tree** | 2× read cost for ~√B write improvement (§20.5) |
| Writes dominate and keys are **sequential** | **B+-tree** | §20.8 row 3 — you already have LSM-grade write costs |
| Point lookups only, no ranges, space is cheap | Hash index | Ordering is what a tree buys you; don't pay for it unused |
| Data on rotating media | **LSM**, strongly | The sequential bonus is ~330× (§20.8) |
| Data on NVMe, mixed workload | Either; measure | The bonus is only ~4×; the decision is genuinely close |
| Read-only or write-once data | **Immutable sorted runs** with a static index | 100% occupancy, no maintenance, nothing to balance |

---

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

# Volume 3 is complete

**File: `volume-3-btrees-and-disk.md`** — ready.

## What Volume 4 will cover: SPECIALIZED TREES, EACH SOLVING A PROBLEM PLAIN TREES CAN'T

Volumes 2 and 3 were both about the same problem — ordered lookup — solved for two different
devices. Volume 4 changes the problem. For each structure: what specifically a BST or B-tree
handles badly, the new invariant that fixes it, a worked example, and real production uses.

- **Tries** — string and prefix problems: autocomplete, IP routing, spell-check. Why comparison-based
  trees are the wrong tool when keys share structure, and how tries escape the log₂ *n*
  comparison lower bound (Volume 2 §3.5 flagged this) by looking at *pieces* of keys. Then
  compressed tries and radix trees as the space-optimized evolution.
- **Segment trees and Fenwick / binary indexed trees** — range query problems, both derived from the
  same motivating failure, and why the Fenwick tree is the space-optimized cousin.
- **Interval trees** — overlapping range problems: calendar conflicts, computational geometry. The
  first proper look at **augmented** trees, which Volume 2 §11.8 met in passing in the Linux
  scheduler.
- **Heaps** — priority-based rather than order-based access. Why the heap invariant is *deliberately*
  weaker than a BST's, and why that weakness is exactly the point (Volume 2 §7.2 and Volume 1 §6.3
  both left this promise outstanding).
- **KD-trees, quadtrees / octrees, R-trees** — spatial and multidimensional problems: maps,
  nearest-neighbour search, game-engine spatial partitioning. Why one-dimensional ordering fails
  the moment you have two dimensions.
- **Suffix trees and suffix arrays** — substring search at scale, genome sequencing.
- **Merkle trees** — the integrity and verification problem, derived from cryptographic hashing
  fundamentals, with git's object model and blockchain as worked examples.
- **Decision trees** — a genuinely different lineage from statistics and machine learning rather than
  classical computer science. Why they are structurally trees but philosophically something else,
  and a brief bridge into random forests and gradient boosting.

Say **continue** when you would like me to start Volume 4.
