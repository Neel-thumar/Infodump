## REAL INCIDENT: The `0.0.0.0/0` Pattern

There's no single famous VPC outage to tell you about. Instead there's something more useful: a failure pattern that recurs so reliably it has become an industry constant.

### The shape of it

Someone needs to reach a service. Debugging a connection issue, setting up a demo, onboarding a contractor. They open a security group to `0.0.0.0/0` — all IPv4 addresses — intending to narrow it later.

They don't narrow it later.

The service is discovered by automated scanning, typically within hours. It's exploited. The pattern repeats across every cloud provider and every year.

### Documented waves

**January 2017 — the MongoDB ransom wave.** Tens of thousands of MongoDB instances were found exposed to the internet with no authentication. Attackers wiped databases and left ransom notes demanding Bitcoin. Several competing groups were doing it simultaneously, sometimes overwriting each other's ransom notes. The same wave rolled through Elasticsearch, CouchDB, and Hadoop clusters over the following months.

Root cause in almost every case: a database bound to all interfaces, with a network rule allowing the world in.

**2018 — Tesla's Kubernetes console.** Security researchers at RedLock reported finding a Kubernetes administrative console belonging to Tesla exposed without password protection. Inside it were AWS credentials. The attackers who'd found it first were using the infrastructure to mine cryptocurrency — and notably, they'd configured the mining to run at low intensity behind CloudFlare to avoid detection.

**Ongoing — Redis, Docker APIs, Jenkins, exposed management ports.** The cryptomining economy from Volume 2 feeds directly on these. An open port is compute someone else can spend.

### Why this keeps happening

It isn't ignorance. It's structural:

1. **`0.0.0.0/0` is the fastest way to make a thing work.** Under deadline pressure, "it works now" beats "it's correct."
2. **Nothing degrades.** An over-permissive rule has no symptom. It doesn't slow anything, break anything, or appear in a log. There's no feedback loop.
3. **Default-open software.** Plenty of databases historically shipped binding to all interfaces with no auth, on the reasonable-in-1998 assumption that the network was trusted.
4. **Nobody owns the cleanup.** The person who opened it moved on. Nothing prompts anyone to revisit it.

### What actually prevents it

- **Reference security groups, not CIDRs.** If the only way to reach the database is "be in `sg-web`," there's no temptation to type an IP range.
- **Put things in private subnets.** A resource with no route to an IGW cannot be exposed by a security group mistake. Routing is a stronger guarantee than filtering.
- **Use a bastion or Session Manager instead of open SSH.** AWS Systems Manager Session Manager gives shell access with no inbound port at all — the agent dials out. Port 22 open to the world is a habit worth breaking permanently.
- **Detect continuously.** AWS Config rules, Security Hub, or a scheduled script that flags every `0.0.0.0/0` ingress rule. Exercise 5 below is the manual version.
- **Block it structurally.** An SCP (Volume 2) that denies creating `0.0.0.0/0` ingress rules on sensitive ports. Explicit Deny wins — that's what it's for.

---

