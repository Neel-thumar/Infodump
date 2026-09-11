# Chapter 5 — Recursion, the Stack, and Getting Rid of Both

## 5.1 Why recursion fits trees so unreasonably well

Recall Definition B from §3.3:

> A tree is either empty, **or** a node together with a sequence of trees.

That definition is a two-case disjunction, and the second case contains the thing being defined.
So any function over trees writes itself:

```
def f(tree):
    if tree is empty:
        return <base case>              # case 1 of the definition
    else:
        return combine(tree.value,      # case 2 of the definition
                       f(tree.left),
                       f(tree.right))
```

The code's shape is the definition's shape. This is not a happy accident — it is what
**structural recursion** means, and it has a real consequence beyond convenience: because the
recursion mirrors the data's construction, a proof by induction on the tree's structure maps
one-to-one onto the function's cases. If your base case is right and your recursive case is right
*assuming the recursive calls are right*, the function is correct. You get correctness proofs
almost for free.

Contrast an array: there is no structural reason a loop over indices is the right shape, and
proving a loop correct requires inventing an invariant that holds at every iteration — a genuinely
creative step. Tree recursion needs no invented invariant. The structure supplies it.

Here is the height function, three lines, obviously correct:

```
def height(n):
    if n is None: return -1                              # empty tree: -1 (see §3.4)
    return 1 + max(height(n.left), height(n.right))
```

And notice: the `-1` convention from §3.4 is exactly what makes this work with **no special case
for leaves**. A leaf's children are both empty, so it computes 1 + max(−1, −1) = 0. If you had
chosen height(empty) = 0, a leaf would compute 1, and you would need an extra branch. The
convention was not arbitrary; it was chosen to make the recursion clean.

## 5.2 The call stack is an implicit stack

Recursion feels like it uses no data structure. It uses a big one — you just did not write it.

Every function call pushes a **stack frame** onto the call stack. On x86-64 a frame for a small
tree function contains roughly:

| Contents | Typical size |
|---|---|
| Return address | 8 bytes |
| Saved frame pointer (`rbp`) | 8 bytes |
| Saved callee-saved registers in use | 8–32 bytes |
| Local variables (`node`, temporaries) | 8–24 bytes |
| Alignment padding to 16 bytes | 0–8 bytes |
| **Total, optimized build** | **~32–48 bytes** |
| **Total, debug build (no inlining, extra spills)** | **~64–128 bytes** |

When you call `height(node.left)`, the machine pushes a frame recording *where to come back to*
and *what `node` was*. That is precisely the information an explicit stack-based traversal must
store by hand. **Recursion is not an alternative to using a stack; it is a syntax for using the
hardware's stack.**

Watch it happen. In-order traversal of the BST from §4.6, showing the call stack at each moment:

```
call in(50)                       stack: [50]
  call in(30)                     stack: [50, 30]
    call in(20)                   stack: [50, 30, 20]
      call in(10)                 stack: [50, 30, 20, 10]
        call in(∅) → return       stack: [50, 30, 20, 10]
        VISIT 10
        call in(∅) → return
      return                      stack: [50, 30, 20]
      VISIT 20
      call in(∅) → return
    return                        stack: [50, 30]
    VISIT 30
    call in(40)                   stack: [50, 30, 40]
      VISIT 40
    return                        stack: [50, 30]
  return                          stack: [50]
  VISIT 50
  call in(70)                     stack: [50, 70]
    call in(60) → VISIT 60        stack: [50, 70, 60]
    return                        stack: [50, 70]
    VISIT 70
    call in(80) → VISIT 80        stack: [50, 70, 80]
  return
return                            stack: []

Output: 10, 20, 30, 40, 50, 60, 70, 80        Peak depth: 4
```

Compare that against the explicit-stack trace in §5.3 below. They contain the same values in the
same order at the same times, because they are the same algorithm.

**Peak stack depth = height of the tree + 1.** That is the number to keep in your head, because
it is the one that turns into a crash.

## 5.3 The same traversals, with the stack made explicit

### Pre-order, iteratively — easy

```
def preorder(root):
    if root is None: return
    stack = [root]
    while stack:
        n = stack.pop()
        visit(n)
        if n.right: stack.push(n.right)   # push right FIRST
        if n.left:  stack.push(n.left)    # so left is popped first
```

The push order is inverted because a stack is LIFO. Trace on the §4.6 BST:

```
[50]           pop 50, visit 50, push 70, push 30
[70, 30]       pop 30, visit 30, push 40, push 20
[70, 40, 20]   pop 20, visit 20, push 10
[70, 40, 10]   pop 10, visit 10
[70, 40]       pop 40, visit 40
[70]           pop 70, visit 70, push 80, push 60
[80, 60]       pop 60, visit 60
[80]           pop 80, visit 80
[]             done

Output: 50, 30, 20, 10, 40, 70, 60, 80    ✔ matches §4.6
```

### In-order, iteratively — the left-spine pattern

```
def inorder(root):
    stack, cur = [], root
    while cur or stack:
        while cur:                  # descend the left spine, remembering the way back
            stack.push(cur)
            cur = cur.left
        cur = stack.pop()           # deepest unvisited node
        visit(cur)
        cur = cur.right             # then handle its right subtree
```

Trace:

```
descend 50→30→20→10   stack: [50,30,20,10]   cur: ∅
pop 10, VISIT 10, cur = 10.right = ∅
pop 20, VISIT 20, cur = ∅
pop 30, VISIT 30, cur = 40 → descend: stack [50,40]
pop 40, VISIT 40, cur = ∅
pop 50, VISIT 50, cur = 70 → descend 70→60: stack [70,60]
pop 60, VISIT 60, cur = ∅
pop 70, VISIT 70, cur = 80 → descend: stack [80]
pop 80, VISIT 80, cur = ∅
stack empty → done

Output: 10, 20, 30, 40, 50, 60, 70, 80    ✔
```

Compare with the §5.2 call-stack trace. Identical contents at identical moments. The explicit
version simply stores `cur` instead of a return address, because we know statically what the
"return" does.

### Post-order, iteratively — annoyingly harder, and the reason is interesting

Post-order needs to know, when it pops a node, whether it has already processed that node's
*right* subtree. Pre-order does not need this (nothing happens after the children) and in-order
needs only a weaker version of it. So post-order requires extra state.

**Method 1 — two stacks, and a genuinely elegant trick:**

```
def postorder(root):
    if root is None: return
    stack, out = [root], []
    while stack:
        n = stack.pop()
        out.push(n)                        # collect in (Node, Right, Left) order
        if n.left:  stack.push(n.left)
        if n.right: stack.push(n.right)
    while out: visit(out.pop())            # reverse it
```

Why this works: the first loop produces the *reverse* pre-order **N, R, L**. Reverse that sequence
and you get **L, R, N** — which is exactly post-order. On the §4.6 BST:

```
First loop produces:  50, 70, 80, 60, 30, 40, 20, 10
Reversed:             10, 20, 40, 30, 60, 80, 70, 50    ✔ matches §4.6
```

Cost: Θ(*n*) auxiliary space for `out`, which is worse than the Θ(height) of the recursive
version. That is the price of the trick.

**Method 2 — one stack plus a "last visited" pointer:**

```
def postorder(root):
    stack, last, cur = [], None, root
    while cur or stack:
        while cur:
            stack.push(cur)
            cur = cur.left
        peek = stack.top()
        if peek.right and last is not peek.right:
            cur = peek.right             # right subtree not yet done → go do it
        else:
            visit(peek); last = stack.pop()

    # `last` is what distinguishes "coming down" from "coming back up"
```

Θ(height) space, and much fiddlier. **That `last` variable is exactly the piece of information
the call stack was tracking for you implicitly** — namely, which of the two recursive calls we
had returned from. Writing it out by hand is a good way to appreciate what the hardware stack was
doing on your behalf.

### Level-order — needs a queue, and nothing else will do

Covered in §4.5. The point bears repeating because it is the cleanest structural insight in these
two chapters: swap the stack for a queue and depth-first becomes breadth-first, with no other
change. And you cannot get a queue for free from recursion, which is why level-order has no
natural recursive form.

## 5.4 What the stack actually costs — with real numbers and real crash sizes

Stack depth equals tree height, and stacks are small and fixed. Default main-thread stack sizes:

| Platform | Default stack | Frames at ~48 B | Frames at ~96 B (debug) |
|---|---|---|---|
| Linux (`ulimit -s` 8192) | 8 MB | ~175,000 | ~87,000 |
| macOS main thread | 8 MB | ~175,000 | ~87,000 |
| macOS secondary thread | 512 KB | ~11,000 | ~5,500 |
| Windows (default) | 1 MB | ~22,000 | ~11,000 |
| Typical goroutine (grows) | 8 KB → 1 GB | — | — |

Now combine with §3.5's height bounds:

| Tree | *n* | Height | Recursion safe? |
|---|---|---|---|
| Balanced binary | 10⁶ | ~20 | Yes, trivially |
| Balanced binary | 10¹² | ~40 | Yes, trivially |
| Degenerate (sorted insertion) | 10⁵ | 10⁵ | **Borderline — crashes on Windows/threads** |
| Degenerate | 10⁶ | 10⁶ | **Stack overflow everywhere** |

> **This is a real production failure mode, not a hypothetical.** A recursive tree function that
> works perfectly in testing on balanced data will segfault on an unbalanced tree, and the
> unbalancing trigger is *sorted input* (§3.6) — the most ordinary input there is. The crash is a
> stack overflow, which on many platforms does not raise a catchable exception; it just kills the
> process, often with a useless core dump because the stack is the thing that got destroyed.
>
> Two defences: **(a) guarantee the tree is balanced**, which is Volume 2 and is the real answer;
> **(b) use an explicit stack on the heap**, which can grow to gigabytes and fails gracefully with
> an allocation error you can handle. Production parsers, serializers, and JSON/XML readers
> routinely do (b) precisely because their input is attacker-controlled and a deeply nested
> document is a trivially cheap denial-of-service otherwise.

### A note on tail calls

Recursion is sometimes eliminable by the compiler when the recursive call is the *last* thing the
function does. Tree traversals are only partly amenable:

```
def preorder(n):
    if n is None: return
    visit(n)
    preorder(n.left)      # NOT a tail call — work follows
    preorder(n.right)     # IS a tail call — nothing follows
```

A compiler doing tail-call optimization can turn the second call into a jump, so pre-order on a
**right**-degenerate tree uses O(1) stack. But the *left* call has work after it and cannot be
eliminated, so a left-degenerate tree still consumes O(*n*) frames. In-order and post-order have
work after both calls in the relevant positions and are worse still.

The standard hand-optimization is to recurse on the *smaller* subtree and loop on the larger,
which bounds stack depth at O(log *n*) **regardless of the tree's shape**:

```
def inorder_bounded(n):
    while n:
        if size(n.left) <= size(n.right):
            inorder_bounded(n.left)      # recurse on the smaller side
            visit(n)
            n = n.right                  # iterate on the larger side
        else:
            ...symmetric...
```

Each recursive call is on a subtree at most half the size, so depth ≤ log₂ *n*. This requires
subtree sizes to be available, which not every tree stores — but the technique is worth knowing
because the same "recurse small, loop large" idea shows up in quicksort for exactly the same
reason.

## 5.5 Morris traversal: in-order in O(1) space, by temporarily lying

Can you traverse in-order with **no** stack at all — no recursion, no auxiliary array, constant
extra memory? Yes, and the trick is one of the most delightful in the subject.

> **History — confidence: high on Morris, moderate on the details.** The idea of using otherwise
> unused child pointers to store traversal information is **threading**, introduced by Alan Perlis
> and Charles Thornton, "Symbol manipulation by threaded lists", *CACM* 1960. Perlis and Thornton
> threaded the tree *permanently*. Joseph M. Morris's contribution ("Traversing binary trees
> simply and cheaply", *Information Processing Letters*, 1979) was to thread and *unthread* on
> the fly, so the tree is unmodified when the traversal finishes.

**The observation.** In-order traversal's hard part is: after finishing a left subtree, how do you
get back to the parent? A stack exists solely to answer that. But look at the left subtree's
**rightmost** node — its in-order *predecessor* of the parent. That node has a null right pointer,
by definition of being rightmost. **That null pointer is free storage, and it is sitting in
exactly the place we will be standing when we need to know where to go next.** So: point it at
the parent, use it, then set it back to null.

```
def morris_inorder(root):
    cur = root
    while cur:
        if cur.left is None:
            visit(cur)
            cur = cur.right           # either a real edge or a thread we installed
        else:
            pred = cur.left
            while pred.right and pred.right is not cur:
                pred = pred.right     # find the rightmost node of the left subtree
            if pred.right is None:
                pred.right = cur      # THREAD: remember the way back
                cur = cur.left
            else:
                pred.right = None     # UNTHREAD: restore the tree
                visit(cur)
                cur = cur.right
```

Worked trace on a three-node tree:

```
        ┌───┐
        │ 2 │
        └─┬─┘
      ┌───┴───┐
   ┌──▼┐    ┌─▼─┐
   │ 1 │    │ 3 │
   └───┘    └───┘

cur=2: has left. pred = 1 (rightmost of left subtree). 1.right is null
       → thread 1.right = 2.  cur = 1.

        ┌───┐
        │ 2 │◄──────┐
        └─┬─┘       │ thread
      ┌───┴───┐     │
   ┌──▼┐    ┌─▼─┐   │
   │ 1 ├────┼───┼───┘
   └───┘    │ 3 │
            └───┘

cur=1: no left → VISIT 1.  cur = 1.right = 2 (following the thread back up)
cur=2: has left. pred = 1. 1.right IS cur → unthread (1.right = null),
       VISIT 2, cur = 2.right = 3
cur=3: no left → VISIT 3. cur = null. Done. Tree is exactly as it started.

Output: 1, 2, 3    ✔    Extra space used: one pointer variable.
```

**Cost analysis.** Time is still Θ(*n*), though with a worse constant: each edge is traversed at
most three times (once descending, once while searching for a predecessor, once following the
thread), so roughly 3× the pointer dereferences of the recursive version. Space is **Θ(1)** — one
variable, no stack, no recursion, no heap allocation. It cannot overflow, at any tree height.

**And now the caveat that determines whether you can ever use it**, which is the real lesson:

> Morris traversal **mutates the tree during traversal.** For a window of time, `1.right` points
> at `2`, which is a structurally false statement about the tree.
>
> Consequences: it is **not usable on a read-only tree** (a `const` structure, a memory-mapped
> file, data in a read-only page). It is **not thread-safe in any form** — a concurrent reader
> observing the threaded state sees a cycle and may loop forever. It is **not
> interrupt/exception-safe** — if the traversal aborts halfway, the tree is left permanently
> corrupted with dangling threads. And it is invisible to most correctness checkers, which will
> see a valid tree before and after and never observe the lie in between.

So Morris is the right tool in a narrow slot: single-threaded, exclusive access, exact-ordered
traversal of a possibly-very-deep tree with hard memory limits. Embedded systems and some
garbage collectors use exactly this class of trick (pointer-reversal marking in GC is a close
relative). Everywhere else, use a stack.

I include it because it teaches something general: **space can very often be bought with
mutation, and the price you pay is not time but *safety properties* — reentrancy,
thread-safety, const-correctness, and crash-consistency.** Volume 5 is largely about what happens
when you make that trade in a system where other people are reading concurrently, and the answer
is that it goes very badly unless you are extremely careful.

## 5.6 Choosing

| Situation | Use |
|---|---|
| Balanced tree, height provably O(log *n*) | **Recursion.** Clearest code, negligible stack cost. |
| Shape not guaranteed; input possibly adversarial | **Explicit stack on the heap.** Grows, fails gracefully. |
| Parsing untrusted/attacker-supplied nested input | **Explicit stack, plus a depth limit.** Deep nesting is a DoS vector. |
| Need level-order | **Explicit queue.** No recursive option. |
| Hard O(1) memory limit, exclusive access, mutable tree | **Morris.** With eyes open. |
| Read-only or shared/concurrent tree | **Never Morris.** Stack or recursion. |
| Very wide, shallow tree, memory-constrained | **Depth-first** — O(height) beats O(width) here |
| Very deep, narrow tree, memory-constrained | **Breadth-first** — O(width) beats O(height) here |

---

