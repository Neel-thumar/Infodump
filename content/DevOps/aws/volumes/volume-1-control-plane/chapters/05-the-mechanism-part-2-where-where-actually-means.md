## THE MECHANISM, PART 2: Where "Where" Actually Means

AWS geography has four levels, and three of them get confused constantly. Be precise about these.

### Region

A **Region** is a named geographic area containing multiple isolated data center clusters. `us-east-1` is Northern Virginia. `eu-west-1` is Ireland. `ap-southeast-2` is Sydney.

Regions are the unit of isolation. They are deliberately, aggressively independent: separate power, separate networking, separate control planes. Data does not move between Regions unless you explicitly make it move. This is a hard guarantee that exists partly for fault isolation and partly because data residency law demands it.

The practical consequence beginners trip over: **most AWS resources are regional and invisible from other Regions.** Your S3 bucket lives in a Region. Your EC2 instance lives in a Region. If you create something and then can't find it, the first thing to check is the Region selector in the console's top-right corner.

A handful of services are **global**: IAM, Route 53, CloudFront, and a few others. Hold that thought — it's about to become the most important fact in this volume.

### Availability Zone

An **Availability Zone (AZ)** is one or more discrete data centers within a Region, with independent power, cooling, and physical security, connected to the other AZs in that Region by high-bandwidth, low-latency private links.

The design intent: a fire, a flood, or a power failure should take out one AZ and leave the others running. The links between them are fast enough — typically single-digit milliseconds — that you can run synchronous replication across them, which is exactly what RDS Multi-AZ does (Volume 6).

**The AZ naming trick.** This one genuinely surprises people. The name `us-east-1a` is *randomized per AWS account*. My `us-east-1a` and your `us-east-1a` are probably different physical facilities.

AWS did this on purpose. If every account's "a" zone meant the same building, everyone would default to it and load would be catastrophically unbalanced.

But it creates a problem: how do two accounts coordinate about a shared physical location? The answer is the **AZ ID** — an identifier like `use1-az1` that *is* consistent across all accounts. You'll use AZ names day to day and AZ IDs when you need to talk about physical reality.

### Local Zones and Wavelength

Extensions of a parent Region placed closer to specific population centers (Local Zones) or inside mobile carrier networks (Wavelength). They exist for genuinely latency-bound workloads. They are not a beginner concern, but know they're not the same thing as edge locations.

### Edge location

An **edge location** is a small point of presence used for caching and traffic termination — CloudFront, Route 53's DNS servers, AWS Global Accelerator. There are far more of them than there are Regions, and they're in far more cities.

**An edge location is not a small Region.** You cannot run an EC2 instance in one. It has no general compute, no storage services, no AZs. It caches, it resolves DNS, it terminates TLS, and it forwards.

Conflating these is the most common geography mistake in AWS. Regions run your stuff. Edge locations make your stuff feel closer.

*(The exact count of edge locations changes constantly — AWS adds them frequently. Treat any specific number you read, including in AWS's own marketing, as a snapshot. Verify against current sources if it matters.)*

---

