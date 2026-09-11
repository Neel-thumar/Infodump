# Chapter 25 — Spatial Trees: When There Is No Total Order

## 25.1 The problem: two dimensions have no useful ordering

Every structure in Volumes 1–3 rested on one assumption so basic it was never stated: **the keys are
totally ordered, and that order reflects what queries care about.** A B-tree works because "between
100 and 200" is a contiguous run in the ordering.

Now move to two dimensions. Query: *"find all points within 10 km of here."* Or: *"what is the
nearest restaurant?"*

**There is no total order on ℝ² that preserves proximity.** This is not a failure of imagination —
it is a fact about the two spaces, and it is worth making quantitative.

### Attempt 1: index by *x*

Suppose *n* points are uniformly distributed in the unit square, and the query is a box of side ε.

```
                  the query box, side ε             the x-STRIP that an index
                  ┌───┐                            on x actually retrieves
     ┌────────────┼───┼──────────────┐        ┌─────┬───┬────────────────────┐
     │            │ ▪ │              │        │     │▪ ▪│                    │
     │       ▪    │▪ ▪│    ▪         │        │  ▪  │▪ ▪│  ▪                 │
     │            │ ▪ │              │        │     │ ▪ │                    │
     │   ▪        └───┘        ▪     │        │  ▪  │ ▪ │        ▪           │
     │        ▪            ▪         │        │  ▪  │ ▪ │    ▪               │
     │    ▪         ▪           ▪    │        │  ▪  │▪ ▪│         ▪          │
     └───────────────────────────────┘        └─────┴───┴────────────────────┘
        points in the box:  ε²n                  points in the strip:  εn
```

$$
\text{overwork ratio} = \frac{\varepsilon n}{\varepsilon^2 n} = \frac{1}{\varepsilon}
$$

| Query box side ε | 2-D overwork (1/ε) | 3-D overwork (1/ε²) |
|---|---|---|
| 0.1 | 10× | 100× |
| 0.01 | **100×** | **10,000×** |
| 0.001 | 1,000× | 1,000,000× |

For a query covering 1% of each axis you examine **100× more points than you need**, in two
dimensions, and it gets exponentially worse with dimension. Two separate indexes (one on *x*, one on
*y*) and an intersection do not help — each returns Θ(ε*n*) candidates in its own right.

### Attempt 2: linearize with a space-filling curve

The genuinely clever attempt. Interleave the bits of the coordinates to produce a single number:

```
  x = 5 = 101₂        Morton (Z-order) code: interleave, x taking even bit positions
  y = 3 = 011₂

  bits:   x₂ y₂ x₁ y₁ x₀ y₀
          1  0  0  1  1  1     =  100111₂ = 39
```

Now index the Morton codes in a B-tree. Nearby points *often* get nearby codes, so a query box maps
to a few contiguous ranges. This is what **geohashes** are (base-32 encoded interleaved lat/lon bits)
and it is genuinely used at scale.

But it does not fully work, and the reason is instructive:

```
THE SEAM PROBLEM

  1-D intuition:  7 = 0111₂  and  8 = 1000₂  are ADJACENT numerically
                  but differ in EVERY bit.

  In 2-D:  two points a millimetre apart, straddling a quadrant boundary,
           get Morton codes that differ in the high bits — so they land
           in completely different parts of the index.

  Consequence: a query box near a boundary decomposes into MANY disjoint
  code ranges, and the number of ranges grows with how many boundaries
  the box straddles. Geohash-based proximity search must therefore query
  the cell AND its eight neighbours, and neighbour computation near the
  poles and the antimeridian is a notorious source of bugs.
```

Hilbert curves have strictly better locality than Morton — the curve never makes a long jump, so
consecutive curve positions are always spatially adjacent — at the cost of much more expensive
encoding and decoding. Google's **S2** library uses a Hilbert curve over a cube projected onto the
sphere, which is a well-engineered version of this approach. Uber's **H3** abandons curves for a
hierarchy of hexagons, which have the pleasant property that all six neighbours are equidistant
(squares have four near and four far).

> **The honest statement:** no mapping ℝ^*d* → ℝ preserves proximity, because a curve has one
> neighbour on each side and a point in the plane has neighbours in all directions. You can *bound*
> the distortion — that is what makes Hilbert curves useful — but you cannot eliminate it.

So: **partition space itself, hierarchically.** Three families follow, and they differ in exactly
one thing: *what decides where the boundary goes.*

## 25.2 KD-trees: split at a data point, alternating axes

> **Confidence: high.** Jon Louis Bentley, "Multidimensional binary search trees used for
> associative searching", *CACM*, 1975.

> **KD-tree invariant.** Each node stores one point and one **axis**. Points in the left subtree have
> a smaller coordinate along that axis; points in the right subtree, larger. The axis **cycles with
> depth**: *x* at depth 0, *y* at depth 1, *x* at depth 2, and so on (or, in the better variants,
> whichever axis currently has the greatest spread).

A KD-tree is a BST where each level compares a *different component* of the key. That is the whole
idea, and it means every node's splitting plane cuts its region in two.

### Worked example — build

Points: (2,3), (5,4), (9,6), (4,7), (8,1), (7,2).

```
depth 0, split on X.  X values: 2, 4, 5, 7, 8, 9.  Take (7,2) as the split point.
    left  (x < 7): (2,3), (5,4), (4,7)
    right (x > 7): (9,6), (8,1)

depth 1, split on Y.
    LEFT group Y values: 3, 4, 7  →  median (5,4)
        left  (y < 4): (2,3)
        right (y > 4): (4,7)
    RIGHT group Y values: 1, 6  →  take (9,6)
        left  (y < 6): (8,1)
        right: —

                       ┌─────────────┐
                       │ (7,2)  ▸X   │
                       └──────┬──────┘
              ┌───────────────┴───────────────┐
       ┌─────────────┐                 ┌─────────────┐
       │ (5,4)  ▸Y   │                 │ (9,6)  ▸Y   │
       └──────┬──────┘                 └──────┬──────┘
        ┌─────┴─────┐                   ┌─────┘
  ┌─────────┐  ┌─────────┐        ┌─────────┐
  │  (2,3)  │  │  (4,7)  │        │  (8,1)  │
  └─────────┘  └─────────┘        └─────────┘
```

And the partition of the plane it induces — this is the picture worth carrying:

```
  y
  8 ┤                        │
  7 ┤        ▪(4,7)          │
  6 ┤────────────────────────│──────── ▪(9,6)
  5 ┤                        │              ← y=6 splits the right half
  4 ┤────────▪(5,4)──────────│
  3 ┤  ▪(2,3)                │            ← y=4 splits the left half
  2 ┤                        │▪(7,2)
  1 ┤                        │        ▪(8,1)
  0 ┼────────────────────────┼──────────────────
    0    2    4    6         7    8    9      x
                             ↑
                        x=7 splits everything
```

### Worked example — nearest neighbour to (6, 5)

```
nn(node, q, best):
    if node is None: return best
    if dist(node.point, q) < dist(best, q): best = node.point
    near, far  =  children ordered by which side of the splitting plane q is on
    best = nn(near, q, best)
    if |q[axis] − node.point[axis]| < dist(best, q):     # ← THE PRUNING TEST
        best = nn(far, q, best)
    return best
```

```
At (7,2), axis X:
    dist² = (6−7)² + (5−2)² = 1 + 9 = 10  →  d = 3.162.   best = (7,2), d = 3.162
    q.x = 6 < 7  →  near = LEFT

  At (5,4), axis Y:
      dist² = 1 + 1 = 2  →  d = 1.414.   BETTER.  best = (5,4), d = 1.414
      q.y = 5 > 4  →  near = RIGHT

    At (4,7):
        dist² = 4 + 4 = 8  →  d = 2.828.   not better.  Leaf.

    back at (5,4): check the FAR side (y < 4).
        |q.y − 4| = |5 − 4| = 1  <  1.414   →  the plane y=4 is CLOSER than
                                               our best, so a nearer point
                                               could hide beyond it. MUST DESCEND.
      At (2,3):
          dist² = 16 + 4 = 20  →  d = 4.472.   not better.  Leaf.

  back at (7,2): check the FAR side (x > 7).
      |q.x − 7| = |6 − 7| = 1  <  1.414   →  MUST DESCEND.

    At (9,6), axis Y:
        dist² = 9 + 1 = 10  →  d = 3.162.   not better.
        q.y = 5 < 6  →  near = LEFT
      At (8,1):
          dist² = 4 + 16 = 20  →  d = 4.472.   not better.
      far side: empty.

ANSWER: (5,4), distance √2 ≈ 1.414.
```

Brute-force check: distances from (6,5) are (2,3)→4.472, **(5,4)→1.414**, (9,6)→3.162,
(4,7)→2.828, (8,1)→4.472, (7,2)→3.162. Minimum is (5,4). ✔

**And notice: we visited all six points.** The pruning test failed both times, because with only six
points spread over the whole region the nearest neighbour is *far* relative to the splitting planes.
That is not a flaw in the example — it is the honest behaviour, and it is the seed of the next
section.

### The curse of dimensionality, quantified

The pruning test is `|q[axis] − split| < r`, where *r* is the current best distance. Pruning happens
when the splitting plane is **farther** than *r*. So pruning works when *r* is **small relative to
the spread of the data**.

Now ask how big *r* is. For *n* points uniform in the unit *d*-cube, the nearest-neighbour distance
scales roughly as:

$$
r \approx \left(\frac{1}{n}\right)^{1/d}
$$

| *d* | *n* = 10⁶ | *r* ≈ | Pruning? |
|---|---|---|---|
| 2 | 10⁶ | 0.001 | **Excellent** — planes are almost always farther than *r* |
| 5 | 10⁶ | 0.063 | Good |
| 10 | 10⁶ | 0.25 | **Marginal** |
| 20 | 10⁶ | **0.50** | **Hopeless** — *r* is half the width of the entire space |
| 100 | 10⁶ | 0.87 | Nothing prunes at all |

At *d* = 20 the nearest neighbour sits half a unit cube away, so **almost every splitting plane is
closer than the current best, and almost nothing is ever pruned.** KD-tree nearest-neighbour search
degrades to a linear scan — with worse constants than an actual linear scan, because of the pointer
chasing.

**Rule of thumb: KD-trees help while *n* ≫ 2^*d*.** *(Confidence: moderate on the exact form of the
rule; high on the phenomenon and the direction.)*

This is the **curse of dimensionality**, and its geometric root is that the volume of a ball becomes
a vanishing fraction of its enclosing cube as *d* grows: at *d* = 20 a unit-diameter ball occupies
about 2 × 10⁻⁸ of the enclosing cube. Almost all of a box is in its corners, and a box-shaped
partition therefore tells you almost nothing about distance.

> **Ball trees** partition with **hyperspheres** rather than axis-aligned hyperplanes, which fits
> the geometry of a distance query much better and pushes the usable dimension somewhat higher.
> `scikit-learn` ships both `KDTree` and `BallTree` and its documentation's guidance on when to
> prefer which is essentially this section.

## 25.3 Quadtrees and octrees: split space, not data

> **Confidence: moderate-high.** Raphael Finkel and Jon Bentley, "Quad trees: a data structure for
> retrieval on composite keys", *Acta Informatica*, 1974. Octrees (the 3-D analogue) are attributed
> variously; Donald Meagher's 1980 work on octree encoding is the usual citation.

> **Quadtree invariant.** Each node owns a square region and splits it into **four equal
> quadrants** — regardless of where the data happen to lie. Subdivide a cell only when it holds
> more than some capacity of points.

The single difference from a KD-tree is where the boundary goes:

| | KD-tree | Quadtree |
|---|---|---|
| Boundary position | **at a data point** (the median) | **at the geometric centre** of the cell |
| Children per node | 2 | 4 (2^*d* in general: 8 for an octree) |
| Balanced? | yes, if built from medians | **no guarantee** |
| Shape depends on | the data *values* | the data **distribution** only |
| Insertion-order dependent? | yes, if built incrementally | **no — completely deterministic** |
| Depth for clustered data | O(log *n*) | **unbounded** |

Two consequences, one good and one bad.

**Good: the structure is canonical.** A quadtree over a given point set is the same tree no matter
what order the points arrived in. There is no balancing, no rotation, no insertion-order pathology —
Volume 2's entire subject simply does not arise. That is a real simplification and it is why
quadtrees are so common in graphics and simulation code.

**Bad: depth is unbounded.** Two points a nanometre apart force subdivision until the cells are
smaller than a nanometre — potentially dozens of levels holding two points. Clustered data (which
is what real spatial data is) is the bad case. The standard mitigations are a maximum depth with
overflow buckets at the leaves, or switching to a KD-tree when clustering is expected.

### The connection to §25.1's space-filling curves

Here is a satisfying unification. **A Morton code is a quadtree path.** Each successive pair of
interleaved bits selects one of the four quadrants:

```
  Morton code   1 0  0 1  1 1
                └┬┘  └┬┘  └┬┘
               level1 level2 level3
                 ↓     ↓     ↓
              quadrant quadrant quadrant

  So a Morton PREFIX names exactly a quadtree CELL, and
  "all points whose Morton code starts with P" = "all points in cell P".
```

Which means a **geohash prefix is a quadtree cell name**, and geohash-based proximity search is a
quadtree traversal expressed as string prefix matching — which in turn means it can be indexed by a
**B-tree or a trie** (Chapter 21!). Three chapters converging. This is genuinely how a lot of
production geospatial indexing works: encode to a curve, store the codes in whatever ordered index
you already have, and accept the seam problem.

### Barnes–Hut: augmentation used for approximation

The *n*-body problem: compute the gravitational force on each of *n* bodies from all the others.
Naively O(*n*²), which at *n* = 10⁹ is not a computation anyone will finish.

The Barnes–Hut algorithm builds an **octree** over the bodies and augments each cell with **its total
mass and its centre of mass** — a textbook §23.2 augmentation, composable in O(1) from the children.
Then, when computing the force on a body:

```
  if the cell is FAR ENOUGH away relative to its size  (s / d < θ, typically θ ≈ 0.5)
      treat the ENTIRE cell as a single point mass at its centre of mass
  else
      recurse into its children

  Result: O(n log n) instead of O(n²).
```

Note what is different from every previous use of augmentation in this book. Chapter 23's `max_hi`
pruned subtrees that provably contained no answer — **exact** pruning. Barnes–Hut prunes subtrees
that contain answers it has decided to **approximate**. The augmentation is being used as a
*summary that stands in for the data*, not as a filter.

> **That is a second, distinct use of the same technique, and it is worth naming: augmentation for
> approximation.** It reappears in the Fast Multipole Method, in level-of-detail rendering (a
> distant object is drawn as its low-detail summary), in hierarchical clustering, and — arguably —
> in Chapter 28's decision trees, where a leaf's stored prediction is a summary standing in for all
> the training points that fell there.

## 25.4 R-trees: a B+-tree for boxes

> **Confidence: high.** Antonin Guttman, "R-trees: a dynamic index structure for spatial searching",
> SIGMOD 1984.

KD-trees and quadtrees index **points**, in memory. Two things they do not handle:

1. **Extended objects** — rectangles, polygons, roads, buildings, a country's border. These have
   spatial extent and can straddle any partition boundary you choose.
2. **Disk.** Volume 3's entire argument applies: a binary or 4-way in-memory partition tree over a
   billion objects has the wrong fanout for a page-based device.

The R-tree is the answer to both, and the cleanest way to describe it is: **it is a B+-tree whose
keys are bounding boxes.**

> **R-tree invariant.** A balanced, page-based tree, with all leaves at the same depth and the same
> minimum/maximum occupancy rules as a B+-tree (Volume 3 §17.2). Leaves hold objects (or their
> bounding boxes plus a pointer). Each internal entry holds a child pointer and the **minimum
> bounding rectangle (MBR)** of everything in that child's subtree.

```
                  ┌──────────────────────────────────────┐
                  │ MBR₁ → child │ MBR₂ → child          │       root page
                  └──────────────────────────────────────┘
                       /                      \
      ┌───────────────────────┐      ┌───────────────────────┐
      │ MBR → leaf │ MBR → …  │      │ MBR → leaf │ MBR → …  │
      └───────────────────────┘      └───────────────────────┘

  Spatially:
      ┌───────────────── MBR₁ ────────────────┐
      │  ┌──────────┐        ┌─────────────┐  │
      │  │ ▭  ▭     │        │   ▭    ▭    │  │
      │  │    ▭     │        │      ▭      │  │
      │  └──────────┘        └─────────────┘  │
      └───────────────────────────────────────┘
              ┌──────── MBR₂ ─────────┐
              │   ┌───────────┐       │      ← MBRs may OVERLAP.
              │   │  ▭    ▭   │       │        A B-tree's key ranges cannot.
              └───┴───────────┴───────┘
```

### The one crucial difference from a B-tree, and everything follows from it

In a B-tree, a node's key ranges are **disjoint and totally ordered**, so a search descends
**exactly one** child. That is what makes a B-tree search O(*h*).

In an R-tree there is no total order, so:

- **MBRs may overlap.** A query rectangle may intersect several children's MBRs, so the search must
  **descend all of them**. Worst case, it visits the whole tree.
- **Insertion has no forced destination.** "Where does this object belong?" has no determined
  answer. Guttman's `ChooseLeaf` heuristic descends into whichever child's MBR requires the **least
  enlargement** to contain the new object, breaking ties by smaller area.
- **Splitting is an optimization problem, not a forced choice.** Volume 3 §18.3 proved that for odd
  order, the median is the *only* legal split point. Here, any partition of the entries into two
  groups satisfying minimum occupancy is legal, and you want the one minimizing the resulting MBRs'
  total area and overlap. Guttman gave three algorithms — exponential (exact), quadratic, and linear
  — because there is no closed form.

> **This is the price of losing the total order, stated exactly.** A B-tree's structure is
> *determined*: given the invariants, split points and descent paths are forced. An R-tree's
> structure is the output of *heuristics*, and its query performance depends on how well those
> heuristics happened to minimize overlap. **Every R-tree variant in the literature is an attempt to
> reduce overlap.**

### The variants, each attacking overlap

| Variant | Idea | Trade |
|---|---|---|
| **R-tree** (Guttman 1984) | least-enlargement insert, three split heuristics | the baseline |
| **R⁺-tree** | forbid overlap by **splitting objects** across multiple leaves | no overlap on search; objects duplicated, harder updates |
| **R\*-tree** (Beckmann, Kriegel, Schneider, Seeger, SIGMOD 1990) | better split criteria (minimize overlap and perimeter, not just area) plus **forced reinsertion** of some entries on overflow | considerably better in practice; **the de facto standard** |
| **Hilbert R-tree** | order entries by the Hilbert code of their centroid, then pack | good bulk-load locality; uses §25.1's curve as a *heuristic* rather than as the index |
| **STR bulk loading** | Sort-Tile-Recursive: sort, tile, pack bottom-up | near-optimal static trees, 100% page occupancy |
| **Priority R-tree** | worst-case-optimal query bound | theoretical guarantee, more complex |

Note the R\*-tree's **forced reinsertion**: on overflow, rather than splitting immediately, remove
~30% of the entries and reinsert them from the root, giving them a chance to find better homes. This
is a *deliberate* structural churn to improve quality — and it is the closest thing in this book to
Volume 2 §12's splay-tree philosophy of restructuring opportunistically, arriving from a completely
different direction.

### BKD-trees: the modern disk-based point index

> **Confidence: moderate-high.** Octavian Procopiuc, Pankaj Agarwal, Lars Arge and Jeffrey Scott
> Vitter, "Bkd-tree: A Dynamic Scalable kd-Tree", 2003.

A BKD-tree is a **KD-tree adapted for disk**, using B-tree-style bulk loading and a small forest of
static trees plus a buffer for updates (which is Volume 3 §20.5's Bε-tree idea, applied spatially).

It matters because **Lucene and Elasticsearch use BKD-trees for all numeric and geo point fields**,
having migrated away from an earlier geohash-prefix-tree approach. For *point* data on disk, BKD has
largely displaced R-trees; R-trees remain the answer for *extended objects*.

## 25.5 Comparison, and where each runs

| | KD-tree | Quadtree / Octree | R-tree | BKD-tree |
|---|---|---|---|---|
| Boundary at | a data point | the cell centre | object MBRs | a data point, page-packed |
| Indexes | points | points (and regions) | **extended objects** | points |
| Balanced | yes (if median-built) | **no** | **yes** (B-tree-style) | yes |
| Children may overlap | no | no | **yes** | no |
| Deterministic shape | no | **yes** | no (heuristic) | mostly |
| Designed for | RAM | RAM | **disk** | **disk** |
| Insertion cost | O(log *n*), rebalancing awkward | O(depth) | O(log *n*) + heuristics | buffered |
| Curse of dimensionality | **severe** past *d* ≈ 10–20 | severe (2^*d* children!) | severe | severe |

**Databases and geospatial:**

- **PostGIS / PostgreSQL** — the **GiST** index (Hellerstein, Naughton, Pfeffer, 1995) is a
  *generalized search tree*: a framework where you supply the predicate and consistency functions,
  and for spatial types the resulting structure is an R-tree. Worth noticing as an engineering idea
  in its own right — a parameterized tree, of which R-trees, B-trees and others are instances.
- **SQLite** ships an `R*Tree` virtual table module. **MySQL** `SPATIAL` indexes are R-trees.
  **Oracle Spatial** uses R-trees.
- **Elasticsearch / Lucene** — BKD-trees for every numeric and geo point field.
- **MongoDB** `2dsphere` — S2 cells (§25.1's Hilbert-on-a-sphere).

**Graphics, games and simulation:**

- **BVH (bounding volume hierarchy)** — essentially an R-tree specialized for ray queries, built
  with a surface-area heuristic. This is the dominant structure for ray tracing, and modern GPUs
  contain **dedicated hardware to traverse BVHs**, which is about as strong a statement about a data
  structure's importance as exists.
- **Octrees** for level-of-detail, frustum culling, voxel worlds, and Barnes–Hut (§25.3).
- **Quadtrees** for 2-D collision detection, terrain, and tile-based games.
- **KD-trees** for point-cloud processing (PCL), photon mapping, and older ray tracers.

**Machine learning — and an honest note.** `scikit-learn` ships `KDTree` and `BallTree` for exact
*k*-NN, and they work well in low dimensions. For high-dimensional approximate nearest neighbour —
embedding search, vector databases, retrieval — **trees have largely lost.** The dominant structures
are **HNSW** (hierarchical navigable small-world *graphs*) and IVF/PQ quantization schemes, as used
in FAISS, and they are not trees at all.

> That is the second time in this volume that the modern answer to a problem turns out not to be a
> tree (Chapter 26 has the other). It is worth being clear-eyed about: **the curse of dimensionality
> defeats hierarchical space partitioning specifically**, because partitioning relies on regions
> being informative about distance, and in high dimensions they are not. A navigable graph makes no
> such assumption.

---

