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

