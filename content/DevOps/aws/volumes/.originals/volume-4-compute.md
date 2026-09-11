---
id: compute
title: "Volume 4 — Compute: EC2, EBS, Load Balancing, Auto Scaling"
order: 4
description: From Xen to Nitro and why AWS built its own silicon, EBS and the burst credits that throttle you, then load balancers and the lag built into every scaling decision — anchored on the 2011 EBS storm and the Christmas Eve 2012 ELB outage.
draft: false
---

# Mastering AWS: The Engineering, The History, The Incidents

## Volume 4 — Compute: EC2, EBS, Load Balancing, Auto Scaling

---

## The Question This Volume Answers

You run one command and forty seconds later you have a computer in Virginia.

**Whose computer is it?** It's a slice of a physical machine you'll never see, shared with strangers, with a disk that isn't a disk and a network card that isn't a network card. And yet it performs, in many cases, within a few percent of bare metal.

That last part was not true ten years ago, and the story of how it became true is the story of AWS deciding that renting other people's hardware wasn't good enough — and buying a chip company.

Four things to take from this volume:

1. **Virtualization has a tax**, AWS spent a decade engineering it away, and the result is why a modern instance behaves the way it does.
2. **Your disk is on the network.** Almost everything surprising about EBS follows from that one fact.
3. **Bursting is a lie you can run out of.** Both EC2 and EBS have credit mechanisms that make a thing fast until suddenly it isn't.
4. **Scaling always lags demand**, structurally, and no configuration removes the lag — you can only account for it.

---

## Part One: The Machine

## THE PROBLEM: The Hypervisor Was Eating the Server

Start with what virtualization actually costs.

To run multiple isolated guests on one physical host, something must sit between them and the hardware. When a guest wants to send a network packet, it can't just talk to the network card — the card is shared. When it writes to disk, the write has to be intercepted, translated, and routed to real storage.

Classically, that "something" is a hypervisor running on the host's own CPUs, consuming the host's own memory and the host's own I/O bandwidth. EC2 used **Xen** for its first decade.

The consequences were real and measurable:

- **You couldn't sell the whole machine.** A meaningful slice of CPU and RAM was reserved for the hypervisor and the management domain. A customer could never get 100% of a host.
- **I/O went through software.** Every packet and every block write took a detour through the hypervisor, adding latency and consuming CPU that customers were paying for.
- **Performance was noisy.** "Noisy neighbours" — a busy co-tenant driving hypervisor work — showed up as variance in *your* latency.
- **The trusted computing base was enormous.** A full hypervisor plus a management operating system is a lot of code with total authority over every guest. Every line of it is attack surface.
- **Updates meant reboots.** Patching the hypervisor meant scheduled customer downtime, at fleet scale.

For a business selling compute by the hour, every one of these is money or risk.

---

## THE MECHANISM: Nitro, and Why AWS Bought a Chip Company

In 2015, AWS acquired **Annapurna Labs**, an Israeli semiconductor company. At the time it looked like a curiosity. It turned out to be one of the most consequential infrastructure decisions of the last decade.

In November 2017, alongside the C5 instance family, AWS announced the **Nitro System**. The idea is simple to state and hard to build: **take everything the hypervisor was doing and move it off the main CPU onto dedicated hardware.**

### The three pieces

**Nitro cards.** Purpose-built PCIe devices that handle VPC networking, EBS storage, local NVMe storage, and instance monitoring. When your instance sends a packet, the VPC encapsulation from Volume 3 — the software-defined networking that makes your private network exist — happens *on a card*, not on a CPU you're paying for.

**The Nitro security chip.** Sits between the main board and every I/O path, and controls access to firmware and non-volatile storage. Firmware can only be updated through this chip. This closes off a nasty class of persistent attack: malware that survives instance termination by writing itself into a device's firmware.

**The Nitro hypervisor.** A minimal KVM-based hypervisor whose job has shrunk to almost nothing — memory and CPU allocation. It doesn't handle I/O, because the cards do. It's small enough that AWS describes it as providing performance essentially indistinguishable from bare metal.

### What this bought

- **Nearly all host resources go to the guest.** The offload work happens on hardware AWS doesn't have to sell.
- **Bare-metal instances became possible.** If virtualization is all in the cards, you can just... not run a hypervisor, and hand a customer the whole machine — which still gets VPC networking and EBS, because those are card functions.
- **Consistent performance.** Less software in the I/O path means less variance.
- **A far smaller trusted computing base.** Less privileged code, less attack surface.
- **Updates without customer downtime** in many cases, because the thing being updated isn't the thing running your workload.

### And then they built the CPUs too

Annapurna's other output was **Graviton** — AWS's own ARM-based server processors. Graviton (2018) was a limited first attempt; **Graviton2** (2019) was the one that mattered, delivering competitive performance at meaningfully better price-performance; Graviton3 and Graviton4 followed.

The strategic logic is worth noticing. AWS's largest input cost is hardware it buys from other companies. Designing its own processors — tuned for exactly the workloads it runs, with no features it doesn't need — attacks that cost directly.

For you, practically: **`m7g` is Graviton, `m7i` is Intel, `m7a` is AMD.** Graviton is typically cheaper for equivalent work. The catch is architecture: your binaries and container images must be built for ARM. For interpreted languages and anything you compile yourself, it's often a one-line change. For vendor binaries, it may be impossible.

*Accuracy note: the 2015 Annapurna acquisition and the 2017 Nitro/C5 announcement are firm. Graviton generation dates I'd treat as approximately right — verify against AWS's own pages if precision matters.*

---

## THE MECHANISM: Reading an Instance Name

Instance types look like line noise until you learn the grammar. `c7gn.2xlarge` decomposes cleanly:

```text
c        7        gn        .2xlarge
family   gen      attrs     size
```

**Family letter** — what it's optimized for:

| Letter | Purpose |
|---|---|
| `t` | Burstable, cheap baseline (see credits below) |
| `m` | General purpose, balanced |
| `c` | Compute optimized, high CPU-to-memory ratio |
| `r` | Memory optimized |
| `x`, `u` | Extreme memory — in-memory databases |
| `i`, `d` | Storage optimized, large local NVMe |
| `p`, `g`, `trn`, `inf` | Accelerated — GPUs and AWS's own ML silicon |

**Generation number** — higher is newer. Newer generations are usually *cheaper per unit of work* than older ones, which means "we've always run m5" is frequently a decision costing money for no reason.

**Attribute letters:**

| Letter | Meaning |
|---|---|
| `g` | Graviton (ARM) |
| `i` | Intel |
| `a` | AMD |
| `d` | Local NVMe instance storage attached |
| `n` | Network optimized, higher bandwidth |
| `e` | Extra storage or memory |
| `z` | High CPU frequency |

**Size** — `large`, `xlarge`, `2xlarge`, and upward, roughly doubling vCPU and memory each step. Within a family, price generally scales linearly with size, which is why "two mediums or one large" is usually a resilience question rather than a cost one.

---

## THE MECHANISM: Burst Credits, or Why Your Server Got Slow

This one catches almost everyone, and it's the kind of problem that produces a week of confused investigation.

### The T family

`t3.micro`, `t3.small`, `t4g.medium` — these are **burstable** instances. They're cheap because they don't give you a full vCPU continuously. They give you a **baseline percentage**, plus the ability to exceed it by spending credits.

The model:

- You earn **CPU credits** continuously, at a rate set by the instance size
- One credit equals one vCPU running at 100% for one minute
- Running below baseline accumulates credits, up to a cap
- Running above baseline spends them
- **Credits hit zero, and you get throttled to baseline** — which for a `t3.micro` is around 10% of a vCPU per core

Ten percent. Your application doesn't crash. It doesn't error. It just becomes ten times slower, indefinitely, with nothing in your application logs to explain it.

Classic shape of the incident: deploy on a `t3.micro`, everything is fast for two days while banked credits drain, then performance falls off a cliff on a Wednesday morning with no deploy, no traffic change, and no obvious cause. CPU utilization looks *fine* — it's pinned at baseline, which reads as low.

**The metric that explains it is `CPUCreditBalance` in CloudWatch.** Not CPU utilization. If you run T instances and don't alarm on credit balance, you will eventually lose a day to this.

### Unlimited mode

T3 and T4g default to **unlimited mode**: when credits run out, you keep bursting and pay a surcharge per vCPU-hour instead of being throttled. T2 defaults to *standard* mode, where you get throttled.

Unlimited is usually the right choice — a small surcharge beats a ten-fold slowdown — but it converts a performance cliff into a billing surprise. A runaway process on an unlimited T instance quietly accrues charges. Neither default is wrong; both need a monitor.

**When to use T instances:** genuinely spiky, low-average workloads. Dev boxes, low-traffic services, bastion hosts, cron runners.

**When not to:** anything with sustained load, anything latency-sensitive, anything where a mysterious tenfold slowdown would be a problem. Reach for `m` or `c`.

---

## THE MECHANISM: EBS — Your Disk Is on the Network

### The central fact

An **EBS volume is not attached to your server.** It's a block device served over the network from a replicated storage cluster within an Availability Zone, presented to your instance as though it were local.

Once you accept that, everything else makes sense:

- **EBS volumes are AZ-scoped.** A volume in `us-east-1a` cannot attach to an instance in `us-east-1b`. Ever. To move it, you snapshot and restore.
- **Volumes outlive instances.** Terminate the instance; the volume can persist (subject to its delete-on-termination flag).
- **EBS has its own failure modes** — network ones. It can be slow or unavailable while the instance is perfectly healthy. Remember that for the 2011 incident.
- **Performance is a network property**, which is why instances have separate EBS bandwidth limits from general network bandwidth.

### The volume types

| Type | Media | Characteristics |
|---|---|---|
| **gp3** | SSD | Baseline 3,000 IOPS and 125 MB/s **independent of size**; provision more independently |
| **gp2** | SSD | 3 IOPS per GB, bursting via credits — the older generation |
| **io2 / io2 Block Express** | SSD | Provisioned IOPS, very high ceilings, highest durability |
| **st1** | HDD | Throughput-optimized, sequential workloads, cheap per GB |
| **sc1** | HDD | Cold storage, cheapest, infrequent access |

**gp3 versus gp2 deserves a moment.** Under gp2, performance was welded to capacity: 3 IOPS per GB meant that if you needed 3,000 IOPS you had to buy a 1,000 GB volume whether or not you needed the space. People routinely over-provisioned capacity purely to buy performance.

gp3 decoupled them. You get 3,000 IOPS and 125 MB/s on any size, and buy more of either independently. It's also roughly 20% cheaper per GB than gp2.

**The practical consequence:** a great many AWS accounts still run gp2 volumes that would be cheaper and faster as gp3, and the migration is a live modification with no downtime. It's one of the highest-ratio cost wins available.

### The second burst credit system

gp2 has its own credit bucket, separate from CPU credits — the same mechanism wearing different clothes.

A gp2 volume under 1,000 GB earns I/O credits and can burst to 3,000 IOPS. Sustained load past its baseline drains the bucket. Then it drops to baseline: 3 IOPS per GB, so a 100 GB volume falls to **300 IOPS**.

A database on a small gp2 volume performs beautifully in testing and collapses under sustained production load, for exactly the same structural reason as the T-instance cliff. The metric is `BurstBalance`.

gp3 has no burst credits. Its baseline is its performance. This is a considerable simplification and a good reason to prefer it.

### Instance store — the other disk

Some instance types (`m7gd`, `i4i`, anything with a `d`) have **instance store**: NVMe drives physically attached to the host.

- Extremely fast — no network in the path
- **Ephemeral.** Data is lost on stop, on terminate, and on host failure
- **Survives a reboot**, which is a genuinely confusing distinction until you see why: reboot keeps you on the same host; stop/start may move you to a different one

Use it for caches, scratch space, temporary shuffle data — anything you can regenerate. Never for anything you need.

### Snapshots

EBS snapshots are **incremental and block-level**, stored in S3 (AWS's own, not your buckets).

The first snapshot copies every used block. Subsequent snapshots copy only blocks that changed. This makes them cheap to take often.

The part people get wrong: **deleting a snapshot never breaks a later one.** AWS handles the dependency — deleting snapshot 2 moves any blocks that snapshot 3 still needs. You cannot orphan your own data by deleting a middle snapshot, which is what everyone fears.

One performance note: a volume restored from a snapshot loads blocks from S3 lazily on first access. Initial reads can be noticeably slow. Fast Snapshot Restore exists to eliminate this, and it costs money.

Snapshots are encrypted if the volume was, using KMS (Volume 2). A snapshot of an encrypted volume cannot be decrypted without the key, which is exactly the durability trade-off from Volume 2 showing up again.

---

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

## Part Two: Distributing the Load

## THE PROBLEM: One Server Is a Single Point of Failure and a Ceiling

Two servers, one hostname. Now what?

- How does a client know which one to use?
- What happens when one dies — and how do you know it died?
- How do you add a third at 9am and remove it at 6pm?
- How do you take one out of service without dropping the requests it's currently handling?

DNS round-robin was the historical answer and it's poor: clients cache, TTLs are ignored, and a dead server keeps receiving traffic until every resolver on earth forgets it. There's no health awareness at all.

You need something in the request path that knows which backends are alive.

---

## THE MECHANISM: The Load Balancer Generations

AWS has shipped four, and they are not versions of one product.

### Classic Load Balancer (2009)

The original, simply called Elastic Load Balancing. Operates at both layer 4 and layer 7, with a limited feature set. It predates VPC in its original form.

**Use it for:** nothing new. It still exists for legacy workloads. If you're building today and reaching for CLB, you want ALB or NLB.

### Application Load Balancer (2016)

Layer 7. Understands HTTP and HTTPS, and routes on content:

- **Path-based routing** — `/api/*` to one target group, `/static/*` to another
- **Host-based routing** — different domains to different backends
- Routing on headers, query strings, HTTP method, source IP
- Native HTTP/2 and WebSocket support
- Integrated authentication via OIDC or Cognito
- Targets can be instances, IP addresses, or Lambda functions

**Use it for:** essentially all HTTP workloads.

### Network Load Balancer (2017)

Layer 4. TCP, UDP, and TLS. Built for extreme throughput and very low latency.

- Handles millions of requests per second with latency in the tens of microseconds
- **Static IP per AZ**, and supports Elastic IPs — which matters enormously when a client's firewall needs to allowlist you
- **Preserves the client source IP** by default, so your application sees the real client without reading `X-Forwarded-For`
- Doesn't understand HTTP, so no content-based routing

**Use it for:** non-HTTP protocols, extreme performance requirements, or when you need a fixed IP address.

### Gateway Load Balancer (2020)

Layer 3. Exists to insert third-party network appliances — firewalls, intrusion detection — transparently into your traffic path. Specialized; you'll know when you need it.

### Target groups, and the plumbing that matters

Modern load balancers don't point at instances directly. They point at a **target group**, which holds the targets, the health check configuration, and the protocol settings. A listener rule sends traffic to a target group. This indirection is what makes blue/green deployments and weighted traffic shifting possible.

**Health checks** are the heart of it. Interval, timeout, healthy threshold, unhealthy threshold, and — critically — the **path**.

Get the path wrong and you get one of two bad outcomes. Too shallow (a static file that always returns 200) and the load balancer happily routes traffic to an instance whose database connection is dead. Too deep (a check that queries five downstream services) and a single slow dependency causes your entire fleet to be marked unhealthy and removed from service — turning a partial degradation into a total outage.

**Deregistration delay** (connection draining, default 300 seconds) is what stops a deploy from dropping requests. When a target is removed, the load balancer stops sending *new* connections but lets existing ones finish. If you deregister without draining, every in-flight request dies.

**Cross-zone load balancing** distributes evenly across all AZs rather than evenly across zones. ALB does this always and doesn't charge for it. **NLB has it off by default**, and turning it on incurs cross-AZ data transfer charges (Volume 3, Volume 9).

---

## THE MECHANISM: Auto Scaling, and Its Built-In Lag

### The pieces

A **launch template** describes what to launch — AMI, instance type, security groups, IAM instance profile, user data. (Launch *configurations* are the deprecated predecessor; use templates.)

An **Auto Scaling Group** maintains a count:

- **Minimum** — never go below
- **Maximum** — never go above
- **Desired capacity** — the target right now

The ASG's job is to make reality match desired capacity. If an instance dies, it launches a replacement. If a scaling policy raises desired capacity, it launches more.

**Health check type matters.** Default is `EC2`, which only checks whether the instance is running — so a wedged application on a booted instance stays in service forever. Set it to `ELB` and the ASG uses the load balancer's health check, replacing instances whose *application* is broken rather than whose *hypervisor* noticed something.

### Scaling policies

**Target tracking** — "keep average CPU at 50%." AWS manages the alarms. This is the right default for most workloads.

**Step scaling** — explicit thresholds and increments. More control, more configuration.

**Scheduled** — scale at a specific time. Correct for known patterns like a 9am login surge.

**Predictive** — machine learning over historical patterns, scaling *ahead* of anticipated demand.

### Why scaling always lags — the arithmetic

Add up the pipeline between a traffic spike and a serving instance:

```text
CloudWatch metric publication            1–2 min  (standard resolution)
Alarm evaluation (often 2–3 periods)     2–3 min
ASG launches instance                    ~30 sec
Instance boots                           1–2 min
Application starts                       30 sec – 5 min
Load balancer health checks pass         30 sec – 2 min
------------------------------------------------------
Total                                    5–15 minutes
```

**Five to fifteen minutes.** A traffic spike that arrives in thirty seconds will be absorbed — or not — entirely by the capacity you already had.

This is structural. There is no configuration that removes it. What you can do:

- **Scale on leading indicators** — queue depth or request count rather than CPU, which is a lagging symptom
- **Keep headroom.** Target 50% utilization, not 90%. The headroom is what covers the lag.
- **Cut boot time.** A pre-baked AMI beats a machine that installs packages at boot. This is the single biggest lever most teams have.
- **Use scheduled scaling** for predictable patterns rather than reacting to them
- **Warm pools** for pre-initialized, stopped instances that start fast

And remember Volume 1: **scaling is a control plane operation.** During a control plane impairment, your ASG cannot launch anything. Whatever is running is what you have. That's the entire argument for static stability in Volume 8.

---

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

## TRY THIS ON YOUR MACHINE

**Cost flags read carefully.** Exercises 1–3 are free-tier eligible (`t3.micro`, small EBS volumes). **Exercise 4 creates an Application Load Balancer at roughly 0.0225 USD/hour plus capacity units — about 0.03 USD if you complete it in an hour, about 17 USD/month if you forget it.** Teardown script at the end. Set a timer.

### 1. Look at the hardware through the abstraction

Launch a small instance and connect via Session Manager (no key pair, no open port — Volume 3):

```bash
export AWS_DEFAULT_REGION=us-east-1

AMI=$(aws ssm get-parameters \
  --names /aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64 \
  --query "Parameters[0].Value" --output text)

ROLE_NAME=volume4-ssm-role
aws iam create-role --role-name $ROLE_NAME --assume-role-policy-document '{
  "Version":"2012-10-17",
  "Statement":[{"Effect":"Allow","Principal":{"Service":"ec2.amazonaws.com"},"Action":"sts:AssumeRole"}]}'
aws iam attach-role-policy --role-name $ROLE_NAME \
  --policy-arn arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore
aws iam create-instance-profile --instance-profile-name $ROLE_NAME
aws iam add-role-to-instance-profile --instance-profile-name $ROLE_NAME --role-name $ROLE_NAME
sleep 15

INSTANCE_ID=$(aws ec2 run-instances --image-id $AMI --instance-type t3.micro \
  --iam-instance-profile Name=$ROLE_NAME \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=volume4-lab}]' \
  --query "Instances[0].InstanceId" --output text)
aws ec2 wait instance-status-ok --instance-ids $INSTANCE_ID
echo "Instance: $INSTANCE_ID"

aws ssm start-session --target $INSTANCE_ID
```

Once you have a shell:

```bash
sudo dmidecode -s system-manufacturer
sudo dmidecode -s system-product-name
lscpu | head -20
ls -la /dev/nvme*
cat /sys/hypervisor/type 2>/dev/null || echo "no xen hypervisor node"
```

**What to expect:** manufacturer reporting Amazon EC2, NVMe devices where you might have expected `/dev/xvda`, and no Xen hypervisor node on a Nitro instance.

**Why it's interesting:** your "disk" presents as an NVMe device because the Nitro card exposes network-attached EBS as local NVMe hardware. The abstraction goes all the way down to the device interface. On older Xen instances you'd see `/dev/xvda` and a Xen paravirtual driver instead.

### 2. Watch the credit bucket drain

Still in the session, install a load generator and check the baseline first:

```bash
sudo dnf install -y stress-ng
nproc
```

Exit the session (`exit`), then read the credit metric before loading it:

```bash
aws cloudwatch get-metric-statistics \
  --namespace AWS/EC2 --metric-name CPUCreditBalance \
  --dimensions Name=InstanceId,Value=$INSTANCE_ID \
  --start-time $(date -u -d '30 minutes ago' +%Y-%m-%dT%H:%M:%S 2>/dev/null || date -u -v-30M +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 --statistics Average \
  --query "Datapoints[].{Time:Timestamp,Credits:Average}" --output table
```

Now burn CPU for ten minutes and re-read it:

```bash
aws ssm send-command --instance-ids $INSTANCE_ID \
  --document-name "AWS-RunShellScript" \
  --parameters 'commands=["stress-ng --cpu 2 --timeout 600s &"]'
```

Wait 15 minutes, then run the `get-metric-statistics` command again.

**What to expect:** a credit balance that was climbing or flat, now visibly falling.

**Why it's interesting:** this is the mechanism behind the Wednesday-morning performance cliff. Note especially that `CPUUtilization` during throttling looks *low* — the instance is pinned at baseline, which reads as a healthy 10%. The metric that tells the truth is the one nobody graphs by default.

### 3. Prove snapshots are incremental

```bash
AZ=$(aws ec2 describe-instances --instance-ids $INSTANCE_ID \
  --query "Reservations[0].Instances[0].Placement.AvailabilityZone" --output text)

VOL_ID=$(aws ec2 create-volume --size 1 --volume-type gp3 \
  --availability-zone $AZ --query VolumeId --output text)
aws ec2 wait volume-available --volume-ids $VOL_ID

SNAP1=$(aws ec2 create-snapshot --volume-id $VOL_ID \
  --description "volume4 first" --query SnapshotId --output text)
aws ec2 wait snapshot-completed --snapshot-ids $SNAP1

SNAP2=$(aws ec2 create-snapshot --volume-id $VOL_ID \
  --description "volume4 second" --query SnapshotId --output text)
aws ec2 wait snapshot-completed --snapshot-ids $SNAP2

aws ec2 describe-snapshots --snapshot-ids $SNAP1 $SNAP2 \
  --query "Snapshots[].{Id:SnapshotId,Size:VolumeSize,Desc:Description,Started:StartTime}" \
  --output table
```

**What to expect:** both snapshots report the same *volume* size, but the second completes almost instantly.

**Why it's interesting:** the reported size is the volume's, not the storage consumed. The second snapshot stored almost nothing, because almost nothing changed. This is why hourly snapshots are viable — and why "how much do my snapshots cost" is a question the console can't answer simply.

### 4. Build an ASG and kill an instance

**Cost flag: creates an ALB, roughly 0.0225 USD/hour. Delete it when done.**

```bash
VPC_ID=$(aws ec2 describe-vpcs --filters "Name=isDefault,Values=true" \
  --query "Vpcs[0].VpcId" --output text)
SUBNETS=$(aws ec2 describe-subnets --filters "Name=vpc-id,Values=$VPC_ID" \
  --query "Subnets[0:2].SubnetId" --output text)
SUBNET_ARR=($SUBNETS)

SG_ID=$(aws ec2 create-security-group --group-name volume4-alb-sg \
  --description "volume 4 lab" --vpc-id $VPC_ID --query GroupId --output text)
MY_IP=$(curl -s https://checkip.amazonaws.com)
aws ec2 authorize-security-group-ingress --group-id $SG_ID \
  --protocol tcp --port 80 --cidr ${MY_IP}/32
```

Create a launch template whose user data installs a web server:

```bash
USERDATA=$(cat <<'EOF' | base64 -w0
#!/bin/bash
dnf install -y nginx
echo "served by $(hostname)" > /usr/share/nginx/html/index.html
systemctl enable --now nginx
EOF
)

aws ec2 create-launch-template --launch-template-name volume4-lt \
  --launch-template-data "{
    \"ImageId\":\"$AMI\",
    \"InstanceType\":\"t3.micro\",
    \"SecurityGroupIds\":[\"$SG_ID\"],
    \"UserData\":\"$USERDATA\"
  }"
```

Create a target group, ALB, and ASG:

```bash
TG_ARN=$(aws elbv2 create-target-group --name volume4-tg \
  --protocol HTTP --port 80 --vpc-id $VPC_ID \
  --health-check-path / --health-check-interval-seconds 15 \
  --healthy-threshold-count 2 --unhealthy-threshold-count 2 \
  --query "TargetGroups[0].TargetGroupArn" --output text)

ALB_ARN=$(aws elbv2 create-load-balancer --name volume4-alb \
  --subnets ${SUBNET_ARR[0]} ${SUBNET_ARR[1]} --security-groups $SG_ID \
  --query "LoadBalancers[0].LoadBalancerArn" --output text)

aws elbv2 create-listener --load-balancer-arn $ALB_ARN \
  --protocol HTTP --port 80 \
  --default-actions Type=forward,TargetGroupArn=$TG_ARN

aws autoscaling create-auto-scaling-group \
  --auto-scaling-group-name volume4-asg \
  --launch-template LaunchTemplateName=volume4-lt,Version='$Latest' \
  --min-size 2 --max-size 4 --desired-capacity 2 \
  --vpc-zone-identifier "${SUBNET_ARR[0]},${SUBNET_ARR[1]}" \
  --target-group-arns $TG_ARN \
  --health-check-type ELB --health-check-grace-period 120
```

Wait a few minutes, then watch the targets become healthy:

```bash
watch -n 10 "aws elbv2 describe-target-health --target-group-arn $TG_ARN \
  --query 'TargetHealthDescriptions[].{Target:Target.Id,State:TargetHealth.State}' --output table"
```

Now the experiment. Terminate one instance manually and **time the recovery**:

```bash
VICTIM=$(aws autoscaling describe-auto-scaling-groups \
  --auto-scaling-group-names volume4-asg \
  --query "AutoScalingGroups[0].Instances[0].InstanceId" --output text)

date
aws ec2 terminate-instances --instance-ids $VICTIM
watch -n 10 "date; aws elbv2 describe-target-health --target-group-arn $TG_ARN \
  --query 'TargetHealthDescriptions[].{Target:Target.Id,State:TargetHealth.State}' --output table"
```

**What to expect:** the target goes unhealthy, then drains and disappears. A replacement launches, appears as `initial`, and eventually becomes `healthy`. **Time it.** Expect several minutes.

**Why it's interesting:** you just measured the lag arithmetic from earlier in this volume, on a real system, with nothing else going on. Now imagine that clock running while traffic is arriving. This number — not your scaling policy — is what determines whether you survive a spike.

### 5. Find your gp2 volumes

```bash
for region in us-east-1 us-west-2 eu-west-1; do
  echo "=== $region ==="
  aws ec2 describe-volumes --region $region \
    --filters Name=volume-type,Values=gp2 \
    --query "Volumes[].{Id:VolumeId,Size:Size,State:State}" --output table 2>/dev/null
done
```

**What to expect:** in a fresh account, probably nothing. In any inherited account, likely a list.

**Why it's interesting:** every gp2 volume in that list can be modified to gp3 live, with no downtime, for roughly 20% less per GB and usually better baseline performance. `aws ec2 modify-volume --volume-id X --volume-type gp3`. It's the closest thing to free money in AWS, and it sits unclaimed in an enormous number of accounts.

**Cleanup:** none — read-only.

### Teardown — run all of this

```bash
aws autoscaling update-auto-scaling-group --auto-scaling-group-name volume4-asg \
  --min-size 0 --desired-capacity 0
sleep 60
aws autoscaling delete-auto-scaling-group --auto-scaling-group-name volume4-asg --force-delete

aws elbv2 delete-listener --listener-arn $(aws elbv2 describe-listeners \
  --load-balancer-arn $ALB_ARN --query "Listeners[0].ListenerArn" --output text)
aws elbv2 delete-load-balancer --load-balancer-arn $ALB_ARN
sleep 30
aws elbv2 delete-target-group --target-group-arn $TG_ARN
aws ec2 delete-launch-template --launch-template-name volume4-lt

aws ec2 terminate-instances --instance-ids $INSTANCE_ID
aws ec2 wait instance-terminated --instance-ids $INSTANCE_ID

aws ec2 delete-snapshot --snapshot-id $SNAP2
aws ec2 delete-snapshot --snapshot-id $SNAP1
aws ec2 delete-volume --volume-id $VOL_ID
aws ec2 delete-security-group --group-id $SG_ID

aws iam remove-role-from-instance-profile --instance-profile-name volume4-ssm-role --role-name volume4-ssm-role
aws iam delete-instance-profile --instance-profile-name volume4-ssm-role
aws iam detach-role-policy --role-name volume4-ssm-role \
  --policy-arn arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore
aws iam delete-role --role-name volume4-ssm-role
```

Then verify in the console that no load balancer remains. The ALB is the only thing here that bills meaningfully if forgotten.

---

## What You Should Now Be Able To Say

- What Nitro moved off the CPU, and why bare-metal instances became possible as a result
- How to read `c7gn.2xlarge` without looking anything up
- Why an instance can be slow with low reported CPU utilization
- Why an EBS volume can't cross an Availability Zone
- Why gp3 is usually strictly better than gp2
- How a recovery mechanism caused the 2011 outage
- Why a health check that's too thorough is as dangerous as one that's too shallow
- The arithmetic of scaling lag, and which lever actually shortens it

---

## Where We Go Next

**Volume 5 — S3 and the Edge: Object Storage, CloudFront, Route 53.**

The service that shipped before EC2, and the two that put it in front of the whole planet. We'll cover why S3 has no folders (and why that's not pedantry), the 2020 shift from eventual to strong consistency and what it silently fixed, storage classes and lifecycle policies, and the three overlapping permission systems on a bucket — policies, ACLs, and Block Public Access — which is why so many buckets ended up open.

Then DNS from first principles, Route 53 routing policies and health checks, alias records, CloudFront cache behaviors, and where TLS terminates.

Three incidents: **February 28, 2017**, when a typo in one command's parameters removed more S3 capacity than intended and took down a large slice of the internet — including AWS's own status dashboard, which was hosted on S3. The **2017 open-bucket epidemic**. And the **April 2018 BGP hijack** that poisoned DNS answers and drained cryptocurrency wallets.

---

*Volume 4 complete. Say **continue** when you're ready for Volume 5.*
