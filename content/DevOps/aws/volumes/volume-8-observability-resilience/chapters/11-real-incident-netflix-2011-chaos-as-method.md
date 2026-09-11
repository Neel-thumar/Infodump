## REAL INCIDENT: Netflix, 2011 — Chaos as Method

### The setup

You met this briefly in Volume 4. April 21, 2011: the EBS re-mirroring storm takes out a large part of `us-east-1` for days. Reddit, Quora, Foursquare, and many others go dark.

**Netflix stayed up.**

### The part that surprises people

The usual telling implies Netflix responded brilliantly to the outage. The more interesting truth is that **they had already built for it, and Chaos Monkey already existed.**

Netflix had begun moving to AWS around 2008–2009, partly in response to a serious database corruption incident in their own data center. Their engineering leadership drew a conclusion most organizations resist: **if you're going to run on infrastructure that fails, the only way to know you survive failure is to cause failure continuously.**

Chaos Monkey randomly terminated production instances **during business hours**, on purpose, while customers were watching.

The business-hours detail is the whole point. Kill instances at 3 AM and failures surface when nobody is awake to learn from them. Kill them at 2 PM and the engineers who built the system are at their desks when it breaks. You can fix what you observe.

By April 2011, Netflix's services had been surviving random instance death for a long time. The EBS outage was a larger version of something their architecture was already continuously proving it could handle.

### What they actually did

From their public writing, the principles were:

**Stateless services.** No request depends on a particular instance surviving. Any instance can die at any moment.

**Avoid the failing dependency.** They made heavy use of instance store rather than EBS where they could, treating persistence as a service-level concern.

**Redundancy across AZs**, with the ability to lose one entirely.

**Graceful degradation.** When a dependency fails, serve something worse rather than nothing. A generic recommendation list beats an error page. Their Hystrix library formalized this with circuit breakers and fallbacks.

**Timeouts and circuit breakers everywhere.** A slow dependency is more dangerous than a dead one — it consumes threads and connections until the caller dies too. Fail fast.

### What came after

The 2012 Christmas Eve ELB outage (Volume 4) hit Netflix hard and pushed them further:

**Simian Army** — a family of tools beyond Chaos Monkey. Latency Monkey introduced artificial delays. Conformity Monkey found instances not following best practice. **Chaos Kong simulated the loss of an entire AWS Region.**

**Multi-Region active-active.** Netflix moved to running multiple Regions simultaneously and, crucially, **practiced evacuating a Region regularly** — shifting all traffic away from one Region as an exercise, in production.

**ChAP (Chaos Automation Platform)** made experiments continuous and automated rather than manual events.

### The honest caveat

Netflix had enormous engineering resources, a workload well suited to this approach (stateless streaming, tolerant of degraded responses), and years to build it. **Do not read this as "you should build Chaos Kong."**

Read it as: **resilience you have not tested is a hypothesis.**

That claim scales all the way down. You don't need a chaos platform. You need to have actually done the thing once:

- **Restore a backup to a new instance and time it.** (Volume 6.)
- **Force an RDS failover with `--force-failover` in staging with traffic flowing**, and watch your connection pool. (Volume 6.)
- **Terminate an instance in your ASG and time the recovery.** (Volume 4 — you already did this.)
- **Revoke a credential your application uses** and confirm the failure is loud, not silent.
- **Block a dependency at the security group level** and see whether you degrade or collapse.

**AWS Fault Injection Service** (FIS) makes some of this structured — it can terminate instances, inject latency, throttle APIs, and stop tasks on a schedule with guardrails and automatic rollback.

### The generalized lesson of this volume

Look at the pattern across every incident in this guide:

| Incident | The untested thing |
|---|---|
| 2011 EBS | Multi-AZ failover under correlated failure |
| 2012 ELB | A destructive operation's blast radius |
| 2017 S3 | Full subsystem restart at current scale |
| 2019 Capital One | Whether anyone would notice |
| 2021 us-east-1 | Whether diagnosis works during the failure |

**Every one is a capability that existed on paper and had not been exercised at the scale or under the conditions where it mattered.**

That's the volume. Build the capability, then use it before you need it.

---

