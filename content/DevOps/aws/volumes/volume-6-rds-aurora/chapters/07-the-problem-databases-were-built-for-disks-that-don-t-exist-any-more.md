## THE PROBLEM: Databases Were Built for Disks That Don't Exist Any More

RDS is PostgreSQL, managed. Same engine, same architecture, same assumptions.

And those assumptions come from the 1970s and 80s: a database running on one machine with directly attached disks, where the slow thing is the disk and the scarce thing is memory.

**In a cloud data center, neither of those is true any more.** Storage is on the network (Volume 4). Networks have finite bandwidth. And the traditional architecture pushes an astonishing volume of data across that network.

### The write amplification problem

Amazon's engineers documented this in a paper published at SIGMOD 2017 — *"Amazon Aurora: Design Considerations for High Throughput Cloud-Native Relational Databases"* by Verbitski and colleagues. It's readable, short by academic standards, and worth your time.

Their central observation: consider a single logical write to a mirrored MySQL setup on EBS. What actually crosses the network?

- **Redo log records** — the write-ahead log
- **Binary log** — for replication and point-in-time recovery
- **Modified data pages** — the actual table data
- **Double-write buffer** — MySQL's protection against torn pages
- **Metadata and FRM files**

Each of those is written to the primary's EBS volume (itself mirrored), replicated to the standby, and written to the standby's EBS volume (also mirrored).

The paper works through the arithmetic and arrives at a write amplification factor in the region of **seven and a half times**, with many of those writes being **sequential and synchronous** — each one waiting on the one before.

That means throughput is bounded by the *slowest* step in a chain of network round trips. Adding CPU doesn't help. Adding memory doesn't help. **The network is the bottleneck**, and the traditional architecture is pouring data into it.

---

