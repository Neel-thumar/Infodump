# Chapter 28 — Decision Trees: A Different Lineage Entirely

## 28.1 Why this chapter is different

Every structure so far **stores your data**, and its correctness criterion is exact: it either finds
what you put in, or it has a bug.

A decision tree stores a **model** — a hypothesis about a relationship — and its correctness
criterion is **statistical**: how well it predicts data it has never seen. There is no "correct"
decision tree for a dataset, and a tree that represents its input perfectly is usually **broken**.

This is a genuinely different intellectual lineage. It comes from statistics and machine learning
rather than from computer science, and the differences run deep:

| | Data-structure trees (Ch 1–27) | Decision trees |
|---|---|---|
| Contains | your data | a **hypothesis** about your data |
| Correctness | **exact** — finds the key or does not | **statistical** — accuracy on unseen data |
| Goal | retrieve what you put in | **generalize to what you have never seen** |
| Failure mode | bug, corruption, imbalance | **overfitting** — fitting noise as if it were signal |
| Optimality | provable (height bounds, lower bounds) | finding the optimal tree is **NP-hard**; every practical algorithm is a greedy heuristic |
| Same input → | the same tree | **different trees under resampling** — and that variance is *exploited* (§28.6) |
| A tree that fits its input perfectly is | **correct** | **worthless** |

That last row is the one to hold onto. It has no analogue anywhere else in this book.

## 28.2 But structurally it is something we have already built

Before the differences, the similarity — because it places the chapter properly.

A decision tree node holds a **test on one feature** (`age < 34?`). Edges are outcomes. Leaves hold
**predictions**. Prediction is a root-to-leaf descent: O(depth), one comparison per level.

**That is a BST search.** And with axis-aligned tests on numeric features, the tree partitions
feature space into axis-aligned boxes, one per leaf — which is exactly Chapter 25's KD-tree:

> **A decision tree with axis-aligned splits *is* a KD-tree over feature space, with two
> differences: its leaves store a prediction instead of a point, and its split points are chosen to
> minimize *impurity* rather than to balance the tree.**

Everything else transfers. Depth determines prediction latency. The axis-aligned partition means a
diagonal decision boundary requires a staircase of many splits (§28.8's main weakness), exactly as a
KD-tree needs many cells to approximate a sphere. And Chapter 25's "augmentation for approximation"
(§25.3, Barnes–Hut) is what a leaf does: it stores a summary standing in for all the training points
that landed there.

## 28.3 History

> **Confidence: high on CART, ID3/C4.5, random forests and gradient boosting; moderate on the
> earliest work.**

| Year | Work | Contribution |
|---|---|---|
| 1963 | **AID**, Morgan & Sonquist | Automatic Interaction Detection — arguably the first regression tree |
| 1980 | **CHAID**, Kass | chi-squared based splits, multiway |
| **1984** | **CART** — Breiman, Friedman, Olshen & Stone | The book. Gini impurity, **cost-complexity pruning**, surrogate splits for missing data, regression trees |
| 1986 | **ID3**, Ross Quinlan | information gain |
| 1993 | **C4.5**, Quinlan | gain ratio, continuous attributes, missing values, pruning |
| 1996 | **Bagging**, Breiman | bootstrap aggregation |
| 1997 | **AdaBoost**, Freund & Schapire | the first practical boosting algorithm |
| **2001** | **Random forests**, Breiman | bagging + random feature subsets |
| **2001** | **Gradient boosting**, Friedman | "Greedy function approximation: a gradient boosting machine" |
| 2016 | **XGBoost**, Chen & Guestrin | regularized objective, second-order, sparsity-aware |
| 2017 | **LightGBM**, Ke et al. | histogram splits, leaf-wise growth |
| 2018 | **CatBoost**, Prokhorenkova et al. | ordered boosting, native categorical handling |

## 28.4 Training: greedy recursive partitioning

Finding the optimal decision tree is NP-hard, so every practical algorithm is the same greedy loop:

```
build(samples):
    if stopping condition:  return Leaf(majority class / mean value of samples)
    best = argmax over all (feature, threshold) of  impurity_decrease
    left, right = partition(samples, best)
    return Node(best, build(left), build(right))
```

**Impurity** measures how mixed a node's labels are. Two standard choices:

$$
\text{Gini}(S) = 1 - \sum_i p_i^2 \qquad\qquad \text{Entropy}(S) = -\sum_i p_i \log_2 p_i
$$

Both are maximal when classes are evenly mixed and zero when a node is pure. The **decrease** from
choosing a split is:

$$
\Delta = I(\text{parent}) - \frac{n_L}{n}I(\text{left}) - \frac{n_R}{n}I(\text{right})
$$

With entropy, Δ is called **information gain** and is measured in bits — literally, how many bits of
uncertainty about the label this question resolves. Which makes the whole training procedure
readable as: **at every node, ask the question that tells you the most.** That is the same framing
Chapter 21 §21.2 used to explain why a trie beats the comparison bound — bits of information per
step — and it is not a coincidence, since both are decision trees over a query space.

## 28.5 A worked example

Predict `Buy?` from `Age` (numeric) and `Income` (categorical).

| # | Age | Income | Buy? |
|---|---|---|---|
| 1 | 22 | Low | No |
| 2 | 25 | High | No |
| 3 | 28 | Low | No |
| 4 | 33 | Low | No |
| 5 | 35 | High | **Yes** |
| 6 | 38 | High | **Yes** |
| 7 | 42 | Low | **Yes** |
| 8 | 45 | High | **Yes** |
| 9 | 50 | Low | No |
| 10 | 55 | High | **Yes** |

**Root:** 5 Yes, 5 No.

$$
\text{Gini} = 1 - (0.5^2 + 0.5^2) = \mathbf{0.5} \qquad \text{Entropy} = 1.0 \text{ bit}
$$

### Evaluate candidate splits

**Candidate A — `Age < 34`:**

```
  left  {1,2,3,4}     : 0 Yes, 4 No   →  Gini = 1 − (0² + 1²)             = 0.000  (pure)
  right {5,6,7,8,9,10}: 5 Yes, 1 No   →  Gini = 1 − ((5/6)² + (1/6)²)     = 0.278

  weighted = (4/10)(0.000) + (6/10)(0.278) = 0.167
  GINI DECREASE = 0.500 − 0.167 = 0.333
```

**Candidate B — `Income = High`:**

```
  High {2,5,6,8,10}   : 4 Yes, 1 No   →  Gini = 1 − (0.8² + 0.2²)         = 0.320
  Low  {1,3,4,7,9}    : 1 Yes, 4 No   →  Gini = 1 − (0.2² + 0.8²)         = 0.320

  weighted = (5/10)(0.320) + (5/10)(0.320) = 0.320
  GINI DECREASE = 0.500 − 0.320 = 0.180
```

**Candidate C — `Age < 47.5`:**

```
  left  {1..8}        : 4 Yes, 4 No   →  Gini = 0.500
  right {9,10}        : 1 Yes, 1 No   →  Gini = 0.500

  weighted = (8/10)(0.500) + (2/10)(0.500) = 0.500
  GINI DECREASE = 0.500 − 0.500 = 0.000       ← useless split
```

**Winner: `Age < 34`, decrease 0.333.** Cross-check with entropy: information gain for A is
1.0 − [0.4(0) + 0.6(0.650)] = **0.610 bits**; for B it is 1.0 − 0.722 = **0.278 bits**. Both criteria
agree, which is typical — Gini and entropy rarely disagree on the winner, and Gini is cheaper because
it needs no logarithms.

### Recurse

```
Left child {1,2,3,4}: 0 Yes, 4 No → PURE → Leaf, predict "No".

Right child {5,6,7,8,9,10}: 5 Yes, 1 No, Gini 0.278.  Evaluate:

  Income = High?    High {5,6,8,10}: 4Y/0N Gini 0.000
                    Low  {7,9}     : 1Y/1N Gini 0.500
                    weighted = (4/6)(0) + (2/6)(0.5) = 0.167   →  decrease 0.111

  Age < 47.5?       left {5,6,7,8} : 4Y/0N Gini 0.000
                    right {9,10}   : 1Y/1N Gini 0.500
                    weighted = 0.167                           →  decrease 0.111

  A TIE. (Ties are common on small data; implementations break them by feature
  order, or randomly — which is itself a source of the variance §28.6 exploits.)
  Take Income = High.

    High {5,6,8,10}: PURE → Leaf, predict "Yes".
    Low  {7,9}     : 7=(42,Yes), 9=(50,No). Split Age < 46 → both pure.
```

### The finished tree

```
                        ┌──────────────┐
                        │  Age < 34 ?  │
                        └──┬────────┬──┘
                     yes ──┘        └── no
                          │              │
                   ┌──────────────┐  ┌───────────────────┐
                   │ Leaf:  No    │  │ Income = High ?   │
                   │ (4/4 correct)│  └──┬─────────────┬──┘
                   └──────────────┘ yes─┘             └─no
                                        │                 │
                                 ┌──────────────┐  ┌──────────────┐
                                 │ Leaf:  Yes   │  │  Age < 46 ?  │
                                 │ (4/4)        │  └──┬────────┬──┘
                                 └──────────────┘ yes─┘        └─no
                                                      │            │
                                               ┌───────────┐ ┌───────────┐
                                               │ Leaf: Yes │ │ Leaf: No  │
                                               │   (1/1)   │ │   (1/1)   │
                                               └───────────┘ └───────────┘

Training accuracy: 10/10 = 100%.   Depth: 3.
```

### Now look at that last split, because it is the whole chapter

The `Age < 46` node separates **exactly two data points**: a 42-year-old low-income buyer and a
50-year-old low-income non-buyer. It asserts that among low-income people over 34, the buying
threshold is at age 46.

**Is that a real pattern, or is it noise?** With *n* = 2 you cannot possibly tell. And the tree has
committed to it as confidently as it committed to `Age < 34`, which was supported by ten points.

This is **overfitting**, and note that it is not a bug — the algorithm did exactly what it was told,
which was to maximize impurity decrease. A fully grown tree can *always* reach 100% training
accuracy: keep splitting until every leaf holds one sample. That tree memorizes the training set
and generalizes to nothing.

> **Every other structure in this book gets better as it represents its input more precisely. This
> one gets worse.** That inversion is the single most important thing to carry out of this chapter.

## 28.6 Regularization, and the bias–variance trade

Two families of remedy:

**Pre-pruning / early stopping** — refuse to make splits that look unsupported: `max_depth`,
`min_samples_split`, `min_samples_leaf`, `min_impurity_decrease`. Cheap, but myopic: a weak split
can be the necessary precondition for a strong one two levels down, and early stopping never finds
out.

**Post-pruning** — grow the tree fully, then cut it back. CART's **cost-complexity pruning**
minimizes

$$
R_\alpha(T) = R(T) + \alpha \,|\text{leaves}(T)|
$$

where *R*(*T*) is training error and α is a penalty per leaf, chosen by cross-validation. **This is
an explicit complexity penalty** — a regularizer — and the shape of it (fit plus a penalty on model
size) is the same shape as ridge regression, lasso, weight decay, and minimum description length. It
is the standard way the machine learning field expresses "prefer the simpler hypothesis".

The underlying dial is the **bias–variance trade-off**:

| Tree depth | Bias | Variance | Behaviour |
|---|---|---|---|
| Shallow (depth 1–3) | **high** | low | underfits; misses real structure; stable across resamples |
| Deep / unpruned | low | **high** | fits noise; wildly different tree from a slightly different sample |

**A single deep decision tree has low bias and high variance.** Hold that sentence — the next two
sections are two opposite strategies for exploiting it.

## 28.7 Ensembles: two opposite exploits of the same weakness

### Bagging and random forests — attack the variance

> **Confidence: high.** Leo Breiman, "Random forests", *Machine Learning*, 2001, building on his own
> bagging (1996) and Tin Kam Ho's random subspace method (1995).

If deep trees have high variance, **average many of them**. Two sources of diversity:

1. **Bootstrap sampling** — each tree trains on *n* samples drawn **with replacement** from the
   training set, so each tree sees a different dataset.
2. **Random feature subsets** — at *each split*, consider only a random subset of features
   (conventionally √*p* for classification).

Grow every tree **deep and unpruned** — you *want* low bias and high variance, because averaging is
going to destroy the variance.

**Why feature subsampling is not optional — the derivation.** Let each tree have variance σ² and
pairwise correlation ρ. The variance of the average of *B* trees is:

$$
\operatorname{Var}\!\left(\frac{1}{B}\sum_{b} T_b\right) = \rho\sigma^2 + \frac{(1-\rho)\sigma^2}{B}
$$

As *B* → ∞ the second term vanishes and you are left with **ρσ²**. So:

> **More trees buys you nothing beyond a point — ρ is the floor.** Bootstrap sampling alone leaves
> trees highly correlated, because they all discover the same dominant feature and put it at the
> root. Feature subsampling exists **specifically to reduce ρ**, and that is why it is the
> distinguishing ingredient of a random forest rather than a refinement of bagging.

**Bonus: out-of-bag error, for free.** Each bootstrap sample omits roughly

$$
\left(1 - \tfrac{1}{n}\right)^n \to \tfrac{1}{e} \approx 36.8\%
$$

of the training data. So every point is out-of-bag for ~37% of the trees, and averaging their
predictions on it gives a validation estimate **with no held-out set and no cross-validation
loop**.

### Gradient boosting — attack the bias

> **Confidence: high.** Jerome Friedman, "Greedy function approximation: a gradient boosting
> machine", *Annals of Statistics*, 2001.

The opposite construction. Train trees **sequentially**, each one correcting the errors of the
ensemble so far:

$$
F_m(x) = F_{m-1}(x) + \nu \cdot h_m(x)
$$

where *h*ₘ is a tree fitted to the **negative gradient of the loss** with respect to the current
predictions — hence the name: it is gradient descent, performed in function space, with each step
being a tree.

And now the trees are **shallow** (depth 3–8, "weak learners"): you *want* high bias and low
variance, because the sequential correction process is what reduces bias, and low-variance
components keep the additive process stable. The learning rate ν (shrinkage, typically 0.01–0.1) is
essential regularization — small ν with many trees consistently beats large ν with few.

### The contrast, which is the cleanest way to remember them

| | **Bagging / Random Forest** | **Gradient Boosting** |
|---|---|---|
| Trees trained | **in parallel**, independently | **sequentially**, each on the last's errors |
| Individual trees | **deep**, low bias, high variance | **shallow**, high bias, low variance |
| Reduces | **variance** | **bias** |
| Diversity from | bootstrap + feature subsets | the sequential residual process |
| Adding more trees | eventually stops helping (ρσ² floor) | **eventually overfits** — needs early stopping |
| Sensitivity to hyperparameters | low — works well out of the box | **high** — needs tuning |
| Parallelizable | **trivially** | only within a tree |

**Modern implementations** and what each contributed: **XGBoost** (a regularized objective with a
second-order Taylor expansion of the loss, plus sparsity-aware split finding), **LightGBM**
(histogram-based split search and leaf-wise rather than level-wise growth — much faster on large
data), **CatBoost** (ordered boosting to eliminate target leakage in categorical encoding, plus
native categorical handling).

## 28.8 Why trees dominate tabular data, and where they fail

**Gradient-boosted trees remain the strongest general method for tabular data**, generally
outperforming deep neural networks on such tasks. *(Confidence: moderate — this is the widely
reported finding, examined explicitly in work such as Grinsztajn et al., 2022, "Why do tree-based
models still outperform deep learning on tabular data?")*

**Why:**

| Property | Why trees have it |
|---|---|
| **Scale-invariant per feature** | Only the *ordering* of a feature's values matters, so no normalization is needed. Nothing else in ML gets this for free. |
| **Mixed types natively** | Numeric and categorical features coexist; the split test just differs. |
| **Missing values** | CART's surrogate splits; modern boosters learn a default direction per node. |
| **Non-smooth, interaction-heavy relationships** | Piecewise-constant axis-aligned functions capture thresholds and interactions directly, which is what tabular relationships often are. |
| **No feature engineering for monotone transforms** | log, sqrt, rank — all invisible to a tree. |
| **Interpretability** | A single tree is readable; ensembles yield feature importances and SHAP attributions. |

**Where they fail:**

- **Smooth and linear relationships.** *y* = 2*x* requires a staircase of splits to approximate what
  linear regression captures in one coefficient.
- **Diagonal decision boundaries.** Axis-aligned splits approximate a diagonal with a staircase —
  exactly Chapter 25's KD-tree-versus-sphere problem. (Oblique trees, which split on linear
  combinations, address this at the cost of interpretability and training time.)
- **Extrapolation — and this one bites people.** A tree's prediction is always a leaf value derived
  from training data, so **it can never predict outside the range of the training targets.** Feed a
  time-series model with a trend into a gradient-boosted tree and it will flatline at the edge of
  the training range. This is a hard structural limit, not a tuning problem.
- **High-dimensional sparse data** (text, images) — where neural networks and linear models with
  proper regularization win.

**Real uses:** credit scoring and insurance pricing (where interpretability is a regulatory
requirement), fraud detection, click-through-rate prediction, medical risk scores, demand
forecasting, and **learning-to-rank** — **LambdaMART**, which is gradient-boosted trees, has been a
mainstay of web search ranking.

**And a closing note tying back to the rest of the book:** at *inference* time, a boosted ensemble
is a data structure being traversed millions of times per second, and its memory layout matters
exactly as much as Volume 1 §6.2 said it would. There is real engineering work on cache-efficient
tree inference — laying out nodes in traversal order, converting trees to branchless arithmetic,
compiling ensembles into straight-line code (QuickScorer, Treelite). **The model is a tree; the
serving system is a Volume 1 §6 layout problem.** Volume 6 returns to this.

---

