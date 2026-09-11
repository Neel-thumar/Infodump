## THE MECHANISM: EBS — Your Disk Is on the Network

### The central fact

An **EBS volume is not attached to your server.** It's a block device served over the network from a replicated storage cluster within an Availability Zone, presented to your instance as though it were local.

Once you accept that, everything else makes sense:

- **EBS volumes are AZ-scoped.** A volume in `us-east-1a` cannot attach to an instance in `us-east-1b`. Ever. To move it, you snapshot and restore.
- **Volumes outlive instances.** Terminate the instance; the volume can persist (subject to its delete-on-termination flag).
- **EBS has its own failure modes** — network ones. It can be slow or unavailable while the instance is perfectly healthy. Remember that for the 2011 incident.
- **Performance is a network property**, which is why instances have separate EBS bandwidth limits from general network bandwidth.

### The volume types

| Type | Media | Characteristics |
|---|---|---|
| **gp3** | SSD | Baseline 3,000 IOPS and 125 MB/s **independent of size**; provision more independently |
| **gp2** | SSD | 3 IOPS per GB, bursting via credits — the older generation |
| **io2 / io2 Block Express** | SSD | Provisioned IOPS, very high ceilings, highest durability |
| **st1** | HDD | Throughput-optimized, sequential workloads, cheap per GB |
| **sc1** | HDD | Cold storage, cheapest, infrequent access |

**gp3 versus gp2 deserves a moment.** Under gp2, performance was welded to capacity: 3 IOPS per GB meant that if you needed 3,000 IOPS you had to buy a 1,000 GB volume whether or not you needed the space. People routinely over-provisioned capacity purely to buy performance.

gp3 decoupled them. You get 3,000 IOPS and 125 MB/s on any size, and buy more of either independently. It's also roughly 20% cheaper per GB than gp2.

**The practical consequence:** a great many AWS accounts still run gp2 volumes that would be cheaper and faster as gp3, and the migration is a live modification with no downtime. It's one of the highest-ratio cost wins available.

### The second burst credit system

gp2 has its own credit bucket, separate from CPU credits — the same mechanism wearing different clothes.

A gp2 volume under 1,000 GB earns I/O credits and can burst to 3,000 IOPS. Sustained load past its baseline drains the bucket. Then it drops to baseline: 3 IOPS per GB, so a 100 GB volume falls to **300 IOPS**.

A database on a small gp2 volume performs beautifully in testing and collapses under sustained production load, for exactly the same structural reason as the T-instance cliff. The metric is `BurstBalance`.

gp3 has no burst credits. Its baseline is its performance. This is a considerable simplification and a good reason to prefer it.

### Instance store — the other disk

Some instance types (`m7gd`, `i4i`, anything with a `d`) have **instance store**: NVMe drives physically attached to the host.

- Extremely fast — no network in the path
- **Ephemeral.** Data is lost on stop, on terminate, and on host failure
- **Survives a reboot**, which is a genuinely confusing distinction until you see why: reboot keeps you on the same host; stop/start may move you to a different one

Use it for caches, scratch space, temporary shuffle data — anything you can regenerate. Never for anything you need.

### Snapshots

EBS snapshots are **incremental and block-level**, stored in S3 (AWS's own, not your buckets).

The first snapshot copies every used block. Subsequent snapshots copy only blocks that changed. This makes them cheap to take often.

The part people get wrong: **deleting a snapshot never breaks a later one.** AWS handles the dependency — deleting snapshot 2 moves any blocks that snapshot 3 still needs. You cannot orphan your own data by deleting a middle snapshot, which is what everyone fears.

One performance note: a volume restored from a snapshot loads blocks from S3 lazily on first access. Initial reads can be noticeably slow. Fast Snapshot Restore exists to eliminate this, and it costs money.

Snapshots are encrypted if the volume was, using KMS (Volume 2). A snapshot of an encrypted volume cannot be decrypted without the key, which is exactly the durability trade-off from Volume 2 showing up again.

---

