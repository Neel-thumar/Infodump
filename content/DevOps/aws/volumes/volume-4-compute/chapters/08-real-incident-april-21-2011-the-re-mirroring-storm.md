## REAL INCIDENT: April 21, 2011 — The Re-Mirroring Storm

This is the outage that taught the industry a phrase.

### The trigger

At approximately 12:47 AM Pacific on Thursday April 21, 2011, AWS engineers performed a network change in `us-east-1` — routine capacity scaling on the primary EBS network in a single Availability Zone.

The change went wrong. Instead of shifting traffic to another router on the primary high-capacity network, traffic was routed onto the **secondary EBS network** — a lower-capacity network intended for node-to-node replication, not bulk traffic.

That network was immediately overwhelmed.

### The storm

Here's where the architecture turned a networking mistake into a multi-day outage.

Every EBS volume is replicated across multiple nodes in the cluster. Each node continuously verifies it can reach its replica. When a node loses contact with its replica, it assumes the replica has failed and **immediately searches the cluster for free space to create a new replica**. This is correct behavior — it's how EBS maintains durability.

When the secondary network collapsed, a large number of nodes lost contact with their replicas **simultaneously**. They all began hunting for free space at once.

The cluster's free space was exhausted almost immediately. Nodes that couldn't find space kept searching, which generated more traffic, which made the congestion worse, which caused more nodes to lose contact with their replicas, which triggered more re-mirroring.

A feedback loop. Roughly **13% of volumes in the affected AZ became stuck** — unable to serve reads or writes.

### It escaped the Availability Zone

The isolation guarantee from Volume 1 is about the data plane. The control plane is the weak point.

EBS API calls are handled by a control plane that spans the Region. As the affected AZ's cluster struggled, API calls against it started backing up — and because those calls held threads, the backlog eventually starved the control plane's capacity to serve requests for **healthy** AZs too.

So an incident triggered in one AZ degraded EBS operations across the entire Region. If you have Volume 1's control plane / data plane model in your head, this is that model's canonical example.

RDS was affected as a downstream dependency. Some single-AZ RDS instances became stuck; some Multi-AZ deployments failed over as designed, and some didn't.

### The damage

- Full recovery took approximately **four days**
- Roughly **0.07% of volumes in the affected AZ could not be recovered** — permanent data loss
- Reddit, Quora, Foursquare, Hootsuite, and many others were down or badly degraded

That 0.07% is the number that mattered most to the industry. Not "slow." Not "unavailable." **Gone.**

### Netflix stayed up

Netflix was already running on AWS and was substantially unaffected. Their engineering blog post afterward became one of the most influential pieces of infrastructure writing of the decade.

Their approach, in short:

- **Assume components fail.** Stateless services, no reliance on any single instance surviving.
- **Spread across AZs** and be able to lose one entirely.
- **Don't depend on EBS** where it can be avoided — they made heavy use of instance store and treated persistence as a service concern rather than a disk concern.
- **Practice failure.** Chaos Monkey — deliberately killing production instances during business hours — already existed at Netflix before this outage. The 2011 incident is what made the rest of the industry stop thinking it was insane.

### The durable lessons

1. **"Design for failure" became concrete.** Not a slogan — a specific claim that your architecture must survive component loss without human intervention.
2. **Recovery mechanisms can cause outages.** Re-mirroring exists to protect durability. Triggered en masse, it became the attack. Any automatic remediation that consumes a shared resource can do this. Back-off, jitter, and rate limits on recovery paths are not optional.
3. **AZ isolation protects the data plane, not the control plane.** This is exactly the December 2021 lesson from Volume 1, ten years earlier.
4. **Replication is not backup.** Replicated volumes were lost. If you cannot restore from a snapshot in another Region, you do not have a backup.

*Accuracy note: AWS published a detailed public post-event summary that remains one of the best-written postmortems in the industry. The timings, the 13% and 0.07% figures, and the four-day recovery come from that document and contemporaneous reporting. It's worth reading in full.*

---

