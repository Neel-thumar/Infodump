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

