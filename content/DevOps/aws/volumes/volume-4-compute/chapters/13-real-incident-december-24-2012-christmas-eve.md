## REAL INCIDENT: December 24, 2012 — Christmas Eve

### What happened

On Christmas Eve 2012, Netflix went down for a large number of customers in the Americas. It lasted through much of the evening and into Christmas Day — arguably the worst possible time for a company whose business is people at home with their families.

The cause was inside AWS's Elastic Load Balancing service in `us-east-1`.

### The mechanism

Per AWS's published summary: a maintenance process intended for a development environment was **run against the production ELB state data**. It deleted state data for a portion of running load balancers.

Nothing broke immediately. The load balancers kept running on their in-memory configuration — a data plane that kept serving after its control plane record was gone.

The failure surfaced later, as those load balancers went through normal operations — scaling activities, workflows that read and write the state data. Each such operation found missing or inconsistent state and produced a **misconfigured load balancer**. Roughly **6.8% of running ELBs** were affected.

Recovery was slow and painful. Restoring the deleted state without corrupting the state of load balancers that had been modified since the deletion required careful, largely manual work.

### The failures underneath

**Access.** A maintenance process with the power to delete production state data was runnable by a person who did not need that power at that moment. This is the least-privilege principle from Volume 2, in its most expensive form.

**Detection.** The deletion wasn't noticed when it happened. It was noticed *hours later*, by its downstream effects. There was no alarm on "state data was deleted."

**Latent damage.** This is the most instructive part. The damage was inflicted at time T and manifested at time T+hours, triggered by unrelated normal activity. Between those points, everything looked fine. Any system where a destructive change doesn't surface immediately has this property, and it makes root-cause analysis brutally hard — you're looking for a cause in the wrong time window.

**Blast radius of a manual action.** One process, one operator, one mistake, thousands of customers.

### AWS's remediation

Their published response included: removing that access from the people who didn't need it, adding change monitoring and alarms on the state data, and modifying the recovery process so restoration could be done more safely and quickly.

### Netflix's response

Netflix wrote publicly about it and drew a conclusion that shaped the following decade: **single-Region dependency is a business risk, regardless of how good the provider is.**

The investment that followed — multi-region active-active architecture, and the broader chaos engineering program that grew from Chaos Monkey into Simian Army and eventually region-level failure exercises — came substantially out of this incident. Netflix was the loudest early voice arguing that you cannot claim resilience you have not tested, and this is the night that argument was won internally.

### The lesson to carry

Two things, and they're both uncomfortable:

1. **Your provider's control plane is a dependency you cannot see and cannot fix.** Everything in this volume about designing for instance failure doesn't help when the thing that manages your instances is the thing that's broken.
2. **A destructive action with delayed consequences is the worst kind.** When you build systems — including your own automation — ask: if this ran against the wrong environment, how long before anyone would know?

---

