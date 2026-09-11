---
id: prologue
title: Volume 0 — The Bookstore That Became the Internet's Landlord
order: 0
description: How a 2003 internal memo about fixing Amazon's own broken infrastructure accidentally created the cloud — and what you're about to learn that most AWS users never do.
draft: false
---

# Mastering AWS: The Engineering, The History, The Incidents

## Volume 0 — The Bookstore That Became the Internet's Landlord

---

## A Question Before We Start

Here's something worth sitting with for a moment.

In 2006, if you wanted to launch a web application, you bought a server. A physical one. You waited six to twelve weeks for it to arrive, you drove it to a data center or a closet, you racked it, you cabled it, you installed an operating system, and somewhere in month four you finally served your first HTTP request. If your app got popular, you repeated this process — with another six-to-twelve-week lead time, which meant your success was capped by a purchasing department.

Today you can type one command and have a running computer in another country in about forty seconds, and it costs less than a cup of coffee per day.

The obvious question is *how*. The more interesting question — the one this guide is actually about — is **why that machine behaves the way it does**. Why does it lose its disk when you stop it? Why does it have a strange link-local IP address baked in at `169.254.169.254` that will happily hand out credentials to anyone who asks? Why is one specific region in Northern Virginia quietly load-bearing for a shocking fraction of the internet?

None of these are arbitrary. Every one of them is a scar. Something happened, someone made a decision, and you inherited the consequence.

---

## The Surprising Fact

**AWS was built in Cape Town, South Africa.**

Not Seattle. Not Virginia. The team that built EC2 — the service that arguably started the cloud computing industry — was assembled in Cape Town, because the engineer leading it, Chris Pinkham, wanted to move back to South Africa and Amazon decided that keeping him was worth opening an office there. Pinkham and Chris Brown set up a small development office and built the first version of Elastic Compute Cloud roughly 10,000 miles from Amazon's headquarters.

There's a second surprise hiding in the name itself. "Amazon Web Services" is older than cloud computing. Amazon launched something called Amazon.com Web Services in **July 2002** — an API that let third-party developers pull product catalog data into their own sites. It had nothing to do with renting computers. When the infrastructure business arrived years later, it borrowed a brand name that already existed for a completely different product.

*Accuracy note: the July 2002 launch date and the Cape Town development office are both well documented in Amazon's own materials and in Pinkham's and Benjamin Black's public accounts. Where I give more granular dates later in this guide, I'll tell you when I'm less certain.*

---

## The Origin Story, Told Honestly

You have probably heard this version:

> Amazon had tons of spare server capacity sitting idle eleven months a year, because they had to build for the Christmas shopping peak. So they decided to rent out the excess. Genius!

It's a great story. It is also, according to the people who were actually there, **not true**.

Benjamin Black — one of the two authors of the internal document that led to AWS — has publicly said the excess-capacity explanation is a myth. Werner Vogels, Amazon's longtime CTO, has said the same thing repeatedly. The real story is less romantic and considerably more interesting to an engineer.

### The actual problem: Amazon couldn't ship software

By the early 2000s, Amazon.com had a growth problem that wasn't about servers at all. It was about *coupling*. Every new project needed infrastructure, and getting infrastructure meant negotiating with the teams who owned databases, storage, and compute. Engineering teams spent an enormous share of their time on undifferentiated plumbing — the same plumbing, over and over, slightly differently each time.

Amazon's internal response was architectural: break the monolith into services with hard API boundaries. If every team could only talk to every other team through a documented interface, teams could move independently. This is the origin of the famous (and possibly somewhat mythologized) "API mandate" attributed to Jeff Bezos.

But services need somewhere to run. And so, in **2003**, Benjamin Black and Chris Pinkham wrote a short internal paper describing what a standardized, automated, self-service infrastructure layer for Amazon would look like — compute and storage that any internal team could provision without filing a ticket with anyone.

The paper ended with a line that changed the industry. Roughly: *we could sell this as a service to external customers too.*

That was the idea. Not selling leftovers. **Building the plumbing properly for internal use, and realizing the plumbing itself was the product.**

### What shipped, and in what order

The order matters, because it's the opposite of what most people assume.

| Year | What arrived | Why it's surprising |
|---|---|---|
| 2002 | Amazon.com Web Services (product data API) | Same name, unrelated product |
| 2004 | Simple Queue Service (SQS), in beta | The first piece of infrastructure-as-a-service AWS shipped |
| March 2006 | Simple Storage Service (S3) | **Storage came before compute** |
| August 2006 | Elastic Compute Cloud (EC2), in beta | The one everyone remembers |

Storage launched first. That ordering is a clue about how AWS thinks, and we'll come back to it in Volume 5.

### What EC2 actually was on day one

It's worth being concrete about how primitive the first version was, because almost every service you'll learn in this guide exists to patch a gap that was present at launch:

- **One instance type.** The `m1.small`: roughly 1.7 GB of RAM, one "EC2 Compute Unit," and about 160 GB of local disk, for around ten cents an hour.
- **Linux only.** No Windows.
- **One location.** No concept of Regions or Availability Zones yet — those arrived later, as the failure modes became obvious.
- **No persistent storage.** If your instance stopped, your data was gone. Permanently. EBS came in 2008.
- **No load balancer.** No auto scaling. No managed database. No IAM. No VPC.

Read that list again and notice what it tells you: **AWS did not launch as a cloud platform. It launched as a rentable computer, and everything else on the list is a response to someone getting hurt.**

No persistent storage → EBS. No network isolation → VPC. No identity model → IAM. No way to survive a data center fire → Availability Zones. No way to handle traffic spikes → ELB and Auto Scaling.

That's the shape of this entire guide. Each volume takes one of those responses and asks: what exactly went wrong, what did they build, and what did it cost?

---

## Why This Guide Leads With Incidents

Most AWS material teaches you which buttons to press. That knowledge has a half-life of about eighteen months, because the buttons move.

The reasoning doesn't move. And the fastest route to the reasoning is through the failures, because AWS is unusually transparent about them — the company publishes detailed public postmortems, and the security research community has documented its breaches in forensic detail. That's a rare gift for a learner. You can read the actual account of the day a single mistyped command took down a large chunk of the web, and then go look at the feature they shipped afterward to make it impossible.

A few of the incidents waiting for you in later volumes:

- **April 2011.** A routine network change triggered a feedback loop in EBS where storage volumes frantically tried to re-replicate themselves, consuming the very capacity they needed to recover. Reddit, Quora, and Foursquare went dark. Netflix didn't. Volume 4 and Volume 8 explain why.
- **Christmas Eve 2012.** An operational process deleted state data belonging to the production load balancing service. Netflix went down on one of the highest-traffic nights of the year. Volume 4.
- **February 2017.** An engineer debugging the S3 billing system ran a command with a typo in one parameter. It removed far more capacity than intended, and S3 in us-east-1 stopped serving requests. A large portion of the internet went with it — including, memorably, status dashboards that were themselves hosted on S3 and therefore couldn't report the outage. Volume 5.
- **2019.** An attacker reached a misconfigured resource at Capital One, used a server-side request forgery to reach that odd `169.254.169.254` address, obtained temporary credentials, and exfiltrated data on roughly a hundred million people. The direct product consequence was IMDSv2. Volume 2.
- **April 2018.** Attackers hijacked BGP routes to hijack DNS — redirecting Route 53 answers for a cryptocurrency site to a server they controlled, and draining wallets. Volume 5.
- **December 2021.** A problem inside AWS's own internal network took down the control plane in us-east-1. Not the servers — the *ability to manage* the servers. Including, for many customers, the ability to fail over away from us-east-1. Volume 1.

Each of these is a lesson that no tutorial can substitute for.

---

## What You're About to Understand That Most AWS Users Never Do

This is the teaser list. If you finish this guide, these will all be obvious to you, and they are not obvious to the median person with an AWS certification.

1. **Why the console is a lie.** Every click is an HTTPS request signed with an algorithm called SigV4, and once you see that, the CLI, the SDKs, Terraform, and the console all collapse into the same thing. *(Volume 1)*
2. **The difference between the control plane and the data plane** — and why that single distinction predicts what will survive the next AWS outage and what won't. *(Volume 1)*
3. **The actual order IAM evaluates a policy in**, including the part where an explicit Deny anywhere in the chain wins regardless of how many Allows you stacked up. *(Volume 2)*
4. **What envelope encryption really is**, and why KMS never actually encrypts your data — it encrypts a key that encrypts your data, and the difference is the whole product. *(Volume 2)*
5. **Why a security group and a network ACL are not two versions of the same thing.** One is stateful, one isn't, and that single word explains a category of outage that people burn entire afternoons on. *(Volume 3)*
6. **Why AWS designed and manufactures its own hardware.** The Nitro system moved virtualization off the CPU and onto dedicated cards, which is why a modern instance gives you nearly bare-metal performance. *(Volume 4)*
7. **Why your `t`-family instance mysteriously slows to a crawl** after running fine for hours — CPU credits, and the same burst-credit logic hiding inside certain EBS volume types. *(Volume 4)*
8. **That S3 has no folders.** None. The flat keyspace and the "directories" the console draws for you are a UI fiction, and knowing this changes how you think about listing, permissions, and performance. *(Volume 5)*
9. **What actually causes a Lambda cold start**, why Firecracker microVMs made them dramatically cheaper for AWS, and why some cold starts are one hundred times worse than others. *(Volume 7)*
10. **Which parts of "AWS containers" are actually AWS.** ECS is Amazon's own scheduler; Kubernetes belongs to the CNCF and EKS is AWS operating it for you. Marketing blurs this constantly; your architecture decisions shouldn't. *(Volume 7)*
11. **Why your bill is mostly data transfer.** Compute is easy to reason about. The money is in bytes crossing boundaries — between AZs, out to the internet, through a NAT Gateway — and almost nobody is taught to see those boundaries. *(Volume 9)*
12. **Why "Multi-AZ" and "highly available" are not synonyms**, and how to actually price the difference between surviving a rack failure and surviving a region failure. *(Volume 8)*

---

## What This Guide Is Not

Being precise about boundaries, as promised:

- **This is not a certification cram course.** There's overlap, and Volume 10 gives you an honest read on whether certifications are worth your time. But optimizing for an exam and optimizing for competence are different objectives, and I'm aiming at the second one.
- **This is not multi-cloud.** Azure and GCP solve similar problems with different primitives. Learning one deeply first is the correct strategy, and you've already made that call.
- **AWS is not "the cloud."** It's the largest implementation of a set of ideas. Where a concept is genuinely universal (network isolation, identity federation, object storage) versus genuinely AWS-specific (the IAM policy language, Nitro, Aurora's storage layer), I'll say which.
- **Terraform and Kubernetes are not AWS.** They're third-party tools most AWS teams use. They get covered — clearly labelled as what they are.

---

## What You Need Before Volume 1

Nothing yet. Volume 0 is the only volume you can read on a train with no laptop.

Volume 1 will walk you through, from zero: creating an AWS account, immediately locking the root user behind MFA, setting a billing alarm before you do literally anything else, creating a non-root admin identity, and installing the AWS CLI. If you already have an account, you'll do the hardening steps anyway, because a startling number of long-time AWS users have never done them.

**On money:** the vast majority of exercises in this guide fit inside the AWS Free Tier. A handful — NAT Gateway, the EKS control plane, RDS Multi-AZ — cost real money by the hour and cannot be made free. I will flag those loudly every single time, tell you the approximate hourly cost, and always give you the teardown command. Nothing in this guide will ever surprise you with a bill.

---

## TRY THIS ON YOUR MACHINE

These five need **no AWS account** and cost nothing. They're all read-only lookups against public endpoints. You need a terminal with `curl` and `dig` (on most Linux and macOS systems both are present; on Debian/Ubuntu, `dig` comes from `sudo apt install dnsutils`).

### 1. Watch AWS tell you the truth in an error message

```bash
curl -i https://s3.amazonaws.com/
```

**What to expect:** an HTTP error response with an XML body, plus response headers including `x-amz-request-id` and `x-amz-id-2`.

**Why it's interesting:** you just made an unauthenticated call to the same API the console uses. The refusal is proof of the model — every S3 operation is an HTTP request, and the identifiers in those headers are exactly what AWS support asks for when you file a ticket about a failed request. There's no magic layer; there's just this.

**Cleanup:** none.

### 2. Download the map of AWS's entire public network

```bash
curl -s https://ip-ranges.amazonaws.com/ip-ranges.json -o /tmp/aws-ip-ranges.json
wc -c /tmp/aws-ip-ranges.json
grep -o '"region": "[^"]*"' /tmp/aws-ip-ranges.json | sort -u | head -40
```

**What to expect:** a JSON file of a few megabytes, then a list of region codes — `us-east-1`, `eu-west-1`, `ap-southeast-2`, and dozens more.

**Why it's interesting:** AWS publishes every IP range it owns, tagged by region and by service. This file is how firewalls the world over are configured. It's also your first encounter with region codes as the organizing coordinate of everything in AWS — and if you count them, you get a rough sense of the physical footprint behind the abstraction.

**Cleanup:**
```bash
rm /tmp/aws-ip-ranges.json
```

### 3. Find the services hiding inside that file

```bash
grep -o '"service": "[^"]*"' /tmp/aws-ip-ranges.json | sort | uniq -c | sort -rn | head -20
```

*(Run exercise 2 first.)*

**What to expect:** a count of IP prefixes per service — `AMAZON`, `EC2`, `S3`, `CLOUDFRONT`, `ROUTE53_HEALTHCHECKS`, and others.

**Why it's interesting:** the relative counts are a rough proxy for architectural weight. `CLOUDFRONT` having its own enormous allocation separate from `EC2` is your first hint that edge infrastructure is a physically different thing from compute — the subject of Volume 5.

**Cleanup:** none beyond exercise 2's.

### 4. Trace a Route 53 answer back to its source

```bash
dig +trace amazon.com
```

**What to expect:** a multi-stage walk down the DNS hierarchy — root servers, then `.com` servers, then the authoritative nameservers for the domain.

**Why it's interesting:** you're watching the delegation chain that the April 2018 BGP hijack exploited. Attackers didn't break DNS cryptography; they convinced the internet's routing layer to send queries somewhere else. Seeing the hops makes the attack surface visible in a way no diagram does.

**Cleanup:** none.

### 5. Measure the edge

```bash
curl -s -o /dev/null -w "connect: %{time_connect}s  total: %{time_total}s\n" https://aws.amazon.com/
curl -s -o /dev/null -w "connect: %{time_connect}s  total: %{time_total}s\n" https://s3.us-east-1.amazonaws.com/
curl -s -o /dev/null -w "connect: %{time_connect}s  total: %{time_total}s\n" https://s3.ap-southeast-2.amazonaws.com/
```

**What to expect:** the first is usually fast from almost anywhere on earth. The other two will differ from each other — sometimes dramatically — depending on where you physically are.

**Why it's interesting:** the first URL is served from a CDN edge location near you; the other two are regional API endpoints in Virginia and Sydney respectively. You are directly measuring the difference between "AWS has a cache near you" and "your packet crossed an ocean." That gap is the entire economic argument for CloudFront, and it's also why choosing a region isn't a cosmetic decision.

**Cleanup:** none.

---

## Where We Go Next

**Volume 1 — What AWS Actually Is: Accounts, Regions, and the API Underneath Everything.**

We'll set up your account properly (root user lockdown, MFA, budget alarm, admin identity, CLI), then pull apart the abstraction: what a Region really is, what an Availability Zone really is, why an edge location is neither, and the single most useful mental model in all of AWS — the split between the control plane and the data plane.

Then we'll look hard at December 2021, when that split stopped being theoretical for a great many companies at once.

---

*Volume 0 complete. Say **continue** when you're ready for Volume 1.*
