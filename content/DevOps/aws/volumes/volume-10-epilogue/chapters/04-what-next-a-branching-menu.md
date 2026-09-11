## What Next: A Branching Menu

The honest answer to "what should I learn next" depends entirely on which volume you found yourself slowing down and reading twice. Find yours.

### If Volume 1 gripped you — control planes, regions, how the thing is built

You're interested in **distributed systems**, and cloud was the entry point.

- **The Amazon Builders' Library** is free and is the best thing AWS publishes. Articles on static stability, timeouts and retries, avoiding fallback, workload isolation using shuffle sharding. Written by principal engineers about real systems.
- **Read AWS's postmortems** directly — the 2011, 2012, 2017, and 2021 documents referenced in this guide. Then read Google's and Cloudflare's.
- **Designing Data-Intensive Applications** by Martin Kleppmann. If you read one technical book after this guide, this is it.
- The **Dynamo paper** (2007) and the **Aurora SIGMOD paper** (2017) as a pair — a decade apart, both from Amazon, both about giving something up to get scale.

### If Volume 2 gripped you — IAM, policy evaluation, envelope encryption

You're interested in **security engineering**, and cloud security is one of the strongest specializations available.

- **Practice offensively.** CloudGoat (Rhino Security Labs) builds deliberately vulnerable AWS environments to attack. flAWS and flAWS2 are free browser-based challenges. Nothing teaches IAM like exploiting it.
- **Pacu** — an AWS exploitation framework, for understanding the attacker's view.
- **The AWS Security Specialty certification** is one of the more respected ones, because it's hard and specific.
- **Read breach postmortems** — Capital One's court documents are public and detailed.
- **Cryptography Engineering** (Ferguson, Schneier, Kohno) if the KMS material was the interesting part.

### If Volume 3 gripped you — VPC, routing, stateful vs stateless

You're interested in **networking**, which is chronically underpopulated and therefore valuable.

- **Learn real networking fundamentals.** CCNA-level material is worth working through even if you never touch Cisco hardware. Subnetting, routing protocols, the OSI model as an actual tool.
- **BGP specifically** — Volume 5's hijack incident is a door into how the internet's routing layer really works, and how weakly authenticated it is.
- **AWS Advanced Networking Specialty** — the hardest AWS certification by most accounts, and a genuine differentiator.
- **Transit Gateway, Direct Connect, and hybrid architectures** — this is where large enterprises need people and struggle to find them.

### If Volume 4 gripped you — Nitro, EBS, burst credits, scaling lag

You're interested in **systems and performance engineering**.

- **Systems Performance** by Brendan Gregg. The definitive text, and his USE method is a genuinely reusable diagnostic framework.
- **Read the Firecracker paper** (NSDI 2020) and the source — it's open, it's Rust, and it's readable.
- **Linux internals** — what the kernel is actually doing underneath all this.
- **eBPF** for modern observability at the kernel level.

### If Volume 5 gripped you — S3's design, consistency, the edge

You're interested in **distributed storage and web delivery**.

- **The consistency literature** — CAP, PACELC, linearizability. Kleppmann again.
- **Web performance** — Core Web Vitals, HTTP/3 and QUIC, caching strategy at scale.
- **DNS deeply**, including DNSSEC, and the RPKI/BGP security work happening now.
- **How other CDNs work** — Cloudflare's engineering blog is excellent and covers the same problems from a different architecture.

### If Volume 6 gripped you — Aurora, replication, the log as the database

You're interested in **database internals**.

- **Database Internals** by Alex Petrov. Storage engines, B-trees, LSM trees, distributed consensus.
- **Read the papers** — Aurora's SIGMOD paper, Spanner, Calvin, the Raft paper.
- **Learn one database very deeply.** PostgreSQL is the best choice: query planning, MVCC, vacuum, WAL, replication. Depth in one transfers better than breadth across five.
- **AWS Database Specialty** certification if you want the credential.

### If Volume 7 gripped you — Firecracker, cold starts, containers

You're interested in **platform engineering**, which is currently one of the strongest job markets in infrastructure.

- **Learn Kubernetes properly**, not just EKS. The CKA (Certified Kubernetes Administrator) is a hands-on exam and a genuinely respected credential.
- **Build a platform** — an internal developer platform, a golden path, self-service infrastructure. This is what platform teams actually do.
- **Backstage, Crossplane, ArgoCD, Flux** — the current tooling around this.
- **Read the Firecracker and gVisor work** for the isolation angle.

### If Volume 8 gripped you — observability, static stability, chaos

You're interested in **Site Reliability Engineering**.

- **The Google SRE books** — all three are free online. *Site Reliability Engineering*, *The SRE Workbook*, and *Building Secure and Reliable Systems*.
- **Learn SLIs, SLOs, and error budgets properly.** This is the framework that turns reliability from an argument into a number.
- **Chaos engineering** — the principles, then AWS Fault Injection Service, then Gremlin or LitmusChaos.
- **Incident command** — the human side. How incidents get run, blameless postmortems, on-call that doesn't destroy people.
- **Practice incident response** — read postmortems and, for each one, ask what you'd have needed in place beforehand.

### If Volume 9 gripped you — cost, IaC, organizations

You're interested in **cloud economics and governance**, which is a smaller field with less competition.

- **FinOps** — the FinOps Foundation has a certification and a framework. This discipline barely existed ten years ago and now has dedicated roles at most large cloud consumers.
- **Last Week in AWS** by Corey Quinn — the best writing on AWS cost, and funny.
- **Terraform or OpenTofu deeply** — modules, state management, testing with Terratest, policy as code with OPA or Sentinel.
- **Multi-account architecture at scale** — Control Tower, landing zones, organizational design.

---

