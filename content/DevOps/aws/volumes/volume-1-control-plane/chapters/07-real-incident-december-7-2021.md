## REAL INCIDENT: December 7, 2021

At roughly 7:30 AM Pacific time on Tuesday December 7, 2021, large parts of the internet stopped working.

Not in the way people expected. Netflix, Disney+, Ring doorbells, Roomba vacuums, Tinder, and — with a certain irony — Amazon's own delivery operations, which meant packages physically stopped moving in parts of the United States.

### What AWS said happened

According to AWS's published post-event summary: an automated activity to scale capacity on the **internal** AWS network triggered unexpected behavior from a large number of clients inside that network.

AWS runs two networks. A main network that hosts customer resources, and an internal network used by AWS's own foundational services — monitoring, internal DNS, authorization systems, the machinery of the control planes. The scaling activity caused a surge of connection attempts across the devices bridging those two networks, which caused congestion, which caused delays, which caused the clients to retry, which caused more congestion.

A feedback loop. The same shape as the 2011 EBS incident you'll meet in Volume 4, in different clothes.

Because the internal network hosts the services that AWS's own operators use, **the congestion also degraded AWS's ability to diagnose and fix the congestion.** Their monitoring was on the affected path. So was, for a while, their ability to update the public Service Health Dashboard — meaning customers couldn't get reliable information about an outage they were living through.

Impact was concentrated in us-east-1, and lasted several hours.

### What actually broke, and what didn't

This is the part worth studying, because it's a textbook demonstration of everything above.

**Broke:** the EC2 control plane (launching instances). Auto Scaling. Parts of the EKS, Fargate, and Connect control planes. The console, which is itself a client of those APIs. Support case creation. The health dashboard.

**Largely kept working:** already-running EC2 instances. S3 and DynamoDB data plane operations in the Region. Route 53's DNS resolution globally.

If your application was already running and didn't need to change anything, there's a reasonable chance it survived. If your application needed to *scale*, or *replace a failed node*, or *deploy a fix*, it did not.

And the cruel twist: the recommended disaster recovery move — fail over to another Region — often requires control plane operations. Launching instances. Changing DNS. Updating configuration. Companies that had a multi-region plan on paper discovered their plan had a dependency on the thing that was broken.

### The other lesson: the monitoring was inside the blast radius

The detail I find most instructive isn't the network loop. It's that AWS's own diagnostic tooling and status communications depended on the failing system.

This generalizes brutally. If your alerting runs in the same Region as your application, an outage takes both. If your runbooks live in a wiki hosted on the affected infrastructure, you can't read them. If your incident channel depends on a service that's down, you can't coordinate.

Volume 8 turns this into concrete practice. For now, hold the question: *what would I be unable to see or do during an outage, because the tool I'd use is affected by the same outage?*

### Honest caveats

- December 2021 was a rough month for AWS generally — there were further disruptions later in December, including an issue affecting other Regions and a power-related event. They had different causes. I'm describing December 7 specifically, and I'd encourage you to read AWS's own post-event summary rather than trusting my compression of it.
- I've given the broad mechanism as AWS published it. I'm not going to invent finer detail about the internal network architecture that AWS hasn't disclosed.

---

