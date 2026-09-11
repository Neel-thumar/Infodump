---
id: s3-edge
title: "Volume 5 — S3 and the Edge: Object Storage, CloudFront, Route 53"
order: 5
description: The service that shipped before EC2, the three overlapping permission systems that explain the open-bucket epidemic, and how DNS and CDNs put your bytes near the planet — anchored on the 2017 typo outage and the 2018 BGP hijack.
draft: false
---

# Mastering AWS: The Engineering, The History, The Incidents

## Volume 5 — S3 and the Edge: Object Storage, CloudFront, Route 53

---

## The Question This Volume Answers

You upload a file to S3. AWS tells you it's designed for **eleven nines of durability** — 99.999999999%.

Stated differently: store ten million objects and you'd statistically expect to lose one every ten thousand years.

**How do you make a claim like that?** Not "how do you market it" — how do you engineer a storage system where losing data is that rare, while also serving it to the entire internet, at a price that started at fifteen cents per gigabyte per month and has fallen ever since?

And then the harder question. If S3 is that reliable, why did a large fraction of the internet go dark for four hours on a Tuesday in 2017? And why did tens of millions of people's personal records end up publicly readable in S3 buckets that same year?

Three things to take away:

1. **S3 has no folders**, and the consequences of that go much further than pedantry.
2. **Durability and availability are different properties**, engineered separately, and confusing them will mislead you.
3. **Permission systems that overlap produce holes**, which is the entire story of the open-bucket epidemic.

Then the edge: how a name becomes an address, and how bytes get close to people.

---

## Part One: S3

## THE PROBLEM: Filesystems Don't Scale to the Internet

Think about what a filesystem actually is.

A hierarchical tree. Directories containing directories containing files. Inodes, permission bits, an owner, a group. Byte-range writes anywhere in a file. Locks. Rename operations that are atomic within the tree.

Every one of those features is a coordination requirement, and coordination is what breaks at scale.

**The tree is the worst part.** To create `/a/b/c/file.txt` you must know that `/a/b/c` exists, which means directories are objects with state and relationships. Rename `/a` and every path beneath it changes. A hierarchy is a distributed consistency problem wearing a friendly UI.

**Locks are worse.** Two clients writing to the same file need mutual exclusion. Across a planet-scale distributed system, distributed locking is both slow and a rich source of failure.

**Partial writes are impossible to distribute cheaply.** "Write 40 bytes at offset 1,048,576" requires you to know where that file physically is and to coordinate with everyone else who might be writing near it.

So AWS threw the model out. The design that came back:

- **No hierarchy.** One flat namespace per bucket.
- **No partial writes.** Objects are written whole and replaced whole.
- **No locks.** Last writer wins.
- **No POSIX semantics.** Not a filesystem, doesn't pretend to be.

What remains is almost trivially simple: **a key-value store where values are blobs and keys are strings.** And *because* it's that simple, it can be distributed across data centers with enormous redundancy, because there's very little state to coordinate.

S3 launched **March 14, 2006**, at fifteen cents per gigabyte per month. It shipped five months before EC2.

---

## THE MECHANISM: There Are No Folders

Let's be concrete, because this is the fact people nod along to and then continue not believing.

You upload something to:

```text
s3://my-bucket/reports/2026/q3/summary.pdf
```

The console shows you `reports`, then `2026`, then `q3`. Feels like directories.

**None of those exist.** There is one object. Its key is the literal string `reports/2026/q3/summary.pdf`. The slashes are ordinary characters with no special meaning to the storage layer.

The console builds the illusion by calling `ListObjectsV2` with a **prefix** and a **delimiter**:

```bash
aws s3api list-objects-v2 --bucket my-bucket --prefix "reports/2026/" --delimiter "/"
```

S3 returns matching keys, plus a list of **common prefixes** — the distinct strings that appear between the prefix and the next delimiter. The console renders common prefixes as folder icons. It's a string-grouping operation presented as a directory listing.

### Why this matters practically

**You cannot rename a "folder."** There's nothing to rename. Moving `reports/2026/` to `archive/2026/` means copying every object to a new key and deleting the originals. For a million objects, that's a million copies and a million deletes. Tools like `aws s3 mv` do exactly this, and it's why they're slow on large prefixes.

**Empty folders aren't real.** When you "create a folder" in the console, it writes a zero-byte object with a key ending in `/`. Delete everything under a prefix and the prefix ceases to exist — there's no container left behind.

**Listing costs money and time at scale.** Listing is a scan over a sorted keyspace. Listing a bucket with fifty million objects is a paginated operation that will take a while and generate real request charges. Systems that list-then-process on every run get slow and expensive in ways that surprise people.

**But key naming still matters for performance.** Historically, S3 partitioned by key prefix, and the standard advice was to prepend random hashes to keys so writes spread across partitions. In 2018 AWS substantially improved this — you now get roughly 3,500 write and 5,500 read requests per second *per partitioned prefix*, and S3 partitions automatically. The random-prefix advice is obsolete. But the underlying model — that throughput scales with prefix diversity — is still why a well-distributed keyspace outperforms one where everything shares a prefix.

### Buckets

Bucket names are **globally unique across all AWS accounts on earth**. Not per-account, not per-Region. This is a consequence of the original URL scheme, where the bucket name was a subdomain of `s3.amazonaws.com`.

It's also why every short, sensible bucket name was taken in about 2009, and why you'll end up with names like `mycompany-prod-reports-use1`.

The bucket lives in a Region even though its name is global. Volume 1's inconsistency, still with us.

---

## THE MECHANISM: Durability vs. Availability

These get conflated constantly, and they're engineered by different means.

**Durability** — will the bytes still be there? S3 Standard is designed for **99.999999999%** annual durability. Achieved by redundancy: an object is stored across multiple devices in multiple facilities within the Region, with continuous integrity checking and automatic repair of detected corruption.

**Availability** — can you reach the bytes right now? S3 Standard targets **99.99%**, which permits roughly 53 minutes of unavailability per year. Achieved by having many front-end servers, many paths, and failover.

**The gap between those numbers is deliberate.** Eleven nines of durability and four nines of availability is a stated trade-off: your data is essentially never lost, but it may occasionally be unreachable. When forced to choose, S3 chooses "still exists" over "answering right now."

**And the gap is what February 2017 was.** The data was fine the entire time. Every byte was exactly where it should be. Nobody could get to it.

Hold that distinction. It's also why "S3 is 99.999999999% reliable" is a sentence that means nothing.

---

## THE MECHANISM: Consistency, and the 2020 Change

### What it used to be

For its first fourteen years, S3 offered **eventual consistency** for overwrites and deletes.

Concretely: you PUT a new version of an object, get a 200 back, immediately GET it — and could receive the *old* version. Not an error. Stale data, silently.

New objects had read-after-write consistency, with a nasty caveat: if you'd issued a HEAD or GET on a key *before* the object existed (getting a 404), that negative result could be cached, and subsequent reads might keep returning 404 after the object was written.

### Why it worked that way

Strong consistency in a distributed system requires coordination, and coordination costs latency and creates a dependency between replicas. S3's whole design is about minimizing coordination. Eventual consistency was the price of the scale.

### What people built around it

Entire product categories existed to paper over this.

Most notably: big data processing on S3. Hadoop, Spark, and Hive jobs write output files and then list the directory to find them. With eventual consistency, a listing could miss files that had just been written, and a job would silently process incomplete data. Not fail — *silently produce a wrong answer*.

The workaround was an external consistency layer — a separate database tracking which files should exist, consulted alongside the listing. AWS shipped one called S3Guard, built on DynamoDB. You ran a whole extra database to make your file listings trustworthy.

### December 2020

AWS announced **strong read-after-write consistency for all S3 operations**. Every GET, LIST, and HEAD after a successful PUT or DELETE returns the latest state.

No price change. No performance penalty. No opt-in. It simply became true everywhere.

This is one of the more impressive engineering deliveries in AWS's history — retrofitting strong consistency onto an exabyte-scale system without changing its cost or latency characteristics. Its immediate effect was to render an entire category of workaround tooling obsolete.

**Watch for stale advice.** Blog posts, books, and Stack Overflow answers written before 2021 will tell you to design around eventual consistency in S3. That advice is now wrong, and following it costs you complexity for nothing.

---

## THE MECHANISM: Storage Classes and the Cost of Forgetting

Not all data deserves the same price.

| Class | Availability design | Retrieval | Best for |
|---|---|---|---|
| **Standard** | 99.99% | Immediate | Active data |
| **Intelligent-Tiering** | 99.9% | Immediate | Unknown/changing access patterns |
| **Standard-IA** | 99.9% | Immediate, per-GB retrieval fee | Infrequent but needs to be instant |
| **One Zone-IA** | 99.5% | Immediate | Reproducible data, **single AZ** |
| **Glacier Instant Retrieval** | 99.9% | Milliseconds | Archives you occasionally need fast |
| **Glacier Flexible Retrieval** | 99.99% | Minutes to hours | True archives |
| **Glacier Deep Archive** | 99.99% | Up to ~12 hours | Compliance retention, tape replacement |

**The traps, which are all the same trap:**

**Minimum storage durations.** Standard-IA and One Zone-IA bill a minimum of 30 days. Glacier Instant Retrieval is 90. Deep Archive is 180. Move an object to Deep Archive and delete it a week later — you pay for 180 days. A lifecycle policy that aggressively tiers short-lived objects can cost *more* than leaving them in Standard.

**Minimum billable object size.** The IA and Glacier classes bill a minimum of 128 KB per object. A bucket of a million 2 KB files costs as though they were 128 KB each. Tiering small objects is frequently a loss.

**Retrieval charges.** IA and Glacier charge per GB retrieved. Data you tiered because it was cold, then read heavily, costs more than if you'd left it hot.

**One Zone-IA is in one AZ.** The name says it. Lose that AZ and the data is genuinely gone. Only use it for things you can regenerate.

**Intelligent-Tiering is the honest default** when you don't know your access pattern. It monitors per object and moves things automatically, for a small monitoring fee per object. That per-object fee makes it a poor fit for buckets with enormous numbers of tiny objects.

### The cost leak nobody looks for

**Incomplete multipart uploads.**

Large objects upload in parts. If an upload fails partway — a network drop, a killed process, a crashed job — the parts that did arrive **stay in the bucket**, billed as storage, and **do not appear in any object listing**. They're invisible in the console. You can have terabytes of them.

Any bucket receiving large uploads should have this lifecycle rule:

```json
{
  "Rules": [{
    "ID": "abort-incomplete-multipart",
    "Status": "Enabled",
    "Filter": { "Prefix": "" },
    "AbortIncompleteMultipartUpload": { "DaysAfterInitiation": 7 }
  }]
}
```

It's one rule. It's the single most commonly missing thing in AWS cost reviews.

### Versioning

With versioning on, every PUT creates a new version and nothing is ever overwritten. A DELETE doesn't remove anything — it writes a **delete marker** that hides the object.

Two implications, one good, one expensive:

**Good:** near-complete protection from accidental deletion and from ransomware that tries to encrypt-in-place. Combined with MFA Delete and Object Lock, it's the strongest protection S3 offers.

**Expensive:** **you are billed for every version.** Delete a terabyte from a versioned bucket and your storage bill doesn't move — you added a delete marker. Buckets where versioning was enabled and lifecycle rules for noncurrent versions were not are a routine finding in cost audits.

Pair versioning with a rule that expires noncurrent versions after N days. Always.

---

## THE MECHANISM: The Three Permission Systems

Here's the part that explains the epidemic.

At various points in its history, S3 has had **three overlapping ways** to control access to an object:

### 1. IAM policies (Volume 2)

Identity-based. "This role may read from this bucket." Evaluated by the engine from Volume 2.

### 2. Bucket policies

Resource-based, attached to the bucket, with a `Principal` field. This is what makes cross-account access and public access possible:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": "*",
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::my-bucket/*"
  }]
}
```

`"Principal": "*"` means the entire internet. That statement is the whole breach, in five lines.

### 3. ACLs — the legacy system

S3's **original** permission mechanism, predating IAM. A per-object and per-bucket list of grants, in a different format, with different semantics.

And two ACL grantee groups that caused enormous damage:

- **`AllUsers`** — literally anyone on the internet
- **`AuthenticatedUsers`** — and here's the vicious one: **any user with any AWS account.** Not your account. *Any* AWS account. Anyone who can sign up for the free tier.

Enormous numbers of people read "Authenticated Users" and reasonably assumed it meant *their* users. It meant everyone on earth willing to enter a credit card.

### Why three systems is the actual problem

The three interact. A bucket policy can deny while an ACL allows. An object can have a different ACL from its bucket. An object uploaded by another account could be owned by that account and carry ACLs you didn't write.

The result: **a bucket's true public-accessibility was genuinely hard to determine.** Not "people were careless." The question "is this data public?" required reasoning across three systems with different models, and the console's answer wasn't always obvious.

---

## REAL INCIDENT: The 2017 Open Bucket Epidemic

2017 was the year this broke into the open, largely because researchers started systematically looking.

A partial list of what was found publicly readable in S3, reported through 2017:

- **Verizon / Nice Systems** (July) — records relating to millions of Verizon customers, exposed via a partner's bucket
- **Dow Jones** — customer records including partial payment card details
- **WWE** — several million fans' personal information
- **The US Army INSCOM "Red Disk" bucket** (November) — classified-marked material in a publicly accessible bucket
- **Accenture** — multiple buckets containing internal credentials and keys
- **Booz Allen Hamilton** — geospatial intelligence material

The recurring pattern was not incompetence at the core company. It was a **contractor, a partner, or a departing project** that spun up a bucket, made it readable for convenience, and moved on. Nobody owned it. Nothing degraded. The Volume 3 lesson again: an over-permissive setting has no symptom.

### What AWS built in response

**November 2018 — Block Public Access.** A set of four switches, available at the bucket level *and* the account level, that override everything else. Turn on account-level Block Public Access and no bucket in the account can be made public, regardless of what any bucket policy or ACL says. It's an explicit deny at a level above the permission systems — exactly the Volume 2 guardrail pattern.

**Console warnings.** AWS started marking public buckets with unmissable orange warnings in the list view.

**April 2023 — the defaults changed.** New buckets now have Block Public Access enabled and **ACLs disabled** by default. Object Ownership defaults to bucket-owner-enforced, which turns off the ACL system entirely and leaves only policies.

That last change is quietly the most important. It removed one of the three permission systems from the default path. The number of ways to accidentally be public dropped by a third.

### What to actually do

- **Turn on account-level Block Public Access.** If you genuinely need a public bucket, use CloudFront in front of a private one instead — which is both more secure and cheaper, as we'll see.
- **Leave ACLs disabled.** Use bucket policies only.
- **Never write `"Principal": "*"`** without stopping to think hard about it.
- **Use IAM Access Analyzer**, which continuously reports which buckets are accessible from outside your account.

---

## REAL INCIDENT: February 28, 2017 — The Typo

### What happened

At approximately 9:37 AM Pacific on Tuesday February 28, 2017, an authorized S3 engineer was working an established runbook. The S3 billing system was running slow, and the playbook called for removing a small number of servers from a subsystem used by the billing process.

**A parameter was entered incorrectly.** The command removed a substantially larger set of servers than intended.

The servers that got removed weren't only the billing subsystem's. They supported two other S3 subsystems in `us-east-1`:

**The index subsystem** — which holds metadata and location information for **every S3 object in the Region**. Without it, S3 cannot answer GET, LIST, PUT, or DELETE. It doesn't know where anything is.

**The placement subsystem** — which allocates storage for new objects, and which depends on the index subsystem.

Enough capacity was removed that both required a **full restart**.

### Why it took hours instead of minutes

AWS's post-event summary contains the detail that makes this a genuine engineering lesson rather than a story about typing.

**These subsystems had not been fully restarted for many years.**

S3 had grown enormously in that time. The restart process involved safety checks validating the integrity of metadata across the entire Region's object inventory — and at the scale S3 had reached, that took far longer than anyone expected. Nobody had measured it, because nobody had done it.

The index subsystem came back around 1:18 PM Pacific. Placement followed. Full normal operation returned in the afternoon.

### The blast radius

`us-east-1` is the gravity well from Volume 1. S3 was down there, so: Slack, Trello, Quora, Medium, IFTTT, Docker Hub, Giphy, parts of Adobe's services, and a very long tail of others. Many sites that weren't hosted on S3 still broke, because their static assets, images, or JavaScript bundles were.

**And the AWS Service Health Dashboard couldn't be updated** — because the dashboard's own administration console depended on S3 in `us-east-1`. For a while, AWS's only channel for telling customers what was happening was Twitter.

### Four lessons

**1. Blast radius is a design parameter.** The tool could remove an arbitrary amount of capacity in one call. AWS's remediation changed it to remove capacity more slowly and to refuse to take a subsystem below a minimum safe capacity level. That's not a fix for the typo — it's a fix for *the tool's ability to cause this class of harm at all*. Any operational tool you build should be audited the same way: what's the worst single invocation?

**2. Untested recovery paths are not recovery paths.** Something that hasn't been exercised in years has unknown duration and unknown failure modes. This is why Volume 8 argues for game days. If you have never restored from your backups, you do not know whether you can.

**3. Your status page must not depend on your product.** The dashboard failure is almost comic, but it generalizes hard. Where do your alerts go? Where does your runbook live? Where does your team coordinate? If any answer sits inside the blast radius, you lose that capability precisely when you need it. Same lesson as December 2021, four years earlier.

**4. Cellularization.** AWS's remediation included partitioning the index subsystem into smaller **cells**, so that a failure affects one cell rather than the entire Region. This is now a core AWS architectural pattern and a good idea in your own systems: make the unit of failure smaller than the unit of service.

*Accuracy note: AWS published a detailed post-event summary. The 9:37 AM start and the roughly 1:18 PM index recovery come from that document; I'd treat my other timings as approximate and read the original if precision matters.*

---

## Part Two: The Edge

## THE PROBLEM: The Speed of Light and the Weakness of Names

Two separate problems get solved at the edge.

**Problem one: distance is time.** A round trip from Sydney to Virginia is roughly 200 milliseconds of pure physics. No optimization defeats it. A page that makes ten sequential requests is two seconds of latency before anyone writes a line of code.

**Problem two: names are not addresses.** Humans use `example.com`. Networks route to `93.184.216.34`. Something must translate — and that something is one of the internet's oldest, most load-bearing, and least authenticated systems.

---

## THE MECHANISM: How DNS Actually Resolves

Worth knowing properly, because the 2018 incident exploits exactly this.

When your machine needs `www.example.com`:

1. **Check local caches** — OS cache, browser cache
2. **Ask a recursive resolver** (your ISP's, or a public one). It does the work:
3. **Ask a root server**: "who handles `.com`?" → a referral to the `.com` TLD servers
4. **Ask a `.com` server**: "who handles `example.com`?" → a referral to that domain's authoritative nameservers
5. **Ask the authoritative server**: "what's the address for `www.example.com`?" → the answer
6. **Cache it** for the TTL and return it

Note what's *not* in that list. Classic DNS has **no authentication**. The resolver trusts whichever server answers at the expected address. DNSSEC exists to add cryptographic signing and is still far from universal.

And crucially: step 3 through 5 all depend on the resolver's packets actually reaching the servers they're addressed to. That's a **routing** guarantee, not a DNS one. Remember this.

### Route 53

AWS's DNS service, launched December 2010. The "53" is port 53, DNS's port.

**Record types** you'll use: `A` (IPv4), `AAAA` (IPv6), `CNAME` (alias to another name), `MX` (mail), `TXT` (verification, SPF), `NS` (delegation), `SOA` (zone metadata).

**Alias records** are AWS-specific and genuinely useful. A `CNAME` cannot exist at a zone apex — `example.com` itself — because the DNS standard forbids a CNAME coexisting with other records, and the apex must have `SOA` and `NS` records. This is why so many sites historically forced you to `www`.

An alias record solves it. It looks like an `A` record to the outside world but points internally at an AWS resource — a CloudFront distribution, an ALB, an S3 website endpoint. Route 53 resolves the target's current address at query time. It also **costs nothing to query**, while standard records are billed per query.

**Routing policies** are where Route 53 becomes more than a lookup table:

| Policy | Behavior |
|---|---|
| **Simple** | One answer |
| **Weighted** | Split traffic by percentage — canary deploys, A/B |
| **Latency-based** | Send each client to the Region with lowest latency *for them* |
| **Failover** | Primary, with a secondary when a health check fails |
| **Geolocation** | Route by the client's country — compliance, localization |
| **Geoproximity** | Route by geographic distance with an adjustable bias |
| **Multivalue answer** | Up to eight healthy records, with health checking |

**Health checks** monitor endpoints and remove unhealthy records from answers. This is DNS-level failover, and its limitation is inherent: **DNS is cached**. A client that resolved thirty seconds ago keeps using the old answer until its TTL expires. Low TTLs help and cost more queries. DNS failover is a minutes-scale tool, not a seconds-scale one — which is why load balancer health checks (Volume 4) and DNS health checks solve different problems.

**One notable thing:** Route 53's data plane carries an unusually strong availability commitment — AWS offers a 100% availability SLA for it. Volume 1's control plane / data plane split again: the query-answering path is engineered to a far higher standard than the record-changing path.

---

## THE MECHANISM: CloudFront

A CDN with roughly 600 points of presence worldwide *(a number that changes constantly — verify against current sources)*. Launched November 2008.

### The pieces

**A distribution** is the configuration. It has one or more **origins** — where real content lives (an S3 bucket, an ALB, any HTTP server, including one outside AWS).

**Cache behaviors** map path patterns to settings:

```text
/api/*      -> origin: ALB,    TTL: 0,      forward all headers/cookies
/static/*   -> origin: S3,     TTL: 1 year, forward nothing
/*          -> origin: ALB,    TTL: 60s
```

**The cache key** determines what counts as "the same request." By default it's the URL path. You can add headers, query strings, and cookies — and this is where people destroy their own cache. Forward all cookies, and every user with a distinct session cookie gets a distinct cache entry. Your hit rate collapses to near zero and you've built an expensive, slow proxy.

**Rule of thumb: forward the minimum that correctness requires.**

**TTLs** come from origin `Cache-Control` headers, bounded by minimum, maximum, and default TTLs you configure.

**Invalidations** purge cached objects. The first 1,000 paths per month are free; beyond that they're charged, and they take minutes to propagate. **The better pattern is versioned filenames** — `app.a3f8c2.js` — so new content has a new URL and nothing ever needs invalidating. Invalidation is a fix for a deployment process that doesn't version its assets.

### Origin Access Control

Here's how the 2017 epidemic should have been avoided entirely.

Rather than making a bucket public so CloudFront can read it, **Origin Access Control** gives the distribution a signed identity. The bucket policy allows that specific distribution and nothing else. The bucket stays fully private; only CloudFront can read it; the public reaches CloudFront.

This is better on every axis:

- **Security** — the bucket is never public
- **Cost** — CloudFront egress is cheaper than S3 egress, and cache hits don't touch S3 at all, so you avoid request charges too
- **Performance** — content is cached near users
- **Capability** — you get TLS, WAF, geo-restriction, and signed URLs

OAC replaced the older Origin Access Identity in 2022. If you find OAI in an existing setup, it's the legacy mechanism.

**There is essentially no good reason to serve a public website directly from an S3 bucket in 2026.** Put CloudFront in front of it.

### Edge compute and the certificate trap

**CloudFront Functions** — lightweight JavaScript at the edge location, sub-millisecond, for header manipulation, URL rewrites, simple redirects.

**Lambda@Edge** — full Lambda functions at regional edge caches. More capable, more latency, more cost.

**And the trap that catches everyone:** an ACM certificate used by CloudFront **must be requested in `us-east-1`**, regardless of where anything else is. Your ALB in Frankfurt needs a certificate in `eu-central-1`. Your CloudFront distribution serving the same content needs one in `us-east-1`.

This is Volume 1's us-east-1 gravity showing up in a place you'd never predict, and it is a reliable half-hour of confusion for everyone the first time.

---

## REAL INCIDENT: April 24, 2018 — Hijacking the Map

### What happened

On April 24, 2018, for roughly two hours, users visiting **MyEtherWallet.com** — a popular Ethereum wallet interface — were served a malicious site. Those who proceeded past a browser security warning had their wallets drained. Public reporting put losses at over 150,000 USD in Ethereum.

The attackers did not compromise MyEtherWallet. They did not compromise AWS. **They attacked the layer beneath DNS.**

### The mechanism

Recall from earlier: DNS resolution assumes your packets reach the server you addressed. That assumption is guaranteed by **BGP**, the Border Gateway Protocol, which is how networks on the internet announce "traffic for these IP ranges should come to me."

BGP, historically, works on trust. You announce a prefix; other networks generally believe you.

The attackers arranged for BGP announcements claiming several IP prefixes belonging to **Amazon's Route 53 authoritative nameservers**. The announcements originated through an ISP in the United States. A significant portion of the internet's routers accepted them and began sending Route 53 DNS queries to the attackers' infrastructure instead.

Those servers answered normally for almost everything — but for `myetherwallet.com`, they returned an IP address controlled by the attackers, hosting a clone of the site.

The user typed the correct domain. Their resolver did everything correctly. The answer was wrong because the *packets went somewhere else*.

### The one thing that worked

The attackers could not obtain a valid TLS certificate for the domain. They used a self-signed one, so browsers displayed a full-page security warning.

**Some users clicked through it anyway**, and those are the users who lost money.

That's the entire defense that functioned. The certificate authority system did its job. The warning appeared. And a meaningful number of people dismissed it — which is a lesson about the limits of security controls that depend on a human decision under enthusiasm.

### Why this is in a volume about S3 and CDNs

Because it demonstrates something easy to forget while learning a cloud provider: **AWS's guarantees end at AWS's network.**

Route 53 was up. Its data plane was answering. AWS's systems behaved correctly throughout. The failure was in the routing fabric of the internet itself — infrastructure no single company controls, running a protocol designed in an era when every participant was trusted.

### What defends against it

**DNSSEC** signs DNS records cryptographically. A resolver validating DNSSEC would reject the forged answers, because the attacker couldn't sign them. Route 53 added DNSSEC signing support in 2020; adoption remains partial across the internet.

**RPKI and Route Origin Authorizations** let networks cryptographically declare which autonomous systems may announce their prefixes, so other networks can reject invalid announcements. Adoption has improved considerably since 2018 but is still incomplete.

**Certificate Transparency** logs every issued certificate publicly, so you can detect unauthorized certificates for your domains.

**Certificate pinning and HSTS** reduce the chance a user can click through the warning that saves them.

The honest summary: **the internet's routing layer is less authenticated than most people assume**, and it sits underneath every guarantee your cloud provider makes.

---

## TRY THIS ON YOUR MACHINE

All five are **free** or effectively free — S3 free tier covers small storage and requests, and everything here uses tiny objects. Cleanup at the end.

### 1. Prove there are no folders

```bash
export AWS_DEFAULT_REGION=us-east-1
BUCKET="volume5-lab-$(aws sts get-caller-identity --query Account --output text)-$RANDOM"
aws s3api create-bucket --bucket $BUCKET
echo "Bucket: $BUCKET"

echo "quarterly numbers" > /tmp/summary.txt
aws s3 cp /tmp/summary.txt s3://$BUCKET/reports/2026/q3/summary.txt
aws s3 cp /tmp/summary.txt s3://$BUCKET/reports/2026/q4/summary.txt
aws s3 cp /tmp/summary.txt s3://$BUCKET/reports/2025/q1/summary.txt
```

Now look at the raw truth versus the illusion:

```bash
echo "--- what actually exists ---"
aws s3api list-objects-v2 --bucket $BUCKET --query "Contents[].Key" --output text

echo "--- what the console shows you ---"
aws s3api list-objects-v2 --bucket $BUCKET --prefix "reports/" --delimiter "/" \
  --query "{Objects:Contents[].Key, Folders:CommonPrefixes[].Prefix}" --output json
```

**What to expect:** the first command lists three flat strings. The second returns no objects at all and one "common prefix" — `reports/2025/` and `reports/2026/` — which the console renders as folder icons.

**Why it's interesting:** you can see the illusion being constructed. `CommonPrefixes` is a string-grouping result, not a directory listing. Now try deleting the "folder":

```bash
aws s3api delete-object --bucket $BUCKET --key "reports/2025/"
aws s3api list-objects-v2 --bucket $BUCKET --prefix "reports/2025/" --query "Contents[].Key"
```

The delete succeeds — deleting a key that doesn't exist is not an error in S3 — and the object underneath is untouched. There was nothing to delete.

### 2. Watch a delete not delete anything

```bash
aws s3api put-bucket-versioning --bucket $BUCKET \
  --versioning-configuration Status=Enabled

echo "version one" > /tmp/doc.txt
aws s3 cp /tmp/doc.txt s3://$BUCKET/doc.txt
echo "version two" > /tmp/doc.txt
aws s3 cp /tmp/doc.txt s3://$BUCKET/doc.txt

aws s3 rm s3://$BUCKET/doc.txt

echo "--- normal listing ---"
aws s3 ls s3://$BUCKET/

echo "--- what is actually stored ---"
aws s3api list-object-versions --bucket $BUCKET --prefix doc.txt \
  --query "{Versions:Versions[].{Id:VersionId,Latest:IsLatest,Size:Size}, DeleteMarkers:DeleteMarkers[].{Id:VersionId,Latest:IsLatest}}" \
  --output json
```

**What to expect:** the normal listing shows nothing. The version listing shows **two object versions still present** plus a delete marker.

Recover the file by removing the delete marker:

```bash
MARKER=$(aws s3api list-object-versions --bucket $BUCKET --prefix doc.txt \
  --query "DeleteMarkers[0].VersionId" --output text)
aws s3api delete-object --bucket $BUCKET --key doc.txt --version-id $MARKER
aws s3 cp s3://$BUCKET/doc.txt -
```

**Why it's interesting:** you just performed ransomware recovery. It's also the mechanism behind the cost surprise — you "deleted" a file and your storage bill didn't move by a byte. Every version is still billed.

### 3. Take apart a presigned URL

```bash
aws s3 presign s3://$BUCKET/reports/2026/q3/summary.txt --expires-in 60
```

Copy the URL and look at its query string — then fetch it:

```bash
URL=$(aws s3 presign s3://$BUCKET/reports/2026/q3/summary.txt --expires-in 60)
echo "$URL" | tr '&' '\n'
curl -s "$URL"
```

Wait 70 seconds and try again:

```bash
sleep 70
curl -s "$URL" | head -20
```

**What to expect:** query parameters including `X-Amz-Algorithm=AWS4-HMAC-SHA256`, `X-Amz-Credential` (containing the credential scope from Volume 1 — date, region, service), `X-Amz-Date`, `X-Amz-Expires`, and `X-Amz-Signature`. The first fetch returns your file. The second returns an XML error saying the request has expired.

**Why it's interesting:** a presigned URL is not a special S3 feature. It's **SigV4 from Volume 1 with the signature moved from a header into the query string**, plus an expiry. That's all. Anyone holding the URL has exactly the access it encodes, for exactly as long as it says — which is why presigned URLs should always have short expiries and should never be logged.

### 4. Try to make a bucket public and watch it refuse

```bash
cat > /tmp/public-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": "*",
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::$BUCKET/*"
  }]
}
EOF

aws s3api put-bucket-policy --bucket $BUCKET --policy file:///tmp/public-policy.json
```

**What to expect:** an `AccessDenied` error mentioning public access block, on a bucket you own, holding `AdministratorAccess`.

Check why:

```bash
aws s3api get-public-access-block --bucket $BUCKET
aws s3api get-bucket-ownership-controls --bucket $BUCKET
```

**Why it's interesting:** all four Block Public Access settings are `true` by default on new buckets, and Object Ownership is `BucketOwnerEnforced` — meaning ACLs are switched off entirely. This is the April 2023 default change, and it's the direct product response to the 2017 epidemic. Note that it's an override sitting *above* the permission systems, exactly the Volume 2 guardrail pattern: no amount of Allow defeats it.

**Do not disable this to "make the exercise work."** The point is that it stopped you.

### 5. Watch a CDN from the outside

```bash
echo "--- delegation chain ---"
dig +trace +nodnssec aws.amazon.com | tail -20

echo "--- first request (likely a miss) ---"
curl -sI https://aws.amazon.com/ | grep -i "x-cache\|x-amz-cf-pop\|via\|age"

echo "--- second request ---"
curl -sI https://aws.amazon.com/ | grep -i "x-cache\|x-amz-cf-pop\|age"
```

**What to expect:** `x-amz-cf-pop` containing an airport code for the edge location serving you (`LHR50`, `SIN2`, `IAD79`). `x-cache` showing `Hit from cloudfront` or `Miss from cloudfront`. An `age` header counting seconds since the object was cached.

**Why it's interesting:** the airport code tells you which physical city answered you, and it's almost certainly not where the origin is. That's the distance problem solved. Run the same command from a phone on cellular data versus home wifi and you may get different POPs — you're watching routing decide your edge.

**Cleanup:**

```bash
aws s3api delete-objects --bucket $BUCKET --delete "$(aws s3api list-object-versions \
  --bucket $BUCKET --query '{Objects: Versions[].{Key:Key,VersionId:VersionId}}' --output json)" 2>/dev/null

aws s3api delete-objects --bucket $BUCKET --delete "$(aws s3api list-object-versions \
  --bucket $BUCKET --query '{Objects: DeleteMarkers[].{Key:Key,VersionId:VersionId}}' --output json)" 2>/dev/null

aws s3 rb s3://$BUCKET --force
rm -f /tmp/summary.txt /tmp/doc.txt /tmp/public-policy.json
```

Note that emptying a versioned bucket requires deleting versions *and* delete markers explicitly — `aws s3 rm --recursive` alone won't do it. That inconvenience is exercise 2's lesson arriving as a chore.

---

## What You Should Now Be Able To Say

- Why a "folder rename" in S3 is a copy of every object
- The difference between durability and availability, and which one February 2017 was
- What S3Guard existed for and why it doesn't need to any more
- Why tiering a million small files to Glacier can cost more than leaving them
- Where invisible storage hides in a bucket
- Why `AuthenticatedUsers` was a catastrophic name for an ACL group
- Why an untested restart path is not a recovery plan
- Why a correct domain, a correct resolver, and correct DNS can still hand you an attacker's server
- Why your CloudFront certificate lives in `us-east-1` no matter where you are

---

## Where We Go Next

**Volume 6 — RDS and Aurora: Handing Someone Else Your Database.**

The decision to run a managed database is one of the most consequential architecture choices you'll make, and it's usually made casually. We'll cover what you actually give up, how Multi-AZ failover works mechanically and how it differs from read replicas (people conflate these constantly), parameter groups, automated backups and point-in-time recovery, and the snapshot restore process people discover for the first time during an emergency.

Then Aurora, which is genuinely novel rather than just managed — a storage layer that pushes redo log processing down into a distributed fleet and stops shipping full database pages across the network at all. AWS published a SIGMOD paper explaining why the classic architecture was wasteful, and it's one of the clearest pieces of systems writing in the field.

The incident is quieter than the ones in this volume: failovers that were configured and never drilled.

---

*Volume 5 complete. Say **continue** when you're ready for Volume 6.*
