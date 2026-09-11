---
id: control-plane
title: "Volume 1 — What AWS Actually Is: Accounts, Regions, and the API Underneath Everything"
order: 1
description: Set up an AWS account safely, then dismantle the abstraction — what a Region really is, how every request is signed, and why the control plane / data plane split predicts every outage you'll ever live through.
draft: false
---

# Mastering AWS: The Engineering, The History, The Incidents

## Volume 1 — What AWS Actually Is: Accounts, Regions, and the API Underneath Everything

---

## The Question This Volume Answers

Open the AWS console. Click around. Launch something.

Now: **what did you actually just do?**

Not metaphorically. Mechanically. Did the browser talk to a server? Which one? In what format? How did it prove you were allowed to? And when AWS has a bad day — which it does — what exactly breaks, and what keeps running anyway?

Most people never ask. They learn the console as a set of gestures, the way you learn a videogame's controls. Then one day something fails in a way the gestures don't cover, and they have no model to reason with.

This volume gives you the model. There are three ideas in it, and all three will pay rent for the rest of your career:

1. **AWS is an API.** The console, the CLI, the SDKs, and Terraform are four clients for the same thing.
2. **Geography is a first-class concept**, and Region, Availability Zone, and edge location are three genuinely different things that people constantly conflate.
3. **Every service is split into a control plane and a data plane**, and knowing which is which tells you, in advance, what survives an outage.

We'll close with December 7, 2021, when a lot of companies learned idea #3 the expensive way.

---

## Setup: Getting an Account Without Getting Hurt

**Skip to the next section if you already have an account — but read the hardening steps anyway.** A genuinely large fraction of long-time AWS users have never done all of them.

### Step 1 — Create the account

Go to `https://aws.amazon.com/` and sign up. You will need:

- An email address not already tied to an AWS account
- A credit or debit card (AWS places a small temporary authorization charge, typically around one US dollar, and reverses it)
- A phone number for verification

Pick the **Basic Support** plan. It's free. The paid support tiers are excellent and you do not need one to learn.

### Step 2 — Understand what you just created

The email and password you signed up with are the **root user**. This is not "the admin account." It is something more dangerous: an identity that cannot be restricted. You can't attach a policy to it that limits it. Certain operations — closing the account, changing the support plan, restoring a badly broken IAM setup — can *only* be done by root.

The correct posture toward the root user is: lock it in a drawer and never use it again.

### Step 3 — Put MFA on root, right now

In the console, click your account name (top right) → **Security credentials** → **Multi-factor authentication (MFA)** → **Assign MFA device**.

Use an authenticator app on your phone, or a hardware key if you have one. Save the recovery codes somewhere that isn't your laptop.

**Why this matters more than anything else in this volume:** a compromised root user means a compromised account, full stop. There is no containment story. The attacker owns everything, including the ability to lock you out of your own billing.

### Step 4 — Set a budget alarm *before* you build anything

This is out of order compared to most tutorials, and deliberately so.

Console → search **Billing and Cost Management** → **Budgets** → **Create budget** → **Use a template** → **Monthly cost budget**. Set an amount you'd be annoyed but not ruined by. If you're learning, something like 10 USD is a reasonable trigger. Enter your email.

Then, in **Billing and Cost Management → Billing preferences**, turn on the alert for free tier usage.

The first two budgets are free. Do this now. Volume 9 explains the billing model properly; for today you just want a smoke detector.

### Step 5 — Stop using root: create an admin identity

You need a day-to-day identity that isn't root. There are two routes, and it's worth being honest about the trade-off.

**Route A — IAM Identity Center (what AWS recommends).** This is AWS's identity service for human users, with short-lived credentials and single sign-on. It's the right answer for any real organization, and it's what you'll see in production. It's also more setup than a solo learner needs on day one.

**Route B — a plain IAM user with MFA.** Simpler, adequate for a personal learning account, and the mechanics are more visible — which is useful precisely because you're here to see mechanics.

We'll use Route B for this guide, and Volume 2 will cover Identity Center properly once you understand what it's abstracting over. If you already know Identity Center, use it.

Console → **IAM** → **Users** → **Create user**:

- Username: something like `admin-you`
- Tick **Provide user access to the AWS Management Console**
- Set a custom password, untick the "must create a new password" box if you like
- **Permissions** → Attach policies directly → `AdministratorAccess`
- Create the user, then open it → **Security credentials** → assign an MFA device to *this* user too

Note the account-specific sign-in URL IAM gives you. Sign out of root. Sign back in as the new user. From here on, that's who you are.

*(`AdministratorAccess` is a blunt instrument and Volume 2 will make you slightly uncomfortable about it. For a sandbox account with a budget alarm, it's an acceptable starting point.)*

### Step 6 — Install the AWS CLI

**macOS (Homebrew):**
```bash
brew install awscli
```

**Linux (x86_64):**
```bash
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install
```

**Windows:** download and run the MSI installer from the AWS CLI documentation page, or use `winget install Amazon.AWSCLI`.

Verify:
```bash
aws --version
```

You want version 2.x. If you get a 1.x version from an old system package, uninstall it and use the installer above — v1 is in maintenance mode.

### Step 7 — Give the CLI credentials

Back in the console: **IAM → Users → your user → Security credentials → Create access key**. Choose **Command Line Interface (CLI)**, acknowledge the warning, and create it.

You get an **Access Key ID** and a **Secret Access Key**. The secret is shown exactly once. Then:

```bash
aws configure
```

Paste the key ID, paste the secret, set default region to `us-east-1`, and set output format to `json`.

Now the important part:

```bash
aws sts get-caller-identity
```

**You should get back JSON containing a `UserId`, your 12-digit `Account` number, and an `Arn` ending in your username.** That's the "who am I" call. It's the first command to run whenever anything AWS-related is confusing.

### A warning about that key you just made

Long-lived access keys are the single most leaked secret on the internet. They end up in Git repos, in Docker images, in screenshots, in Stack Overflow questions. There is an entire criminal economy built on scraping GitHub for them within seconds of a push.

Rules for this guide:

- Never commit `~/.aws/credentials` to anything
- Never paste a secret key into a chat, a ticket, or a code block
- If you ever suspect exposure: IAM → your user → deactivate and delete that key immediately, then create a new one

Volume 2 will show you why roles with temporary credentials are the real answer, and why the key you just created is a compromise we're making for teaching convenience.

---

## THE PROBLEM: Nobody Can See What They're Actually Doing

Here's the situation AWS faced, and it's a design problem, not a technical one.

You're building a system where thousands of companies provision infrastructure programmatically, across dozens of physical locations, with wildly different trust levels, over the public internet. Every request has to answer three questions:

1. **Who is asking?**
2. **Where should this happen?**
3. **Did this message get tampered with in flight?**

And it has to answer them without a session — without the server holding state about you between requests — because state means the authentication layer becomes a bottleneck and a single point of failure at planetary scale.

The abstraction AWS chose was: **everything is a stateless, individually authenticated HTTP request to a regional endpoint.** Every single thing. There is no "AWS protocol." There's HTTPS, a request signing scheme, and a very large number of endpoints.

The console is not an exception to this. The console is a web app that makes those same calls on your behalf.

---

## THE MECHANISM, PART 1: How a Request Gets Signed

The signing scheme is called **Signature Version 4**, universally shortened to SigV4. It's worth understanding in outline, because once you've seen it, several otherwise-baffling AWS behaviors become obvious.

### The steps

**1. Build a canonical request.** The client takes the HTTP method, the URI path, the query string, the headers it intends to sign, and a hash of the body, and assembles them into a strictly-defined normalized string. "Canonical" means every client must produce byte-identical output for the same logical request — same sort order, same encoding, same whitespace handling.

**2. Build a string to sign.** A hash of that canonical request, combined with a timestamp and a **credential scope**. The scope is where this gets interesting. It looks like:

```text
20260911/us-east-1/ec2/aws4_request
```

Date, region, service, terminator.

**3. Derive a signing key.** Here's the clever bit. The client does *not* sign with your secret access key. It runs a chain of HMAC operations:

```text
kDate    = HMAC("AWS4" + secretAccessKey, date)
kRegion  = HMAC(kDate, region)
kService = HMAC(kRegion, service)
kSigning = HMAC(kService, "aws4_request")
```

**4. Sign.** HMAC the string-to-sign with `kSigning`. Attach the result, plus your access key ID and the scope, in an `Authorization` header.

### Why the derived key design matters

Look again at that HMAC chain. The date, the region, and the service name are baked *into the key itself*.

This means a signed request for S3 in `eu-west-1` is cryptographically useless against EC2 in `us-east-1`. Not "rejected by a policy check" — mathematically unable to produce a valid signature. The scope isn't a claim the server has to verify; it's a property of the key.

It also means signatures expire. The date is in the chain, and AWS additionally rejects requests whose timestamp is too far from its own clock — typically a skew window of a few minutes.

Which produces one of the great AWS debugging experiences: **your requests suddenly all fail with signature errors, and the cause is that your machine's clock is wrong.** If you ever see `SignatureDoesNotMatch` or `RequestTimeTooSkewed` and your credentials are definitely fine, check `date`.

### What this buys you conceptually

Once you internalize "everything is a signed HTTP request," a lot of things unify:

- The console, the CLI, boto3, the Java SDK, Terraform, and your application code are all doing the same thing.
- Anything you can do in the console, you can automate — because the console has no private API.
- A presigned S3 URL (Volume 5) stops being magic: it's a signature moved from a header into the query string, with an expiry.
- IAM policies (Volume 2) make sense as the layer that runs *after* the signature verifies identity and decides what that identity may do.

---

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

## THE MECHANISM, PART 3: Control Plane vs. Data Plane

This is the single most useful mental model in AWS, and almost nobody teaches it early.

Every AWS service is really two systems wearing one name.

### The definitions

**The control plane** is the machinery that *manages* resources. Creating, configuring, describing, deleting. `RunInstances`. `CreateBucket`. `ModifyDBInstance`. It handles a relatively low volume of complex, stateful, coordinated operations.

**The data plane** is the machinery that *does the work* the resource exists for. An EC2 instance executing your code. S3 serving a GET. A load balancer forwarding a packet. Route 53 answering a DNS query. High volume, simple operations, ruthlessly optimized.

### Why AWS separates them

Because they have opposite requirements.

The control plane must be strongly consistent and correct — you cannot have two conflicting truths about whether an instance exists. That demands coordination, and coordination is fragile and slow.

The data plane must be fast and must never stop. So AWS deliberately builds data planes with fewer dependencies, simpler logic, and — crucially — **the ability to keep operating on their last known configuration when the control plane is unavailable.**

AWS has a name for this property: **static stability**. A statically stable system keeps working during a dependency failure because it doesn't need that dependency to maintain its current state. It only needs it to *change* state.

### The prediction this lets you make

Here is the payoff. When AWS has a bad day, you can predict the damage:

| What's happening | Control plane | Data plane |
|---|---|---|
| Your running EC2 instances | Can't launch new ones | Existing ones keep running |
| Your Auto Scaling Group | Can't scale out | Current instances keep serving |
| Your load balancer | Can't create or reconfigure | Keeps forwarding traffic |
| Your S3 bucket | Can't create new buckets | GET and PUT usually still work |
| Your DNS | Can't change records | Route 53 keeps answering queries |

The pattern: **outages usually break your ability to change things, not your ability to run things.**

Which means the worst possible moment to *need* to change something is during an outage. And your automated recovery — the Auto Scaling Group that replaces a dead instance, the failover that spins up capacity in another Region — depends on the control plane. This is why the phrase "we'll just fail over" so often fails to survive contact with reality, and it's the core argument of Volume 8.

### The us-east-1 problem

Now combine two facts from earlier.

Fact one: some services are **global** — IAM, Route 53, CloudFront, and others.

Fact two: those global services need a control plane somewhere, and for historical reasons, **that somewhere is largely us-east-1.** IAM writes, Route 53 record changes, CloudFront distribution changes — the management operations for global services are concentrated in Northern Virginia.

The data planes of these services are globally distributed and extremely resilient. Route 53's data plane is designed to an exceptionally high availability target. IAM authentication decisions are replicated worldwide.

But the *control* planes are not.

This is why "us-east-1 is having problems" is a global headline rather than a regional one. It's also why us-east-1 is the default in most tooling, the Region with the most services, the cheapest Region, and consequently the most heavily loaded — a gravitational well that pulls in far more of the internet than any single Region should carry.

---

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

## TRY THIS ON YOUR MACHINE

All five are free-tier safe and read-only except where noted. You need the CLI configured from the Setup section.

### 1. Watch the CLI sign a request in front of you

```bash
aws sts get-caller-identity --debug 2>&1 | grep -i -A2 "Signature\|CanonicalRequest\|StringToSign" | head -40
```

**What to expect:** debug output showing the canonical request, the string to sign, and the resulting signature — the exact structures described earlier in this volume.

**Why it's interesting:** you're watching SigV4 happen. Look for the credential scope line containing the date, region, and service. That string is the reason your signature can't be replayed against a different Region.

**Cleanup:** none.

### 2. Prove the AZ name shuffle is real

```bash
aws ec2 describe-availability-zones --region us-east-1 \
  --query "AvailabilityZones[].{Name:ZoneName,Id:ZoneId,State:State}" \
  --output table
```

**What to expect:** a table mapping names like `us-east-1a` to IDs like `use1-az4`.

**Why it's interesting:** the mapping in *your* account is almost certainly different from anyone else's. This is the randomization described earlier, made visible. If you ever share an AZ reference with another account — a shared VPC, a partner integration — the name is meaningless and the ID is what counts.

**Cleanup:** none.

### 3. Measure the size of AWS, then measure how far away it is

```bash
aws ec2 describe-regions --all-regions \
  --query "Regions[].{Region:RegionName,Status:OptInStatus}" --output table
```

Then pick three and time them:

```bash
for r in us-east-1 eu-west-1 ap-southeast-2; do
  echo -n "$r: "
  /usr/bin/time -f "%e s" aws ec2 describe-regions --region $r > /dev/null
done
```

*(On macOS, `/usr/bin/time -f` isn't supported — use `time aws ec2 describe-regions --region $r > /dev/null` instead, run one at a time.)*

**What to expect:** a full list of Regions including ones your account hasn't opted into, then noticeably different round-trip times.

**Why it's interesting:** you're measuring the speed of light plus routing, per Region. That number is the floor on latency for anything you deploy there, and no amount of optimization gets under it. It's also why "just use us-east-1 because it's cheapest" is a real trade-off, not a free lunch.

**Cleanup:** none.

### 4. Break a signature on purpose

```bash
aws ec2 describe-regions --region us-east-1
AWS_SECRET_ACCESS_KEY="deliberatelywrongsecretvalue" aws ec2 describe-regions --region us-east-1
```

**What to expect:** the first succeeds. The second fails with `AuthFailure` or a signature-related error — and note it fails at the *signature* stage, not at a permissions stage.

**Why it's interesting:** it separates the two layers in your head. Authentication (is this signature valid?) happens before authorization (is this identity allowed?). Volume 2 lives entirely in the second layer, and mixing them up is the source of endless confused debugging.

**Cleanup:** none — the environment variable only applied to that one command.

### 5. Find something global and something regional

```bash
aws iam list-account-aliases --region ap-southeast-2
aws s3api list-buckets --query "Buckets[].Name" --output table
```

**What to expect:** the IAM call works regardless of what Region you name. The bucket list returns all your buckets across all Regions (you may have none yet — that's fine).

**Why it's interesting:** IAM is global, so the Region argument is essentially ignored — and behind the scenes, the write path for IAM is concentrated in us-east-1 regardless of where you are. S3's bucket namespace is global while the buckets themselves are regional. These inconsistencies are historical accidents, not design elegance, and knowing which services are which saves you real time.

**Cleanup:** none.

### Optional, costs nothing, takes two minutes: verify your budget alarm exists

```bash
aws budgets describe-budgets --account-id $(aws sts get-caller-identity --query Account --output text)
```

You should see the budget from Step 4 of setup. If you get an empty list, go back and create it. Seriously.

---

## What You Should Now Be Able To Say

Check yourself against these. If any feels shaky, reread the relevant section rather than pushing on.

- Why the console is not a privileged interface, and what that implies about automation
- What's inside a credential scope, and why a signature can't cross Regions
- The difference between an AZ name and an AZ ID, and when each matters
- Why an edge location is not a small Region
- Given "service X is down in us-east-1," a reasonable first guess at what still works
- Why "we'll fail over to another Region" is a claim that needs testing, not assuming

---

## Where We Go Next

**Volume 2 — Identity and Secrets: IAM, STS, KMS, Secrets Manager.**

This is the big one, and it's the volume most people get wrong. We'll build up from principals and policies to the actual evaluation algorithm AWS runs on every single request — including the part where an explicit Deny beats every Allow you've ever written. Then roles, trust policies, STS and temporary credentials, and why the access key sitting in your `~/.aws/credentials` right now is a compromise rather than a best practice.

Second half: envelope encryption from first principles. Why KMS doesn't encrypt your data, what it actually encrypts, the difference between a key policy and an IAM policy, and where Secrets Manager fits.

Two incidents anchor it: **Capital One in 2019**, where a server-side request forgery reached that `169.254.169.254` address and turned into a hundred-million-record breach — and the crypto-mining economy built entirely on access keys people pushed to GitHub by accident.

It's a long one. I'll ask you before we start whether you want it split into chapters.

---

*Volume 1 complete. Say **continue** when you're ready for Volume 2.*
