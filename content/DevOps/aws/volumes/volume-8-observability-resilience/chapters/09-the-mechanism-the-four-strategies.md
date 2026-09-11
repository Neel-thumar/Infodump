## THE MECHANISM: The Four Strategies

AWS's own disaster recovery framing, ordered by cost and capability.

### 1. Backup and Restore

Back up data and configuration to another Region. On disaster, provision new infrastructure and restore.

- **RTO:** hours to days
- **RPO:** whatever your backup interval is
- **Cost:** very low — storage only

**Good for:** non-critical workloads, and as the floor beneath every other strategy. Even an active-active setup needs backups, because replication faithfully replicates a bad `DELETE`.

**The trap:** provisioning infrastructure during a disaster is slow and requires the control plane to be working in the target Region. This is why infrastructure as code (Volume 9) is a DR requirement, not a nicety — restoring data into infrastructure you have to hand-build is not a plan.

### 2. Pilot Light

Data is continuously replicated to the second Region. Core infrastructure exists but is switched off or minimal. On disaster, you scale it up.

- **RTO:** tens of minutes
- **RPO:** minutes (replication lag)
- **Cost:** low — storage and replication, minimal compute

**Good for:** the common middle ground. A cross-Region read replica (Volume 6) with a defined promotion procedure and IaC ready to deploy the application tier.

**The trap:** "scale it up" is a control plane operation in the target Region. It usually works, because regional failures are usually isolated — but you're depending on it.

### 3. Warm Standby

A scaled-down but **fully functional** copy running in the second Region. It can serve traffic today, just not at full volume.

- **RTO:** minutes
- **RPO:** seconds
- **Cost:** moderate — you're running a second environment

**Good for:** business-critical systems where tens of minutes is too long.

**The advantage over pilot light is subtle and important:** it's running, which means it's *tested continuously*. A pilot light environment that has never served a request may not work. A warm standby that serves 5% of traffic demonstrably does.

### 4. Multi-Site Active/Active

Both Regions serve production traffic simultaneously. Failure means shifting traffic.

- **RTO:** near zero
- **RPO:** near zero
- **Cost:** high, and the complexity cost exceeds the infrastructure cost

**Good for:** systems where downtime is genuinely unacceptable.

**The honest difficulties:**

- **Data consistency across Regions is hard.** Cross-Region latency is tens to hundreds of milliseconds. Synchronous replication at that distance destroys write performance. So you're accepting eventual consistency, and you must design for conflicting writes.
- **Cross-Region data transfer costs** on every replicated byte (Volume 9).
- **Some AWS services are global with a control plane in us-east-1** (Volume 1). Your active-active application may still have a management dependency on one Region.
- **The complexity is permanent.** Every feature, every deployment, every schema migration must now work across Regions, forever.

### Choosing honestly

Most systems belong in the first two categories and are told they belong in the fourth. Multi-Region active-active is the right answer for a minority of workloads and is frequently chosen for reasons of prestige rather than requirement.

**And a genuinely uncomfortable observation:** a badly executed multi-Region architecture is *less* reliable than a good single-Region one, because you've added a large amount of complex, rarely exercised machinery, and complexity is where outages come from. If you can't test the failover regularly, you probably shouldn't have built it.

---

