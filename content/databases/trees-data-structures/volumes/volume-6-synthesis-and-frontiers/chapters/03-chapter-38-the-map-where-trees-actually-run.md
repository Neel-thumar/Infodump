# Chapter 38 — The Map: Where Trees Actually Run

## 38.1 How to use this chapter

This is a reference, organized by **domain** rather than by structure, because that is how you will
actually reach for it: you have a problem in a particular kind of system, and you want to know what
people who have solved it already used. §38.13 inverts the index for when you want to go the other
way.

Two standing caveats. **First**, internals change — several entries here describe migrations that
happened during the writing of this book. **Second**, my confidence varies a lot by entry, so it is
flagged per section rather than per line, and where I am unsure I say so rather than smoothing it
over.

## 38.2 Operating system kernels

> **Confidence: high on the Linux data structures and APIs; moderate on which subsystem currently
> uses which, since this changes across releases.**

| Use | Structure | Chapter |
|---|---|---|
| **Process scheduler** — CFS, then EEVDF from Linux 6.6 | **red-black tree** keyed on virtual runtime, with the leftmost node **cached** so "pick next task" is O(1); EEVDF **augments** it with per-subtree minimum virtual runtime | V2 §11.8, V4 §23.2 |
| **Virtual memory areas** (`vm_area_struct`) | was a **red-black tree** (`mm_rb`); replaced by the **maple tree** — an RCU-safe, range-based **B-tree** — in Linux 6.1 | V3 §19.8, V5 §34.9 |
| **Reverse mapping** (`i_mmap`, `anon_vma`) | **interval trees** built on the red-black tree via the augmentation framework; the field is literally called `rb_subtree_last` and it *is* `max_hi` | V4 §23.6 |
| **Page cache / `XArray`** | **radix tree** (the `XArray` API replaced the older `radix_tree` interface; the structure underneath is still a radix tree) | V4 §21 |
| **ID allocation** (`IDR`) | radix tree over integer IDs | V4 §21 |
| **IPv4 forwarding table** | **LC-trie** (level-compressed trie) in `fib_trie.c` — longest-prefix match | V4 §21.5, §21.7 |
| `epoll` registered descriptors | red-black tree | V2 §11 |
| I/O schedulers (deadline, BFQ) | red-black trees | V2 §11 |
| High-resolution timers (`hrtimer`, `timerqueue`) | red-black tree, leftmost cached | V2 §11.8 |
| cgroups, futex hash buckets, memory control | red-black trees | V2 §11 |

**The Linux `rb_node` is worth studying as an artifact in its own right** (V2 §11.8): three words,
the colour packed into the low bits of the parent pointer, intrusive so there is no allocation and no
extra dereference, and a completely type-agnostic rebalancing routine that knows nothing about your
keys. It is the same decoupling `std::map` reaches from the opposite direction (§38.4).

**Windows.** The NT memory manager's Virtual Address Descriptors were historically indexed with
**splay trees** and later moved to **AVL trees**, with concurrency the stated motivation — lookups on
a splay tree require exclusive locking (V2 §12.6, V5 §31.10). *(Confidence: moderate; from
*Windows Internals* rather than source.)*

## 38.3 Filesystems

> **Confidence: high on XFS, Btrfs and ext4 in outline; moderate on NTFS, APFS, ReFS and HFS+
> internals, which are less openly documented.**

| Filesystem | Structures |
|---|---|
| **XFS** | **B+-trees for everything.** Free space indexed **twice** — once by block offset and once by extent size, two trees over the same data serving two different queries. Plus inode allocation, extent maps, directories, reverse mapping (`rmapbt`), and reflink refcounts. The most thoroughly B-tree-based filesystem in wide use. |
| **Btrfs** | **Copy-on-write B-trees for everything** — the name is literally "B-tree filesystem." Snapshots are free (V5 §32.11, §34.6). |
| **ext4** | **Extent trees** for file block mapping; **HTree** for directory indexing — a hash-keyed, depth-limited structure that is B-tree-*like* rather than a B+-tree, and calling it one is a stretch. |
| **ZFS** | **A notable non-B-tree.** The block map is an **indirect block tree** (radix-like, fixed fanout by block pointer count); directories use hash-based ZAP structures. But **every block pointer stores the checksum of the block it points to**, making the entire filesystem a **Merkle tree** rooted at the uberblock — which is what enables self-healing. B-trees have since appeared for some in-memory range structures. (V4 §27.6) |
| **NTFS** | Directory indexes as **B+-trees** (`$INDEX_ROOT` / `$INDEX_ALLOCATION`). The MFT itself is a flat file with extent-mapped attributes. |
| **APFS** | **B-trees** for object maps and filesystem records; copy-on-write. |
| **ReFS** | B+-trees ("Minstore"). |
| **HFS+** | B\*-trees for the catalog, in Apple's terminology — one of the few production uses of the B\* variant Volume 3 §20.2 declared dead. |
| **F2FS** | Log-structured, with a flat node address table. |
| **FAT** | **No tree at all** — a **linked list of clusters** per file. |

> **FAT deserves its row.** Its cluster chain is precisely Volume 1 §1.5's linked list, with precisely
> Volume 1 §1.5's defect: **no random access.** Seeking to byte 100 MB of a FAT file means walking the
> chain from the start, one cluster at a time, in a dependent chain (V1 §1.6). Every other
> filesystem in the table replaced that walk with a tree, and the reason is Volume 1, Chapter 1.

## 38.4 Relational databases

> **Confidence: high.**

| System | Index structures |
|---|---|
| **PostgreSQL** | **`nbtree`** — a B+-tree implementing the Lehman & Yao B-link algorithm (V5 §31.8). Plus **GiST** (a *framework* for search trees; with spatial types it becomes an **R-tree**), **GIN** (inverted index, with a B-tree over the keys), **SP-GiST** (space-partitioned: **quadtrees, kd-trees and radix trees**, selectable), **BRIN** (block-range summaries — not a tree), and hash. |
| **MySQL / InnoDB** | **Clustered B+-tree**: the table *is* the primary-key index, 16 KB pages; secondary indexes store primary keys, so a secondary lookup costs two descents (V3 §19.9). |
| **Oracle** | B+-tree indexes; bitmap indexes; **index-organized tables** (clustered); R-trees in Oracle Spatial. |
| **SQL Server** | B+-tree, 8 KB pages, clustered index optional per table; columnstore for analytics; and the **in-memory engine uses a Bw-tree** (V5 §34.10). |
| **SQLite** | **Both variants in one system**: "table b-trees" store data only in leaves (a B+-tree); "index b-trees" store keys in all nodes (a plain B-tree). |
| **LMDB** | **Copy-on-write B+-tree**, memory-mapped, single writer, lock-free readers, **no write-ahead log at all** (V5 §32.11, §34.6). |
| **Berkeley DB** | B+-tree. |
| **DuckDB, HyPer** | **ART** for indexes (V4 §21.6); columnar storage otherwise. |

> **PostgreSQL's SP-GiST is worth singling out.** It is a framework for space-partitioned trees, and
> its shipped operator classes include quadtrees, kd-trees and radix trees. **Volume 4's Chapters 21
> and 25 are literally options in a `CREATE INDEX` statement.**

And on the other side of the same decoupling as the kernel's `rb_node`: **libstdc++'s `_Rb_tree`
keeps its rebalancing code untemplated**, operating only on a base node type, so it lives in the
compiled library and one copy serves every `std::map` in your program (V2 §11.8). Two designs, one
from a kernel and one from a template library, arriving at "the structural algorithm should know
nothing about the data."

## 38.5 LSM-trees, key-value stores and NoSQL

> **Confidence: high on the engines; moderate on current default compaction strategies, which are
> tunable and change.**

| System | Structures |
|---|---|
| **LevelDB / RocksDB / Pebble** | **LSM-tree**, leveled compaction, **Bloom filters** per SSTable, **skip-list memtable**, and each SSTable carries a **static B-tree block index** (V3 §20.6–20.7) |
| **Cassandra / ScyllaDB** | LSM (size-tiered or leveled), plus **Merkle trees for anti-entropy replica repair** (V4 §27.6) |
| **HBase** | LSM over HDFS |
| **MongoDB / WiredTiger** | **B+-tree or LSM, selectable per collection** — the clearest illustration that the choice is workload-dependent (V3 §20.11) |
| **etcd / bbolt** | **B+-tree**, copy-on-write, in the LMDB design lineage |
| **TiKV, CockroachDB** | RocksDB / Pebble → LSM, with range-partitioned distribution on top (§39.1) |
| **InfluxDB** | TSM — a time-structured merge tree |
| **Redis** | **Skip lists** for sorted sets (V2 §13.7, V5 §31.10); hash tables for everything else |

> **Two things worth noticing across this table.** **Every LSM-tree contains B-trees** — an SSTable's
> block index is a static, immutable, perfectly-packed B-tree, because Volume 3 §15.7's requirements
> do not stop applying just because the file is read-only. **And every LSM-tree contains a heap** —
> compaction merges *k* sorted runs with a *k*-way merge driven by a min-heap of size *k* (V4 §24.6).
> The lineages are not separate; they are composed.

## 38.6 Networking and naming

> **Confidence: high on the concepts; moderate on specific implementations.**

| Use | Structure | Notes |
|---|---|---|
| **IP forwarding — longest prefix match** | **tries**: LC-trie (Linux), Patricia/radix (BSD) | The query no ordered index can express (V4 §21.1) |
| **In hardware routers** | **TCAM** — not a tree | Compares all entries **in parallel**, one cycle. A *replacement* for the trie, at a cost in power, density and price per bit. §39.3. |
| **BGP prefix storage** | Patricia tries | |
| **Firewall / ACL matching** | interval trees, decision diagrams, or TCAM | V4 §23.6 |
| **DNS** | **the namespace is a tree**; resolution is a root-to-node descent with delegation at each level | See below |
| **Dynamic connectivity, max-flow** | **link-cut trees** — built out of splay trees | V2 §12.7, §40.5 |

**DNS deserves care, because it is easy to get wrong.** The DNS *namespace* is a tree — root, TLD,
domain, subdomain — and resolution walks it downward, with each level delegating authority for the
level below. But that tree is a **naming and delegation hierarchy**, not an index: it exists so that
names are only **locally** unique and are disambiguated by path, which is exactly Volume 1 §2.5's
observation that hierarchy solves a *social* scaling problem before it solves an algorithmic one.
The actual *implementations* — an authoritative server's zone, a resolver's cache — use hash tables
or red-black trees internally.

The same distinction applies to filesystem paths, Java package names, and URL paths: **the tree is
in the naming, and the lookup structure underneath it is a separate choice.**

## 38.7 Compilers and language runtimes

> **Confidence: high on the concepts; moderate on specific compiler internals.**

| Use | Structure | Chapter |
|---|---|---|
| **Abstract syntax trees** | *the* tree — the output of parsing is a tree, and Volume 1 §2.3's LISP `cons` cells are its direct ancestor | V1 §2.3 |
| **Node storage for ASTs and IR** | **arena allocation with integer indices instead of pointers** — LLVM's bump allocators, Rust's arena-allocated ASTs | V1 §6.4 |
| **Dominator trees** | the dominator tree of a control-flow graph, computed by Lengauer–Tarjan; the backbone of SSA construction | *(not covered in this book — see §"gaps")* |
| **Dataflow analysis ordering** | **reverse post-order** on the CFG — i.e. a topological sort | V1 §4.7 |
| **Register allocation** | **interval trees** over live ranges, for linear-scan allocation | V4 §23.6 |
| **Code emission from an AST** | **post-order traversal** — operands before the operation that consumes them | V1 §4.2 |
| **String interning, keyword recognition** | tries | V4 §21.7 |
| **Miscellaneous compiler tables** | GCC ships `splay-tree.c` in `libiberty` | V2 §12.7 |
| **Immutable ASTs** in functional compilers | persistent trees with structural sharing | V5 §34 |
| **Persistent language collections** | **HAMTs** — Clojure, Scala, Immutable.js, Haskell's `unordered-containers` | V5 §34.5 |

## 38.8 Version control and content addressing

> **Confidence: high on git; moderate on the others' internals.**

| System | Structure |
|---|---|
| **Git** | A **Merkle DAG** with **structural sharing** — blobs, trees and commits, each identified by the hash of its contents including its children's hashes. A commit hash is a **root pointer into an immutable persistent data structure**, and `git gc` is a **tracing garbage collector with a grace period** (V4 §27.6, V5 §34.7) |
| **IPFS** | Merkle DAG; content identifiers are hashes; deduplication and verification are free consequences |
| **Certificate Transparency** | **append-only Merkle tree** with both inclusion *and* **consistency** proofs (RFC 6962) — the consistency proof is what makes append-only checkable by anyone (V4 §27.6) |
| **Blockchains** | Merkle root in each block header, enabling light clients to verify a transaction with a log-sized proof. **Ethereum** uses a **Merkle Patricia Trie** — Volume 4 Chapters 21 and 27 composed |
| **BitTorrent v2** | per-file Merkle trees (v1 used a flat list of piece hashes) |
| **OCI / Docker images** | content-addressed layers in a chain |
| **Nix / Guix** | content-addressed store paths |
| **Mercurial** | revlog — a delta chain with an index, rather than a Merkle tree |

## 38.9 Browsers and documents

> **Confidence: moderate — browser internals are large and change quickly.**

The **DOM** is the canonical example in computing of a tree as a **data model** rather than as an
index. Volume 1 §2.5 warned that trees are excellent for organizing *access* and frequently poor for
*modelling*, using IBM's hierarchical database model as the cautionary tale. The DOM is the case where
the warning does not apply, because a document genuinely **is** nested.

| Use | Structure / mechanism | Chapter |
|---|---|---|
| Document structure | the DOM tree | V1 §3 |
| Derived trees | render tree, layout tree, layer tree, accessibility tree — each a transformation of the DOM | V1 §4 |
| **Incremental layout** | **dirty-bit propagation upward**, then recomputation downward — post-order aggregation followed by pre-order application | V1 §4.2, §4.3 |
| Serialization of nested markup | opening tags are **pre-order** visits, closing tags are **post-order** visits of the same node — the Euler tour, made textual | V1 §4.1, §4.3 |
| CSS selector matching | tree queries, accelerated by per-tag/class/id indexes to avoid full traversal | — |
| JSON / XML parsing | produces a tree; indentation depth *is* node depth | V1 §4.3 |

## 38.10 Search, text and bioinformatics

> **Confidence: high on the bioinformatics tools and on Lucene's FST term dictionary; moderate
> elsewhere.**

| Use | Structure | Chapter |
|---|---|---|
| **Full-text search over documents** | **inverted index** — *not* a suffix structure. But Lucene's **term dictionary is an FST** (finite state transducer), which is a **minimized trie** — Volume 4 §21.7's DAWG, in production | V4 §21.7, §26.7 |
| **Numeric and geo fields in Lucene / Elasticsearch** | **BKD-trees**, having migrated away from geohash prefix trees | V4 §25.4 |
| **Autocomplete** | tries, FSTs, or n-gram indexes with a frequency **augmentation** to prune to top-*k* | V4 §21.7 |
| **Spell correction** | trie plus a Levenshtein automaton, so the edit-distance DP is **shared across all words with a common prefix** | V4 §21.7 |
| **Short-read alignment** | **FM-index** — `bwa`, `bowtie`, `bowtie2`, `HISAT2`. Smaller than the reference and replaces it | V4 §26.6 |
| **Whole-genome alignment** | actual **suffix trees** — `MUMmer` finds maximal unique matches | V4 §26.7 |
| **Genomic interval intersection** | interval trees, NCLists, AILists — `bedtools` | V4 §23.6 |
| **Compression** | **BWT** (bzip2); suffix structures for optimal LZ77 match-finding; **Huffman trees** | V4 §26.6, V1 §2.3 |
| **Vector / embedding search** | **HNSW graphs** and quantization — **not trees** (§38.14) | V4 §25.5 |

## 38.11 Games, graphics and simulation

> **Confidence: high on BVH and hardware ray tracing; moderate on engine specifics.**

| Use | Structure | Chapter |
|---|---|---|
| **Ray tracing** | **BVH** — effectively an R-tree specialized for ray queries, built with a surface-area heuristic. **Modern GPUs contain dedicated silicon to traverse it** | V4 §25.5, §37.7 |
| Level of detail, frustum culling, voxels | **octrees** | V4 §25.3 |
| 2-D collision, terrain, tile worlds | **quadtrees** | V4 §25.3 |
| *n*-body simulation | **octree with a centre-of-mass augmentation** — Barnes–Hut, O(*n* log *n*) instead of O(*n*²), using augmentation for **approximation** rather than exact pruning | V4 §25.3, §29.2 |
| Point clouds, photon mapping | KD-trees | V4 §25.2 |
| **Scene graphs** | a tree of transforms; composing world transforms is a **pre-order traversal** | V1 §4.3 |
| **Behaviour trees** for AI | a tree used as a **program** rather than as data | — |
| Broad-phase collision (alternatives) | sweep-and-prune, spatial hashing — **not trees** | §38.14 |

## 38.12 Machine learning

> **Confidence: high on the ensemble libraries and MCTS; moderate on inference-optimization
> specifics.**

| Use | Structure | Chapter |
|---|---|---|
| **Tabular prediction** | **gradient-boosted decision tree ensembles** — XGBoost, LightGBM, CatBoost; random forests | V4 §28 |
| **Inference-time layout** | a served ensemble is a data structure traversed millions of times per second; compiled and cache-optimized traversal (QuickScorer, Treelite) | V4 §28.8, §37 |
| **Learning to rank** | **LambdaMART** — gradient-boosted trees, long a mainstay of web search ranking | V4 §28.8 |
| **Monte Carlo Tree Search** | a tree **built by search**, with UCB-style selection — AlphaGo, AlphaZero | — |
| **Hierarchical softmax** | a **Huffman tree over the vocabulary**, making a softmax over *V* classes O(log *V*) — used in word2vec. Volume 1 §2.3's 1952 construction, in a neural network | V1 §2.3 |
| Exact *k*-NN in low dimensions | KD-trees, ball trees (`scikit-learn`) | V4 §25.2 |
| Hierarchical clustering | dendrograms | — |
| **Constrained LLM decoding** | a **trie** over permitted continuations, used to mask the sampling distribution | V4 §21 |

## 38.13 The master table

Inverting the index: structure to problem to production systems.

| Structure | The problem it solves | Where it runs | Ch |
|---|---|---|---|
| **Red-black tree** | ordered in-memory map with cheap updates *and* worst-case bounds | Linux scheduler, timers, epoll, I/O schedulers; `std::map`, `std::set`; Java `TreeMap`, and `HashMap`'s collision buckets | V2 §11 |
| **AVL tree** | ordered in-memory map, read-dominated | Windows NT VADs; some in-memory DB indexes | V2 §10 |
| **Splay tree** | skewed access patterns, zero metadata | GCC `libiberty`; **link-cut trees** | V2 §12 |
| **Treap / skip list** | randomized balance; `split`/`join`; **easy concurrency** | Redis sorted sets; LevelDB memtable; `ConcurrentSkipListMap`; ropes | V2 §13 |
| **B+-tree** | ordered index larger than memory, with range scans | PostgreSQL, InnoDB, Oracle, SQL Server, SQLite, LMDB; XFS, Btrfs, NTFS, APFS; etcd; Linux maple tree | V3 §19 |
| **LSM-tree** | write-heavy, random keys, data ≫ memory | RocksDB, LevelDB, Cassandra, HBase, ScyllaDB, InfluxDB, MyRocks | V3 §20.6 |
| **Bε- / fractal tree** | write-heavy but needing B-tree-like reads | TokuDB (historical), BetrFS | V3 §20.5 |
| **Trie / radix tree** | prefix queries; **longest prefix match**; fuzzy match | Linux FIB, BSD routing, BGP; Linux page cache and IDR; Ethereum state; ART in DuckDB/HyPer; Judy | V4 §21 |
| **FST / DAWG** | minimal-space dictionary with prefix search | Lucene term dictionary; spell checkers; word-game engines | V4 §21.7 |
| **Segment tree** | range aggregate over any **monoid**, with updates | competitive programming; time-series rollups; range-query engines | V4 §22 |
| **Fenwick tree** | prefix aggregate with point updates, minimal space | adaptive arithmetic coding (its original purpose); rank/order-statistics | V4 §22.6 |
| **Interval tree** | which stored ranges overlap this range | Linux reverse mapping and MMU notifiers; `bedtools`; register allocators; calendars | V4 §23 |
| **Heap** | repeated extraction of the extreme | Dijkstra/A\*/Prim; Huffman; heapsort as introsort's fallback; top-*k* streams; **LSM compaction's *k*-way merge**; event simulation | V4 §24 |
| **KD-tree / ball tree** | low-dimensional nearest neighbour | `scikit-learn`; point clouds; photon mapping | V4 §25.2 |
| **Quadtree / octree** | 2-D and 3-D spatial partitioning; hierarchical approximation | game engines; LOD and culling; Barnes–Hut; geohash/Morton codes are quadtree paths | V4 §25.3 |
| **R-tree / R\*-tree** | indexing **extended objects** on disk | PostGIS (via GiST), Oracle Spatial, SQLite R\*Tree, MySQL spatial | V4 §25.4 |
| **BVH** | ray–object intersection | every ray tracer; **hardware traversal units in GPUs** | V4 §25.5 |
| **BKD-tree** | multidimensional **points** on disk | Lucene / Elasticsearch numeric and geo fields | V4 §25.4 |
| **Suffix tree** | arbitrary-substring queries, maximal repeats | `MUMmer`; LZ77 match finding | V4 §26 |
| **Suffix array + LCP** | the same, in a quarter of the space | text indexing, compression | V4 §26.5 |
| **FM-index** | substring search in **less space than the text** | `bwa`, `bowtie`, `HISAT2` | V4 §26.6 |
| **Merkle tree / DAG** | verify one item against one trusted hash | git, IPFS, Certificate Transparency, Bitcoin, Ethereum, ZFS, Btrfs, dm-verity, Cassandra repair, BitTorrent v2, XMSS/SPHINCS+ | V4 §27 |
| **Decision tree ensemble** | prediction from tabular features | XGBoost, LightGBM, CatBoost; LambdaMART; credit, fraud, CTR, insurance | V4 §28 |
| **HAMT** | persistent immutable map | Clojure, Scala, Immutable.js, Haskell | V5 §34.5 |
| **CoW B-tree** | crash safety, snapshots and MVCC from **one** mechanism | LMDB, Btrfs, ZFS, APFS, bbolt | V5 §32.11 |
| **Bw-tree** | latch-free in-memory index | SQL Server in-memory engine | V5 §34.10 |
| **B-link tree** | high-concurrency B+-tree | PostgreSQL `nbtree` and most serious B-tree implementations | V5 §31 |
| **Eytzinger / vEB layout** | cache-efficient static search | high-performance search libraries; the layout question of §37.3 | §37 |

## 38.14 The non-trees: where a tree is the wrong answer

A map is more useful with its edges marked. **Trees lose in these cases**, and knowing where is
part of knowing the subject.

| Problem | The winning structure | Why the tree loses |
|---|---|---|
| **Point lookup with no ordering needed** | **hash table** | O(1) beats O(log *n*), and you were paying for an ordering you never used (V3 §20.11) |
| **High-dimensional approximate nearest neighbour** | **HNSW graphs**, IVF/PQ quantization (FAISS) | The curse of dimensionality: a region carries almost no information about distance, and partitioning assumes it does (V4 §25.5) |
| **Longest prefix match at line rate** | **TCAM** in hardware | Compares all entries in parallel in one cycle. A trie's log-depth descent cannot compete with true parallelism (§39.3) |
| **Word-based full-text search over documents** | **inverted index** | Far more compact, and it directly supports ranking and boolean queries. Suffix structures win only for *arbitrary substrings* in text with no word boundaries (V4 §26.7) |
| **Approximate set membership** | **Bloom filter** | Answers "definitely not present" in constant time and a few bits per key — and is used *alongside* trees, not instead (V3 §20.7) |
| **Distributed partitioning without range queries** | **consistent hashing** | No metadata tree to keep consistent, no hot-range problem — at the cost of losing range scans entirely (§39.1) |
| **Broad-phase collision in a uniform-density scene** | **spatial hashing**, sweep-and-prune | Constant-time bucketing beats hierarchical descent when density is uniform and the query radius is fixed |
| **Whole-array aggregates with no updates** | a **precomputed prefix-sum array** | Volume 4 §22.1's O(1) query — the tree exists only to make *updates* possible |
| **Smooth, linear relationships in prediction** | linear/parametric models | Axis-aligned piecewise-constant functions approximate a line with a staircase, and cannot extrapolate at all (V4 §28.8) |
| **Sequential file access** | a plain **array or extent list** | No index needed. FAT's mistake was not "no tree" but "a linked list" (§38.3) |

> **The pattern in that table: a tree is the right answer when you need an *ordering* or a
> *hierarchy* and the data is too large or too dynamic for a flat structure.** Drop the ordering
> requirement and a hash table wins. Drop the dynamism and a sorted array wins. Add enough dimensions
> and the hierarchy stops being informative. Add enough hardware parallelism and the descent stops
> being the cheapest way to search. **The tree's domain is real, and it is not everything.**

---

