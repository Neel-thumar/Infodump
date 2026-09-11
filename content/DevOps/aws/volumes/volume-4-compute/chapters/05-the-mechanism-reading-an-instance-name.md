## THE MECHANISM: Reading an Instance Name

Instance types look like line noise until you learn the grammar. `c7gn.2xlarge` decomposes cleanly:

```text
c        7        gn        .2xlarge
family   gen      attrs     size
```

**Family letter** — what it's optimized for:

| Letter | Purpose |
|---|---|
| `t` | Burstable, cheap baseline (see credits below) |
| `m` | General purpose, balanced |
| `c` | Compute optimized, high CPU-to-memory ratio |
| `r` | Memory optimized |
| `x`, `u` | Extreme memory — in-memory databases |
| `i`, `d` | Storage optimized, large local NVMe |
| `p`, `g`, `trn`, `inf` | Accelerated — GPUs and AWS's own ML silicon |

**Generation number** — higher is newer. Newer generations are usually *cheaper per unit of work* than older ones, which means "we've always run m5" is frequently a decision costing money for no reason.

**Attribute letters:**

| Letter | Meaning |
|---|---|
| `g` | Graviton (ARM) |
| `i` | Intel |
| `a` | AMD |
| `d` | Local NVMe instance storage attached |
| `n` | Network optimized, higher bandwidth |
| `e` | Extra storage or memory |
| `z` | High CPU frequency |

**Size** — `large`, `xlarge`, `2xlarge`, and upward, roughly doubling vCPU and memory each step. Within a family, price generally scales linearly with size, which is why "two mediums or one large" is usually a resilience question rather than a cost one.

---

