---
id: observability-resilience
title: "Volume 8 — Knowing What Happened, and Surviving It: Observability, HA, DR"
order: 8
description: Metrics, logs, traces and the forensic record, then RTO and RPO as engineering inputs, the four DR strategies honestly costed, and static stability — anchored on breaches found months late and Netflix's 2011 method.
draft: false
---

# Mastering AWS: The Engineering, The History, The Incidents

## Volume 8 — Knowing What Happened, and Surviving It: Observability, HA, DR

---

## The Question This Volume Answers

Every volume so far has been about building. This one is about two questions you only ask after something goes wrong:

**"What happened?"** and **"How do we not be down?"**

They look unrelated. They aren't. Both come down to a single uncomfortable truth: **the capabilities you need during a failure must be built before the failure, because during the failure you can't build anything.**

You saw this three times already without me naming it:

- **February 2017** (Volume 5) — AWS couldn't update its status page because the status page ran on the service that was down.
- **December 2021** (Volume 1) — AWS's own monitoring was inside the blast radius of the congestion it was trying to diagnose.
- **April 2011** (Volume 4) — Multi-AZ failover behaved differently during the correlated failure it existed for than during the isolated failures it had been tested against.

That's the theme. Four things to take away:

1. **Metrics, logs, and traces are different tools with wildly different costs**, and treating them as interchangeable is expensive.
2. **CloudTrail's most important setting is off by default.**
3. **RTO and RPO are engineering inputs, not aspirations** — you derive architecture from them, not the other way around.
4. **Static stability** — surviving failure without needing the control plane — is the idea that ties this whole guide together.

---

## Part One: Knowing What Happened

## THE PROBLEM: You Can't Debug What You Didn't Record

A request fails. It passed through CloudFront, an ALB, three containers, a Lambda, and a database. It's 2 AM. The user is gone.

**What do you have?**

Whatever you were recording *before* it happened. Nothing else. You cannot go back and instrument the past. This is the fundamental asymmetry of operations: every observability decision is made in advance of the incident it will be judged by.

Which creates a genuine tension. Record everything and you go broke — CloudWatch Logs ingestion charges are real money at volume, and verbose logging at scale can exceed the cost of the compute producing it. Record too little and you're blind.

So you need to know what each tool is actually for.

---

## THE MECHANISM: Three Different Things

### Metrics — numbers over time, cheap

A metric is a numeric value with a timestamp and some dimensions. CPU utilization. Request count. Queue depth. Error rate.

**They're cheap because they're aggregated.** CloudWatch doesn't store every individual measurement forever; it rolls them up as they age:

| Resolution | Retained for |
|---|---|
| 1 second (high resolution) | 3 hours |
| 1 minute | 15 days |
| 5 minutes | 63 days |
| 1 hour | 455 days |

**Use metrics for:** alerting, dashboards, capacity trends, anything where you need a number over time rather than the detail of individual events.

**Two traps worth naming.**

**Cardinality.** Custom metrics are billed per unique combination of name and dimensions, at roughly 0.30 USD per metric per month. Publish a metric dimensioned by instance ID and you get one per instance. Dimension it by user ID and you've created a metric per user, and your bill scales with your user base. **Metric dimensions must be low cardinality.** High-cardinality data belongs in logs.

**Memory and disk are not default EC2 metrics.** CloudWatch gets EC2 metrics from the hypervisor, which can see CPU, network, and disk I/O — but *cannot see inside the guest*. Memory utilization and filesystem usage require the **CloudWatch Agent** installed on the instance. An enormous number of teams alarm on CPU, never install the agent, and are genuinely surprised when a server dies of memory exhaustion with no alert.

### Logs — events with detail, expensive

A log line is a timestamped record with arbitrary content. Full fidelity, full context, no aggregation.

**And that's why they cost.** CloudWatch Logs charges roughly **0.50 USD per GB ingested**, plus storage, plus per-GB-scanned for Logs Insights queries. Ingestion is usually the dominant line.

Do the arithmetic on a service producing 100 GB of logs a day:

```text
100 GB/day × 30 days × $0.50/GB  =  $1,500/month  in ingestion alone
```

Before storage. Before queries. It is entirely normal for a team's logging bill to exceed its compute bill, and it usually happens because someone left debug logging on in production.

**The default that costs the most money in AWS:** log groups are created with **retention set to Never Expire**. Every Lambda function, every ECS task, every service creates a log group on first write and keeps its logs forever, accumulating cost indefinitely, including for services that were deleted years ago.

You met this in Volume 7's teardown. At organizational scale it's frequently the single largest avoidable line in a CloudWatch bill. Exercise 1 finds yours.

**Use logs for:** debugging specific events, audit trails, high-cardinality data, anything where you need the detail rather than the count.

**Metric filters** bridge the two — they scan incoming log lines for a pattern and emit a metric. "Count log lines containing ERROR" becomes a metric you can alarm on cheaply, without querying logs.

### Traces — one request across many services, sampled

A trace follows a single request through every service it touches, recording where the time went.

**AWS X-Ray** is the native option: segments, subsegments, a service map, and **sampling rules** — because tracing every request would be prohibitively expensive, so you trace a representative fraction.

**Be precise here:** **OpenTelemetry is not an AWS product.** It's a CNCF project, the industry-standard vendor-neutral instrumentation framework. AWS packages a distribution of it (ADOT) and X-Ray can receive OTel data. Instrumenting with OpenTelemetry rather than the X-Ray SDK keeps you portable, which is usually the right call.

**Use traces for:** "which service is slow," "what does this request actually touch," and understanding latency in a distributed system where no single service's metrics explain the total.

### Alarms — turning signal into action

A CloudWatch alarm watches a metric against a threshold. Three states: `OK`, `ALARM`, `INSUFFICIENT_DATA`.

**Evaluation periods and datapoints-to-alarm** control sensitivity. "3 out of 5 periods breaching" is far less noisy than "1 period breaching" and catches sustained problems while ignoring blips.

**Treat missing data is the setting nobody configures and everybody should.** Options: `breaching`, `notBreaching`, `ignore`, `missing`.

Here's why it matters. Your alarm watches error rate. Your service dies completely and stops publishing metrics. There is now **no data** — not high error rates, *no data at all*.

With the default (`missing`), the alarm goes to `INSUFFICIENT_DATA` and **does not fire**. Your service is completely dead and your alarm is quietly grey.

For an alarm monitoring something that *should always be producing data*, set missing data to **`breaching`**. Absence is the signal.

**Composite alarms** (2020) combine alarms with boolean logic. The use case is noise: when a database fails, twelve dependent service alarms fire simultaneously and page twelve times. A composite alarm can express "alert if the API alarm is firing AND the database alarm is not" — so you get one page about the root cause, not twelve about symptoms.

### EventBridge — the nervous system

Formerly CloudWatch Events, rebranded in 2019 and substantially expanded.

Every AWS service emits events to a default event bus: an instance changed state, a snapshot completed, a build finished, a finding appeared. You write **rules** with pattern matching and route them to targets — Lambda, SQS, Step Functions, another account's bus.

```json
{
  "source": ["aws.ec2"],
  "detail-type": ["EC2 Instance State-change Notification"],
  "detail": { "state": ["terminated"] }
}
```

That rule fires whenever any instance terminates. It's how you build reactive automation — auto-remediation, compliance enforcement, notification — without polling anything.

**Archive and replay** is the underrated feature: retain events and replay them later, which turns an incident into something you can reproduce.

---

## THE MECHANISM: CloudTrail, and the Setting That's Off

CloudTrail records API calls. Every signed request from Volume 1: who, what, when, from where, and whether it succeeded.

**It is the only reason anyone ever finds out what an attacker did.**

### Three kinds of event, and the critical distinction

**Management events** — control plane operations. `RunInstances`, `CreateBucket`, `AssumeRole`, `PutBucketPolicy`, `AttachUserPolicy`. **Logged by default**, and the console keeps a searchable 90-day **Event history** at no charge.

**Data events** — data plane operations. `GetObject`, `PutObject`, `DeleteObject` on S3. Lambda `Invoke`. DynamoDB item-level operations.

**These are OFF by default. All of them.**

Read that again with Volume 2 in mind.

In the Capital One breach, the attacker used stolen role credentials to list and read S3 objects. Those were `ListBucket` and `GetObject` calls — **data events**. Unless data events had been explicitly enabled for those buckets, **the actual exfiltration does not appear in CloudTrail at all.**

Management events would show the role being assumed. They would not show a single object being read.

**Why it's off by default:** volume and cost. A busy S3 bucket generates millions of object operations, and logging every one costs real money. AWS made it opt-in rather than imposing that on everyone.

**What you should actually do:** enable data events at minimum for buckets holding sensitive data, and for Lambda functions that touch it. It costs money. Being unable to answer "what did they take?" costs more.

**Insights events** — CloudTrail's own anomaly detection over API call rates, flagging unusual bursts. Also opt-in.

### The trail versus the console history

The free 90-day console Event history is **management events only, in the console, for 90 days.**

For anything real you create a **trail** delivering to S3, which gives you indefinite retention, all Regions, data events if you enable them, and — critically — **log file integrity validation**. CloudTrail writes periodic digest files containing SHA-256 hashes of the log files, signed with a private key. You can verify cryptographically that nobody altered the record.

That last point matters more than it sounds. A competent attacker's first move after gaining access is to cover their tracks. Integrity validation, plus delivering the trail to a **separate, locked-down account** that the compromised account cannot write to, is how you keep a record an attacker can't erase.

**Organization trails** in AWS Organizations (Volume 9) capture every account centrally and cannot be disabled by member accounts. If you run more than one account, this is the correct setup.

### The rest of the security stack, briefly

- **GuardDuty** — threat detection over CloudTrail, VPC Flow Logs, and DNS logs. Finds crypto-mining, credential misuse, communication with known-bad hosts. Low effort, genuinely useful.
- **AWS Config** — records resource configuration over time and evaluates rules. Answers "what did this security group look like last Tuesday?" and "which buckets are non-compliant?"
- **Security Hub** — aggregates findings from the above against benchmarks like CIS.
- **Amazon Inspector** — vulnerability scanning for EC2, ECR images (Volume 7's Log4Shell lesson), and Lambda.
- **Amazon Detective** — graphs relationships across the data for investigation.

---

## REAL INCIDENT: The Months Nobody Noticed

### The pattern

Go back to Capital One (Volume 2). The technical chain was: SSRF, then IMDS, then credentials, then S3 exfiltration.

But look at the **timeline**:

- The data was taken around **March 2019**
- It was discovered in **July 2019**
- The discovery came from an **outside party** emailing the company's responsible-disclosure address, having seen the data posted publicly

**Roughly four months.** And the alarm was rung by a stranger.

This is not unusual. Industry research consistently puts the mean time to identify a breach in the range of **six to seven months**, with a further period to contain it. *(Figures vary year to year — IBM's annual Cost of a Data Breach report is the usual source. Treat the specific number as approximate and check the current edition.)*

The uncomfortable summary: **most organizations find out about their breaches from someone else.**

### Why detection fails

**The data events weren't on.** Even with a trail configured, if data events were off, S3 object reads aren't in the record. There is nothing to detect and — later — nothing to investigate with.

**Nothing looked wrong.** Valid credentials, used correctly, calling a legitimate API. No authentication failure. No error. No crash. From every system's point of view, an authorized principal read some objects. The only anomalous thing was the *pattern* — a WAF instance suddenly listing and reading a great many buckets — and pattern detection requires something actively looking.

**Nobody owned the signal.** Even where logs existed, no one had asked "should this role be doing this?" Logs that nobody queries are storage costs, not security.

**No baseline.** You cannot detect anomalies without a sense of normal. This is exactly what GuardDuty provides, and why it's worth turning on even if you do nothing else.

### The dependency lesson, again

Here's what makes this a *this volume* incident rather than a Volume 2 one.

**Detection capability must exist before the event.** You cannot retroactively enable CloudTrail data events for last March. You cannot go back and instrument. The forensic record either exists or it doesn't, and which one is true was decided months earlier by someone weighing a line item.

Same structure as everything else in this volume. Same structure as the status page on S3, the monitoring inside the congested network, the failover never drilled.

**The questions to answer now:**

- If an attacker used valid credentials to read your most sensitive S3 bucket today, would there be a record?
- Could an attacker with admin access delete that record?
- Is anyone or anything looking at it?
- How long would it take you to find out?

---

## Part Two: Surviving It

## THE PROBLEM: "Highly Available" Is Not a Specification

"We need high availability." "We need disaster recovery." These phrases mean nothing on their own, and architectures built on them tend to be expensive and untested simultaneously.

You need two numbers.

**RTO — Recovery Time Objective.** How long may we be down? Seconds? An hour? A day?

**RPO — Recovery Point Objective.** How much data may we lose? Zero? Five minutes? A day?

These are **business decisions with engineering costs**, and the conversation only becomes productive when you attach prices:

- RPO of zero means synchronous replication, which means write latency and roughly double the infrastructure.
- RTO of seconds means a fully running second environment, which means paying for capacity you hope never to use.
- RTO of hours and RPO of hours can be satisfied by backups, which cost almost nothing.

**The correct process is: business states RTO and RPO, engineering states the price, business revises.** It is never the other way around, and the number of architectures built by engineers guessing at requirements is the source of a great deal of both over- and under-spending.

And be precise about the difference:

- **High availability** handles *expected* failures — an instance dies, an AZ has a power event. Automatic, routine, no human involvement.
- **Disaster recovery** handles *exceptional* failures — a Region is impaired, someone deletes the production database, ransomware encrypts everything. Often involves a human decision.

They need different designs. Multi-AZ is HA. Multi-Region is DR. Conflating them produces architectures that survive a rack failure beautifully and cannot survive a bad deployment at all.

---

## THE MECHANISM: The Four Strategies

AWS's own disaster recovery framing, ordered by cost and capability.

### 1. Backup and Restore

Back up data and configuration to another Region. On disaster, provision new infrastructure and restore.

- **RTO:** hours to days
- **RPO:** whatever your backup interval is
- **Cost:** very low — storage only

**Good for:** non-critical workloads, and as the floor beneath every other strategy. Even an active-active setup needs backups, because replication faithfully replicates a bad `DELETE`.

**The trap:** provisioning infrastructure during a disaster is slow and requires the control plane to be working in the target Region. This is why infrastructure as code (Volume 9) is a DR requirement, not a nicety — restoring data into infrastructure you have to hand-build is not a plan.

### 2. Pilot Light

Data is continuously replicated to the second Region. Core infrastructure exists but is switched off or minimal. On disaster, you scale it up.

- **RTO:** tens of minutes
- **RPO:** minutes (replication lag)
- **Cost:** low — storage and replication, minimal compute

**Good for:** the common middle ground. A cross-Region read replica (Volume 6) with a defined promotion procedure and IaC ready to deploy the application tier.

**The trap:** "scale it up" is a control plane operation in the target Region. It usually works, because regional failures are usually isolated — but you're depending on it.

### 3. Warm Standby

A scaled-down but **fully functional** copy running in the second Region. It can serve traffic today, just not at full volume.

- **RTO:** minutes
- **RPO:** seconds
- **Cost:** moderate — you're running a second environment

**Good for:** business-critical systems where tens of minutes is too long.

**The advantage over pilot light is subtle and important:** it's running, which means it's *tested continuously*. A pilot light environment that has never served a request may not work. A warm standby that serves 5% of traffic demonstrably does.

### 4. Multi-Site Active/Active

Both Regions serve production traffic simultaneously. Failure means shifting traffic.

- **RTO:** near zero
- **RPO:** near zero
- **Cost:** high, and the complexity cost exceeds the infrastructure cost

**Good for:** systems where downtime is genuinely unacceptable.

**The honest difficulties:**

- **Data consistency across Regions is hard.** Cross-Region latency is tens to hundreds of milliseconds. Synchronous replication at that distance destroys write performance. So you're accepting eventual consistency, and you must design for conflicting writes.
- **Cross-Region data transfer costs** on every replicated byte (Volume 9).
- **Some AWS services are global with a control plane in us-east-1** (Volume 1). Your active-active application may still have a management dependency on one Region.
- **The complexity is permanent.** Every feature, every deployment, every schema migration must now work across Regions, forever.

### Choosing honestly

Most systems belong in the first two categories and are told they belong in the fourth. Multi-Region active-active is the right answer for a minority of workloads and is frequently chosen for reasons of prestige rather than requirement.

**And a genuinely uncomfortable observation:** a badly executed multi-Region architecture is *less* reliable than a good single-Region one, because you've added a large amount of complex, rarely exercised machinery, and complexity is where outages come from. If you can't test the failover regularly, you probably shouldn't have built it.

---

## THE MECHANISM: Static Stability

This is the idea that ties the whole guide together, and AWS has written about it well in their Builders' Library.

### The definition

**A statically stable system continues operating correctly during a dependency failure, because it doesn't need that dependency to maintain its current state.**

It only needs the dependency to *change* state.

### Why this is the whole game

Recall Volume 1's control plane / data plane split, and the prediction it enabled:

> Outages usually break your ability to change things, not your ability to run things.

Now combine that with the standard resilience playbook. What does most automatic recovery do?

- An instance dies → **Auto Scaling launches a replacement** (control plane)
- An AZ fails → **scale up in the remaining AZs** (control plane)
- A Region fails → **provision in another Region** (control plane)

**Every one of those depends on the control plane working.** And the control plane is precisely what tends to be impaired during a large failure.

That was December 2021 in miniature: companies whose plan was "fail over" discovered their plan required launching instances, and launching instances was the thing that had stopped working.

### The alternative

Don't recover by adding. **Pre-provision so that losing something requires no action.**

The canonical example:

**Dynamically stable (what most people build):**
```text
3 AZs × 2 instances each = 6 instances, each ~50% utilized
Lose one AZ  → 4 instances carrying the load of 6 → ~75% utilized
             → Auto Scaling launches 2 replacements
             → REQUIRES CONTROL PLANE
```

**Statically stable:**
```text
3 AZs × 3 instances each = 9 instances, each ~33% utilized
Lose one AZ  → 6 instances carrying the load of 9 → ~50% utilized
             → nothing happens, because nothing needs to
             → NO CONTROL PLANE REQUIRED
```

**The cost is 50% more instances. The benefit is that AZ failure is a non-event.**

That's the trade, stated plainly. You're pre-paying for capacity to remove a dependency on the control plane at the worst possible moment.

### Where else this applies

- **Don't scale on failure — be pre-scaled.** Run at lower utilization than feels efficient.
- **Cache credentials and configuration.** If your application fetches config from a service on every request, that service is now in your critical path. Cache it, and keep serving on the cached value if the fetch fails.
- **Fail open where it's safe.** If your authorization service is unreachable, what happens? Sometimes the safe answer is deny. Sometimes denying everything is a bigger outage than the one you're mitigating. Decide deliberately.
- **DNS with health checks over control plane failover.** Route 53's data plane (Volume 5) carries a far stronger availability commitment than most control planes.
- **Pre-provision your DR environment**, which is exactly why warm standby beats pilot light on more than just RTO.

### AWS Backup

Centralized backup across EBS, RDS, DynamoDB, EFS, S3, and more. Backup plans define what and how often; **vaults** hold the results.

The feature worth knowing: **Vault Lock**. It enforces write-once-read-many retention that **cannot be deleted or shortened, even by an account administrator, even by AWS**.

This exists because of ransomware. An attacker with admin credentials will delete your backups before encrypting your data — it's the standard playbook. Vault Lock in compliance mode makes that impossible. Combined with cross-account copies into an account with separate credentials, it's the strongest data-loss protection AWS offers.

---

## REAL INCIDENT: Netflix, 2011 — Chaos as Method

### The setup

You met this briefly in Volume 4. April 21, 2011: the EBS re-mirroring storm takes out a large part of `us-east-1` for days. Reddit, Quora, Foursquare, and many others go dark.

**Netflix stayed up.**

### The part that surprises people

The usual telling implies Netflix responded brilliantly to the outage. The more interesting truth is that **they had already built for it, and Chaos Monkey already existed.**

Netflix had begun moving to AWS around 2008–2009, partly in response to a serious database corruption incident in their own data center. Their engineering leadership drew a conclusion most organizations resist: **if you're going to run on infrastructure that fails, the only way to know you survive failure is to cause failure continuously.**

Chaos Monkey randomly terminated production instances **during business hours**, on purpose, while customers were watching.

The business-hours detail is the whole point. Kill instances at 3 AM and failures surface when nobody is awake to learn from them. Kill them at 2 PM and the engineers who built the system are at their desks when it breaks. You can fix what you observe.

By April 2011, Netflix's services had been surviving random instance death for a long time. The EBS outage was a larger version of something their architecture was already continuously proving it could handle.

### What they actually did

From their public writing, the principles were:

**Stateless services.** No request depends on a particular instance surviving. Any instance can die at any moment.

**Avoid the failing dependency.** They made heavy use of instance store rather than EBS where they could, treating persistence as a service-level concern.

**Redundancy across AZs**, with the ability to lose one entirely.

**Graceful degradation.** When a dependency fails, serve something worse rather than nothing. A generic recommendation list beats an error page. Their Hystrix library formalized this with circuit breakers and fallbacks.

**Timeouts and circuit breakers everywhere.** A slow dependency is more dangerous than a dead one — it consumes threads and connections until the caller dies too. Fail fast.

### What came after

The 2012 Christmas Eve ELB outage (Volume 4) hit Netflix hard and pushed them further:

**Simian Army** — a family of tools beyond Chaos Monkey. Latency Monkey introduced artificial delays. Conformity Monkey found instances not following best practice. **Chaos Kong simulated the loss of an entire AWS Region.**

**Multi-Region active-active.** Netflix moved to running multiple Regions simultaneously and, crucially, **practiced evacuating a Region regularly** — shifting all traffic away from one Region as an exercise, in production.

**ChAP (Chaos Automation Platform)** made experiments continuous and automated rather than manual events.

### The honest caveat

Netflix had enormous engineering resources, a workload well suited to this approach (stateless streaming, tolerant of degraded responses), and years to build it. **Do not read this as "you should build Chaos Kong."**

Read it as: **resilience you have not tested is a hypothesis.**

That claim scales all the way down. You don't need a chaos platform. You need to have actually done the thing once:

- **Restore a backup to a new instance and time it.** (Volume 6.)
- **Force an RDS failover with `--force-failover` in staging with traffic flowing**, and watch your connection pool. (Volume 6.)
- **Terminate an instance in your ASG and time the recovery.** (Volume 4 — you already did this.)
- **Revoke a credential your application uses** and confirm the failure is loud, not silent.
- **Block a dependency at the security group level** and see whether you degrade or collapse.

**AWS Fault Injection Service** (FIS) makes some of this structured — it can terminate instances, inject latency, throttle APIs, and stop tasks on a schedule with guardrails and automatic rollback.

### The generalized lesson of this volume

Look at the pattern across every incident in this guide:

| Incident | The untested thing |
|---|---|
| 2011 EBS | Multi-AZ failover under correlated failure |
| 2012 ELB | A destructive operation's blast radius |
| 2017 S3 | Full subsystem restart at current scale |
| 2019 Capital One | Whether anyone would notice |
| 2021 us-east-1 | Whether diagnosis works during the failure |

**Every one is a capability that existed on paper and had not been exercised at the scale or under the conditions where it mattered.**

That's the volume. Build the capability, then use it before you need it.

---

## TRY THIS ON YOUR MACHINE

All five are **free**. Exercise 4 runs a Logs Insights query, charged per GB scanned — on a personal account that's fractions of a cent. Nothing here creates persistent billable resources, and exercise 1 will probably *save* you money.

### 1. Find the money leaking out of your log groups

```bash
export AWS_DEFAULT_REGION=us-east-1

echo "=== log groups with NO retention policy ==="
for region in us-east-1 us-west-2 eu-west-1; do
  aws logs describe-log-groups --region $region \
    --query "logGroups[?!not_null(retentionInDays)].{Name:logGroupName,Bytes:storedBytes}" \
    --output text 2>/dev/null | while read name bytes; do
      mb=$((bytes / 1048576))
      echo "$region  ${mb}MB  $name"
    done
done
```

**What to expect:** in a fresh account, a handful from the exercises in this guide. In any inherited account, frequently dozens or hundreds — including log groups for services deleted long ago.

**Why it's interesting:** every one of those has retention set to Never Expire, which is the default. They will bill you forever. This audit takes thirty seconds and is routinely the highest-value thing anyone does in a CloudWatch cost review.

Fix them (adjust the retention to taste):

```bash
aws logs describe-log-groups \
  --query "logGroups[?!not_null(retentionInDays)].logGroupName" --output text | \
while read lg; do
  echo "setting 30-day retention on $lg"
  aws logs put-retention-policy --log-group-name "$lg" --retention-in-days 30
done
```

**Cleanup:** none — this is the fix.

### 2. Build an alarm that stays silent while everything burns

```bash
aws cloudwatch put-metric-alarm \
  --alarm-name volume8-default-missing \
  --metric-name Errors --namespace AWS/Lambda \
  --dimensions Name=FunctionName,Value=a-function-that-does-not-exist \
  --statistic Sum --period 60 --evaluation-periods 2 \
  --threshold 1 --comparison-operator GreaterThanOrEqualToThreshold

aws cloudwatch put-metric-alarm \
  --alarm-name volume8-breaching-missing \
  --metric-name Errors --namespace AWS/Lambda \
  --dimensions Name=FunctionName,Value=a-function-that-does-not-exist \
  --statistic Sum --period 60 --evaluation-periods 2 \
  --threshold 1 --comparison-operator GreaterThanOrEqualToThreshold \
  --treat-missing-data breaching

sleep 180

aws cloudwatch describe-alarms \
  --alarm-names volume8-default-missing volume8-breaching-missing \
  --query "MetricAlarms[].{Name:AlarmName,State:StateValue,Missing:TreatMissingData}" \
  --output table
```

**What to expect:** the first sits in `INSUFFICIENT_DATA`. The second goes to `ALARM`.

**Why it's interesting:** both alarms watch a metric that will never have data — a service that is, in effect, completely dead. Only one of them tells you. The default is the quiet one. Now go and check your production alarms: any alarm on something that should *always* emit data, left on the default, will stay grey through a total outage.

**Cleanup:**
```bash
aws cloudwatch delete-alarms --alarm-names volume8-default-missing volume8-breaching-missing
```

### 3. Discover what CloudTrail isn't recording

```bash
echo "=== trails configured ==="
aws cloudtrail describe-trails \
  --query "trailList[].{Name:Name,Multiregion:IsMultiRegionTrail,Validation:LogFileValidationEnabled,Bucket:S3BucketName}" \
  --output table

echo "=== data event selectors (the important bit) ==="
for trail in $(aws cloudtrail describe-trails --query "trailList[].Name" --output text); do
  echo "--- $trail ---"
  aws cloudtrail get-event-selectors --trail-name "$trail" \
    --query "{Basic:EventSelectors,Advanced:AdvancedEventSelectors}" --output json
done
```

**What to expect:** either no trails at all, or trails whose event selectors show `DataResources` as an empty list.

Now prove the asymmetry. Generate one of each kind of event:

```bash
BUCKET="volume8-lab-$(aws sts get-caller-identity --query Account --output text)-$RANDOM"
aws s3api create-bucket --bucket $BUCKET
echo hello > /tmp/v8.txt
aws s3 cp /tmp/v8.txt s3://$BUCKET/v8.txt
aws s3 cp s3://$BUCKET/v8.txt /tmp/v8-back.txt

sleep 120

echo "=== searching event history for the bucket creation (management event) ==="
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=EventName,AttributeValue=CreateBucket \
  --max-results 5 \
  --query "Events[].{Time:EventTime,Name:EventName,User:Username}" --output table

echo "=== searching event history for the object read (data event) ==="
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=EventName,AttributeValue=GetObject \
  --max-results 5 \
  --query "Events[].{Time:EventTime,Name:EventName,User:Username}" --output table
```

**What to expect:** `CreateBucket` appears. `GetObject` almost certainly does not.

**Why it's interesting:** you just created a bucket, wrote to it, and read from it — and only the *creation* is in the record. That gap is the Capital One exfiltration. The attacker's reads would look exactly like your read: absent. Anyone investigating would see the role being assumed and nothing after it.

**Cleanup:**
```bash
aws s3 rb s3://$BUCKET --force
rm -f /tmp/v8.txt /tmp/v8-back.txt
```

### 4. Run a forensic query against yourself

If you have a CloudTrail trail delivering to CloudWatch Logs, query it. If not, query any log group you have — the Lambda logs from Volume 7 work if you recreate the function.

```bash
LOG_GROUP=$(aws logs describe-log-groups --query "logGroups[0].logGroupName" --output text)
echo "querying: $LOG_GROUP"

QUERY_ID=$(aws logs start-query \
  --log-group-name "$LOG_GROUP" \
  --start-time $(( $(date +%s) - 86400 )) \
  --end-time $(date +%s) \
  --query-string 'fields @timestamp, @message | sort @timestamp desc | limit 20' \
  --query queryId --output text)

sleep 12
aws logs get-query-results --query-id $QUERY_ID \
  --query "{Status:status,Scanned:statistics.recordsScanned,Matched:statistics.recordsMatched}" \
  --output table
```

**What to expect:** a status of `Complete` with counts of records scanned and matched.

**Why it's interesting:** note `recordsScanned`. **Logs Insights bills on bytes scanned**, and the time range is what determines that. A query over 90 days of a busy log group costs real money per execution. This is why retention policy, log group structure, and narrow time ranges are cost decisions and not just hygiene.

The query language is worth learning properly — `filter`, `stats`, `parse`, `sort` — because during an incident it's the difference between finding the answer in two minutes and grepping through downloaded files for an hour.

### 5. Price static stability for yourself

No resources created.

```bash
python3 - <<'EOF'
PEAK_LOAD = 600          # units of work at peak
PER_INSTANCE = 100       # what one instance handles
COST_PER_MONTH = 70      # approximate, per instance

print("Requirement: survive the loss of one Availability Zone\n")

for azs in (2, 3, 4):
    needed = PEAK_LOAD / PER_INSTANCE

    # Dynamic: size for normal load, scale on failure
    dyn = int(-(-needed // azs)) * azs
    dyn_surviving = dyn - (dyn // azs)
    dyn_util = PEAK_LOAD / (dyn_surviving * PER_INSTANCE) * 100

    # Static: size so surviving AZs alone carry peak
    per_az = int(-(-needed // (azs - 1)))
    stat = per_az * azs
    stat_surviving = stat - per_az
    stat_util = PEAK_LOAD / (stat_surviving * PER_INSTANCE) * 100

    print(f"{azs} AZs")
    print(f"  dynamic: {dyn:2d} instances  ${dyn*COST_PER_MONTH:5d}/mo  "
          f"-> {dyn_util:5.1f}% utilised after AZ loss  (needs control plane)")
    print(f"  static:  {stat:2d} instances  ${stat*COST_PER_MONTH:5d}/mo  "
          f"-> {stat_util:5.1f}% utilised after AZ loss  (needs nothing)")
    print(f"  premium: ${(stat-dyn)*COST_PER_MONTH}/mo\n")
EOF
```

**What to expect:** the static-stability premium **falls sharply as you add AZs**. Across two AZs it's expensive. Across three it's much more modest. Across four it's nearly free.

**Why it's interesting:** this is the actual argument for three AZs rather than two, and it's a cost argument as much as a reliability one. With two AZs, being statically stable means running each at 50% — you're paying for a whole spare copy. With four, you need roughly 33% headroom.

Now price your own workload, decide whether the premium is worth removing a control plane dependency during exactly the event where control planes fail, and **write the number down**. That's what an RTO conversation with a business stakeholder should look like.

**Cleanup:** none.

---

## What You Should Now Be Able To Say

- Why a metric dimensioned by user ID is a billing incident
- Why memory utilization doesn't appear in EC2 metrics by default
- Why the default log group retention is the most expensive default in AWS
- What an alarm does when its service dies completely, and how to fix that
- Which CloudTrail events are on by default and which cover an S3 exfiltration
- How you keep an audit record an attacker with admin access can't erase
- The difference between HA and DR, and why Multi-AZ doesn't protect you from a bad deployment
- What static stability costs, and why the premium drops with more AZs
- Why Chaos Monkey ran during business hours

---

## Where We Go Next

**Volume 9 — Cost and Control: Billing, Organizations, Infrastructure as Code.**

The two things that turn an AWS account into an AWS *practice*.

First, cost — properly this time. The billing model. Why data transfer is the tax nobody budgets for, with the cross-AZ and NAT charges from Volume 3 fully accounted. On-Demand versus Savings Plans versus Reserved Instances versus Spot, and what each actually commits you to. Tagging and cost allocation. Cost Explorer, budgets, and anomaly detection. Plus the Spot interruption notice as a design primitive rather than an inconvenience.

Then control. CloudFormation and its state model — what a stack actually is and what drift means. CDK. AWS Organizations, SCPs (Volume 2's explicit Deny, applied at account scale), and Control Tower landing zones. And Terraform, covered honestly as what it is: a third-party tool that most AWS teams actually use, not an AWS product — including the 2023 licence change that split the ecosystem.

---

*Volume 8 complete. Say **continue** when you're ready for Volume 9.*
