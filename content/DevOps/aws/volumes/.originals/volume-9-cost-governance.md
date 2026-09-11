---
id: cost-governance
title: "Volume 9 — Cost and Control: Billing, Organizations, Infrastructure as Code"
order: 9
description: Why data transfer is the tax nobody budgets for, what each commitment model actually commits you to, and how CloudFormation, Organizations and SCPs turn an account into a practice — plus the bill for an empty bucket and the licence change that split an ecosystem.
draft: false
---

# Mastering AWS: The Engineering, The History, The Incidents

## Volume 9 — Cost and Control: Billing, Organizations, Infrastructure as Code

---

## The Question This Volume Answers

Everything in this guide so far has been an engineering decision. This volume is about the two forces that turn those decisions into something an organization can actually operate.

**The first is money.** Not as an afterthought — as an architectural input. In a data center, cost is a capital expenditure negotiated once a year by someone else. In AWS, **every architectural choice has a price attached, continuously, and the person making the choice is usually the person who has no idea what it costs.**

That's genuinely new, and most engineers are never taught to read a bill.

**The second is control.** One account with one person clicking in the console is fine. Forty accounts with two hundred engineers is a different problem: who can do what, how does anything get reproduced, and what stops someone from doing something catastrophic at 4 PM on a Friday.

Four things to take away:

1. **Data transfer is the cost nobody budgets for**, because it's a property of paths and nothing in your diagram says "this arrow costs money."
2. **Commitment models trade flexibility for discount**, and choosing wrongly is expensive in both directions.
3. **Infrastructure as code is a disaster recovery requirement**, not a nicety — Volume 8 said this, and here's why.
4. **Multi-account is a blast radius decision** before it's an organizational one.

---

## Part One: Money

## THE PROBLEM: Nobody Can See the Price Tag

Here's the structural issue, and it isn't carelessness.

An engineer designs a system. Two services talk to each other. They draw a box, a box, and an arrow.

**Nothing on that diagram indicates that the arrow costs money.** But whether those two services sit in the same Availability Zone or different ones is the difference between free and roughly two cents per gigabyte in each direction — and at a terabyte a day, that's a meaningful monthly line item produced entirely by an invisible property of the drawing.

Compute is legible. An instance has a type and an hourly rate; you can look it up. **Data transfer is a property of paths**, and paths are implicit in architecture rather than declared.

Then add three compounding factors:

- **Billing data lags** by hours, so feedback is slow.
- **Costs are aggregated by service**, not by feature or team, so "why is our bill up 30%?" has no obvious answer.
- **Nothing degrades.** An expensive architecture performs exactly as well as a cheap one. There is no symptom.

That last point should feel familiar. It's the same structure as the over-permissive security group in Volume 3 and the missing log retention in Volume 8: **a bad state with no feedback loop.**

---

## THE MECHANISM: What Actually Costs Money

### The four categories

Almost every AWS charge falls into one of these:

1. **Compute time** — instance-hours, Lambda GB-seconds, Fargate vCPU-seconds
2. **Storage** — GB-months of EBS, S3, RDS storage, snapshots
3. **Requests** — API calls, S3 operations, Lambda invocations, CloudWatch metrics
4. **Data transfer** — bytes crossing a boundary

Most people budget for the first two. **Categories three and four are where the surprises live.**

### The data transfer map

Learn this table. It's the single highest-value thing in this volume.

| Path | Approximate cost |
|---|---|
| **Inbound from the internet** | **Free** |
| Outbound to the internet | ~$0.09/GB (tiered down at volume) |
| **Between AZs, same Region** | ~$0.01/GB **each direction** |
| Between Regions | ~$0.02/GB |
| **Within one AZ, via private IP** | **Free** |
| Within one AZ, via **public** IP | Charged as if it left |
| Through a NAT Gateway | ~$0.045/GB processed, **on top of** the above |
| Through an interface VPC endpoint | ~$0.01/GB |
| Through Transit Gateway | ~$0.02/GB |
| **S3/DynamoDB via gateway endpoint** | **Free** |
| S3 or EC2 origin → CloudFront | Free |

*(Rates vary by Region and change over time. Verify against current pricing pages before making a decision on the strength of a number.)*

**Three things in that table deserve emphasis.**

**Cross-AZ is charged in both directions.** A service in AZ-a calling a service in AZ-b pays on the request and on the response. The effective round-trip rate is roughly double the headline number. For a chatty microservice architecture spread across three AZs for resilience, this is a real and continuous tax — and it's the direct cost of the static stability you bought in Volume 8. Worth it, usually. Worth *knowing about*, always.

**Using a public IP inside your own VPC costs money.** If service A reaches service B by its public DNS name rather than its private one, the traffic is billed as though it left AWS. This happens constantly with hardcoded endpoints and misconfigured service discovery. Use private IPs and private DNS.

**Inbound is free.** This is why AWS is cheap to get into and expensive to get out of, and why "egress fees" have become a regulatory topic. It's a real strategic property of the pricing model, not an accident.

### The request charges people forget

- **S3 requests** — PUT/COPY/POST/LIST are charged at a higher rate than GET. A workload doing millions of small PUTs can pay more in requests than in storage.
- **CloudWatch custom metrics** — roughly $0.30 per metric per month, and a high-cardinality dimension multiplies that (Volume 8).
- **CloudWatch Logs ingestion** — roughly $0.50/GB (Volume 8).
- **Secrets Manager** — per-secret monthly plus per-API-call. Fetching a secret on every Lambda invocation at scale adds up (Volume 2).
- **KMS** — per-key monthly plus per-request. A high-throughput encryption workload generates a lot of requests.
- **NAT Gateway hours** — roughly $32/month per gateway, before any data (Volume 3).
- **EKS control plane** — roughly $73/month per cluster, before any nodes (Volume 7).

---

## THE MECHANISM: Commitment Models

You can pay substantially less than On-Demand by committing. The models differ in what you commit *to*, and that's the whole decision.

### On-Demand

No commitment, highest rate. Correct for unpredictable workloads, short experiments, and anything you might turn off.

### Savings Plans (2019)

**You commit to a dollar amount per hour for 1 or 3 years.** Not to an instance type. Not to a Region necessarily. To spend.

Two relevant kinds:

**Compute Savings Plans** — the flexible one. Applies to EC2, Fargate, **and Lambda**, across any Region, any instance family, any OS, any tenancy. Discounts up to roughly 66%.

**EC2 Instance Savings Plans** — locked to an instance family in a Region, but you can change size, OS, and tenancy within that. Discounts up to roughly 72%.

**Payment options:** No Upfront, Partial Upfront, All Upfront — more upfront means a better rate.

### Reserved Instances

The older model. You commit to a specific instance configuration.

- **Standard RIs** — deepest discount (up to ~72%), least flexible, can't change family
- **Convertible RIs** — up to ~54%, exchangeable for different configurations
- **Regional vs Zonal** — a zonal RI also gives you a **capacity reservation** in that specific AZ, which is the one thing Savings Plans don't provide

**The practical guidance today:** for EC2, Fargate, and Lambda, **Savings Plans are generally the better instrument** — comparable discount, far more flexibility, less administrative work.

**But RIs are still required elsewhere.** RDS, ElastiCache, Redshift, and OpenSearch have their own reserved-node models and are **not covered by Savings Plans**. A team that buys a Compute Savings Plan and assumes their database is covered has a surprise coming.

### Spot — up to 90% off, with a catch

Spot instances use AWS's spare capacity at a steep discount. AWS can reclaim them at any time, **with a two-minute warning**.

A common misconception: Spot is no longer a bidding auction. AWS moved to smoothed, predictable pricing in 2017. You don't bid; you get a price that moves gradually with supply and demand.

**Use Spot for:** batch processing, CI/CD runners, data pipelines, stateless web tiers behind a load balancer, anything that can checkpoint or be retried.

**Don't use Spot for:** databases, stateful singletons, anything where a two-minute eviction means data loss.

### The two-minute notice as a design primitive

This is the part worth internalizing, because it generalizes well beyond Spot.

Your instance receives an interruption notice via the metadata service (Volume 2 — the same `169.254.169.254`) two minutes before reclamation. A poll looks like this:

```bash
TOKEN=$(curl -sX PUT "http://169.254.169.254/latest/api/token" \
  -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")

curl -s -H "X-aws-ec2-metadata-token: $TOKEN" \
  http://169.254.169.254/latest/meta-data/spot/instance-action
```

Empty means you're fine. A JSON response with an action and a time means you have two minutes.

**Two minutes is enough to:**

- Deregister from a load balancer target group and drain connections (Volume 4)
- Finish the in-flight request and refuse new ones
- Checkpoint work in progress to S3
- Return a queue message so another worker picks it up
- Flush buffers and close cleanly

And here's the general lesson: **a system that handles Spot interruption gracefully handles almost every other kind of instance loss gracefully too.** Hardware failure, AZ event, scaling down, a deployment replacing instances — all the same shape, and Spot gives you a warning the others don't.

Building for Spot makes you resilient *and* cheaper, which is an unusually good deal. It's Volume 8's chaos engineering argument with a discount attached.

**Allocation strategies matter.** `capacity-optimized` asks AWS to draw from the deepest pools, meaning fewer interruptions than chasing the lowest price. Diversify across instance types and AZs so no single pool's exhaustion takes out your fleet.

---

## THE MECHANISM: Seeing the Bill

### The tools

**Cost Explorer** — the visual and API interface. Group by service, account, Region, usage type, or tag. **Note that the Cost Explorer API charges roughly $0.01 per request** — negligible for humans, meaningful for a dashboard polling every minute.

**AWS Budgets** — thresholds with alerts. You created one in Volume 1, step 4. Budgets can also trigger actions, like applying a restrictive IAM policy when a threshold is crossed.

**Cost Anomaly Detection** — machine learning over your spending patterns, alerting on unusual changes. This is the tool that catches a runaway Lambda loop (Volume 7) faster than a monthly budget will, because it's looking for *change* rather than an absolute number. Turn it on.

**Cost and Usage Report (CUR)** — the complete, line-item-level dataset delivered to S3. Every charge, every resource, hourly. This is what you query when you need real answers.

**Compute Optimizer** — recommends right-sizing based on observed utilization.

**Trusted Advisor** — checks across cost, security, and fault tolerance. The full check set requires Business support or above.

### Tagging, and the trap

Cost allocation tags let you attribute spend to teams, environments, and projects. Apply a `Team` tag, activate it in the billing console, and Cost Explorer can group by it.

**The trap: activating a cost allocation tag is not retroactive.** It applies from activation forward. Realize in November that you need per-team costs and you cannot get them for January.

**So: decide your tagging scheme early and activate the tags immediately**, even before you need them. A reasonable minimum:

```text
Environment   prod | staging | dev
Team          owning team
Project       what this belongs to
ManagedBy     terraform | cloudformation | manual
CostCenter    for finance
```

`ManagedBy` is the one people skip and shouldn't — it tells you instantly whether a resource is reproducible or was hand-made by someone who has since left.

**Tag policies** in AWS Organizations enforce consistent tag keys and values, which is what stops you ending up with `team`, `Team`, `TEAM`, and `owner` all meaning the same thing.

---

## REAL INCIDENT: The Bill for an Empty Bucket

### What happened

In April 2024, a developer named Maciej Pocwierz published an account of something genuinely strange.

He created a single empty S3 bucket for a proof of concept. Uploaded nothing. Within a day, his bill showed charges of roughly **1,300 US dollars**.

The cause: the bucket had received on the order of **100 million PUT requests** — from strangers.

An open-source tool had shipped with a configuration where the bucket name defaulted to a placeholder resembling the one he'd chosen. Every installation of that tool, worldwide, was attempting to write backup data to that bucket name. All of those requests failed with access denied.

**And at the time, AWS charged for them anyway.** Unauthorized requests — requests from accounts with no permission at all, returning HTTP 403 — were billed to the bucket owner.

The implication people immediately drew was uncomfortable: if you knew someone's bucket name, you could generate cost for them by sending requests you knew would be rejected. Not an attack requiring any access. Just volume.

### How AWS responded

To their credit, quickly. In May 2024 AWS announced a billing change: **unauthorized requests from accounts that don't own the bucket are no longer charged to the bucket owner.** The loophole was closed.

*Accuracy note: I'm confident about the shape and timing of this — the blog post and AWS's subsequent policy change were both widely covered. Treat my specific figures as close-but-approximate rather than exact.*

### What it teaches

**Cost is an attack surface.** Most security thinking is about confidentiality, integrity, and availability. There's a fourth axis: an attacker who can make you *spend money* has caused harm without accessing anything. Denial of wallet is a real category.

**Request charges are invisible until they aren't.** He stored zero bytes. The entire bill was requests against a resource containing nothing. If your cost model is "storage plus compute," you cannot predict this.

**Global namespaces have consequences.** Volume 5 noted that S3 bucket names are globally unique across every AWS account. That design decision is exactly why a third party's default configuration could target *his* bucket. Predictable bucket names are a mild liability; add a random suffix.

**Set budget alarms at low thresholds.** He found out because of a bill, and that's the slow path. A 10 USD budget alarm — Volume 1, step 4 — would have caught it within hours. Cost Anomaly Detection would have too.

### The wider genre

This one is documented and unusual. The common versions are duller and far more frequent:

- The forgotten NAT Gateway in a Region nobody uses, at $32/month, for three years
- The recursive Lambda from Volume 7
- The GPU instance spun up for one experiment and never terminated
- Snapshots accumulating with no lifecycle policy
- CloudWatch Logs with no retention (Volume 8)
- The dev environment nobody turns off at night or at weekends

**The pattern is always the same: there is no symptom.** Nothing breaks. Nothing slows down. Which is why cost management has to be a *scheduled activity* rather than a reactive one. Put a monthly review in the calendar.

---

## Part Two: Control

## THE PROBLEM: Click-Ops Doesn't Survive Contact With Reality

Everything you've built in this guide, you built by hand. That's correct for learning and catastrophic for production.

**Why manual infrastructure fails:**

**It isn't reproducible.** "Rebuild this in eu-west-1" becomes an archaeology project. Volume 8's backup-and-restore strategy requires provisioning infrastructure in another Region during a disaster — if that infrastructure only exists as a memory of clicking, you don't have a DR plan.

**There's no review.** A code change gets a pull request. A console change gets nothing. The most consequential changes in your system are the least reviewed.

**There's no history.** CloudTrail tells you *that* a security group changed. It doesn't tell you why, or what the intended state was.

**Environments drift.** Staging and production start identical and diverge invisibly, one urgent fix at a time, until "it worked in staging" stops meaning anything.

**Knowledge leaves.** The person who built it knows why that parameter is set that way. Then they get a new job.

---

## THE MECHANISM: CloudFormation

AWS's native infrastructure-as-code service, and the foundation under several others.

### The model

You write a **template** (YAML or JSON) describing resources. You create a **stack** from it. CloudFormation figures out the dependency order, creates everything, and **tracks the stack's state**.

```yaml
AWSTemplateFormatVersion: '2010-09-09'
Description: Minimal example

Parameters:
  BucketSuffix:
    Type: String
    Description: Unique suffix for the bucket name

Resources:
  DataBucket:
    Type: AWS::S3::Bucket
    DeletionPolicy: Retain
    Properties:
      BucketName: !Sub 'my-data-${BucketSuffix}'
      VersioningConfiguration:
        Status: Enabled

  BucketTopic:
    Type: AWS::SNS::Topic
    Properties:
      DisplayName: !Sub 'notifications-${BucketSuffix}'

Outputs:
  BucketArn:
    Value: !GetAtt DataBucket.Arn
    Export:
      Name: !Sub '${AWS::StackName}-BucketArn'
```

**The stack is the unit of management.** Update the template and CloudFormation computes the difference and applies it. Delete the stack and it removes everything in dependency order.

### The features that matter

**Change sets** — compute what an update *would* do before doing it. This is CloudFormation's equivalent of `terraform plan`, and skipping it on production is how people discover that a change they thought was in-place actually requires resource replacement.

**Drift detection** — compares actual resource configuration against the template. It finds the security group rule someone added in the console at 2 AM during an incident. Drift is inevitable; **the problem isn't that drift happens, it's that nobody looks**.

**Deletion policies** — `Retain`, `Snapshot`, or `Delete`. Put `Retain` on your database and your S3 buckets. This is the setting that separates "we deleted a stack by accident" from "we deleted our data by accident."

**Stack policies** — deny updates to specific resources within a stack, so a template change can't accidentally replace your production database.

**StackSets** — deploy one template across many accounts and Regions at once. This is how you roll out baseline configuration across an organization.

**Resource import** — bring existing hand-made resources under management without recreating them. This is your migration path out of click-ops.

### The pain points, honestly

**`UPDATE_ROLLBACK_FAILED`.** An update fails, CloudFormation tries to roll back, the rollback also fails, and the stack is stuck in a state where you can't update or delete it. Recovery involves `continue-update-rollback` with resources to skip, and it is genuinely unpleasant. It usually happens because something was changed outside CloudFormation — drift causing the rollback to reference a state that no longer exists.

**Templates get long.** A serious template is thousands of lines of YAML with limited abstraction. Nested stacks help. This verbosity is precisely what CDK and Terraform exist to address.

**Not everything is supported immediately.** New AWS features sometimes reach the console and API before CloudFormation.

### CDK

The **AWS Cloud Development Kit** lets you define infrastructure in TypeScript, Python, Java, Go, or C#. It **synthesizes CloudFormation templates** — it's a higher-level authoring layer over the same engine.

The value is real abstraction: loops, conditionals, functions, classes, unit tests, and IDE completion. Its **L2 and L3 constructs** encode sensible defaults, so `new s3.Bucket(this, 'Data', { versioned: true })` produces a bucket with encryption and Block Public Access already configured.

The trade-off: you're now debugging generated CloudFormation, and the abstraction can hide what's actually being created until it surprises you.

---

## THE MECHANISM: Terraform — and Being Precise About What It Is

**Terraform is not an AWS product.** It's made by HashiCorp, it's the most widely used infrastructure-as-code tool for AWS, and most teams you join will be using it rather than CloudFormation.

That combination — third-party, dominant — is exactly the kind of thing casual explanations blur, so let's be exact.

### How it differs from CloudFormation

**State is a file, not a service.** Terraform maintains a state file mapping your configuration to real resources. CloudFormation keeps this inside AWS; Terraform's is yours to manage, typically in S3 with locking (historically via a DynamoDB table; S3 now supports native locking).

**That state file is sensitive and critical.** It can contain secrets in plaintext. Lose it and Terraform no longer knows what it manages. Corrupt it and you're doing surgery.

**It's multi-cloud.** One tool and one language for AWS, Azure, GCP, Cloudflare, GitHub, Datadog, and hundreds of other providers. For an organization spanning several vendors, this is the argument.

**`terraform plan` is excellent**, and it's the feature most people cite. A clear, readable diff before you apply anything.

**Modules** provide real reuse with versioning, and the public registry is large.

### The 2023 licence change, and the fork

Here's the community design fight worth knowing about, because it's recent and it changed the landscape.

**In August 2023, HashiCorp changed Terraform's licence** from the Mozilla Public License 2.0 — a permissive open source licence — to the **Business Source License 1.1**. BUSL is a source-available licence that restricts commercial use competing with the licensor, converting to an open licence after a delay.

The immediate practical effect was limited for most users. The reaction from the ecosystem was not.

A substantial part of the community argued that a tool this foundational, built on years of community contribution, shouldn't have its terms changed unilaterally. Within weeks a fork was announced, and it became **OpenTofu**, which was accepted by the **Linux Foundation** in September 2023 and continues under an open licence.

So the ecosystem now has two largely compatible tools with different governance. Organizations have made different choices, and both are in production use.

**Then, in a development that surprised many:** IBM announced its acquisition of HashiCorp in 2024, and the deal completed in 2025.

*This is the most time-sensitive material in the entire guide.* The competitive and governance landscape here is actively moving. **Verify the current state against primary sources before making a decision on it.**

**The durable lesson**, independent of the outcome: your infrastructure tooling has a governance model, and governance models can change. It's worth knowing who controls the tools you depend on, and what your options are if the terms change.

### Which should you use?

**CloudFormation or CDK when:** you're AWS-only, you want AWS to manage state, you need StackSets across an organization, or you want first-party support.

**Terraform or OpenTofu when:** you're multi-cloud, your team already knows it, you want the module ecosystem, or you want a tool that isn't tied to one vendor.

**Honestly: the tool matters far less than using one at all.** The gap between hand-clicked infrastructure and any IaC tool is enormous. The gap between two IaC tools is a preference.

---

## THE MECHANISM: Organizations and SCPs

### Why multiple accounts

The instinct is one account with tidy IAM. That's wrong, for four concrete reasons:

**Blast radius.** An account is the strongest isolation boundary AWS offers — stronger than a VPC, stronger than an IAM policy. A mistake in a dev account cannot touch production if production is a different account.

**Service quotas are per-account.** Lambda concurrency (Volume 7), EC2 instance limits, VPC counts — all per-account. A runaway dev workload consuming the concurrency pool can starve production if they share an account.

**Billing clarity.** Per-account costs need no tagging discipline to attribute. This alone converts endless arguments into a report.

**Security boundaries.** An auditor with read access to the log archive account gets nothing else. Compliance scope can be confined to one account.

**AWS Organizations** (2017) provides a **management (payer) account**, member accounts, and **organizational units** for grouping. Billing consolidates, volume discounts aggregate across the whole organization, and Savings Plans and RIs can be shared between accounts.

### SCPs — Volume 2's explicit Deny at account scale

A **Service Control Policy** is a permission ceiling attached to an OU or an account.

**SCPs do not grant anything.** They define the maximum. A principal's effective permissions are the intersection of their IAM policies and every SCP above them.

This is precisely Volume 2's evaluation algorithm, applied one level up. And it's where explicit Deny earns its keep:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyRegionsOutsideApproved",
      "Effect": "Deny",
      "NotAction": [
        "iam:*", "sts:*", "cloudfront:*", "route53:*",
        "support:*", "organizations:*", "budgets:*"
      ],
      "Resource": "*",
      "Condition": {
        "StringNotEquals": {
          "aws:RequestedRegion": ["us-east-1", "eu-west-1"]
        }
      }
    }
  ]
}
```

That denies operations outside two Regions — while exempting the global services whose control planes live in us-east-1 (Volume 1), because forgetting that exemption breaks IAM for the whole account. It's a small policy that eliminates an entire class of problem: resources created in a Region nobody monitors, by someone who left the console's Region selector on a default.

**Common SCP guardrails:**

- Deny leaving the organization or disabling CloudTrail, Config, or GuardDuty
- Deny deleting or modifying specific security roles
- Deny disabling S3 Block Public Access (Volume 5)
- Restrict which Regions can be used
- Require IMDSv2 on instance launch (Volume 2)

**Two things to know:** SCPs do **not** apply to the management account — so don't run workloads there. And an SCP that's too strict breaks things in ways that are hard to diagnose, because the error is an ordinary `AccessDenied` with no hint that an SCP caused it. Test in a non-production OU first.

**AWS Control Tower** automates the setup: a landing zone with a log archive account, an audit account, baseline SCPs, and an Account Factory for provisioning new accounts consistently.

---

## TRY THIS ON YOUR MACHINE

All five are **free or effectively free**. Cost Explorer API calls are about $0.01 each — you'll make a handful. CloudFormation itself is free; the exercises create an S3 bucket and an SNS topic, both negligible. Teardown at the end.

### 1. Find out where your money actually goes

```bash
export AWS_DEFAULT_REGION=us-east-1
START=$(date -u -d '30 days ago' +%Y-%m-%d 2>/dev/null || date -u -v-30d +%Y-%m-%d)
END=$(date -u +%Y-%m-%d)

aws ce get-cost-and-usage \
  --time-period Start=$START,End=$END \
  --granularity MONTHLY --metrics UnblendedCost \
  --group-by Type=DIMENSION,Key=SERVICE \
  --query "ResultsByTime[].Groups[?Metrics.UnblendedCost.Amount>'0.001'].{Service:Keys[0],Cost:Metrics.UnblendedCost.Amount}" \
  --output table
```

**What to expect:** a service-by-service breakdown. On a learning account, small numbers — but the *shape* is what matters.

**Why it's interesting:** this is the view that actually answers "what am I paying for." Note what appears that you didn't expect. On most real accounts, at least one line is something nobody remembers creating.

### 2. Isolate the invisible tax

```bash
aws ce get-cost-and-usage \
  --time-period Start=$START,End=$END \
  --granularity MONTHLY --metrics UnblendedCost UsageQuantity \
  --group-by Type=DIMENSION,Key=USAGE_TYPE \
  --filter '{"Dimensions":{"Key":"USAGE_TYPE_GROUP","Values":["EC2: Data Transfer - Internet (Out)","EC2: Data Transfer - Inter AZ"]}}' \
  --query "ResultsByTime[].Groups[].{Type:Keys[0],Cost:Metrics.UnblendedCost.Amount,GB:Metrics.UsageQuantity.Amount}" \
  --output table 2>/dev/null || echo "no data transfer charges in this period"
```

**What to expect:** on a learning account, probably nothing. On a production account, often a genuinely surprising number.

**Why it's interesting:** `USAGE_TYPE` is where data transfer becomes visible, and it's the dimension almost nobody groups by. Line items containing `DataTransfer-Regional-Bytes` are cross-AZ traffic — the tax on the multi-AZ resilience from Volume 8. Seeing it as a number changes how you think about service placement.

Try the unfiltered version to see every usage type you generate:

```bash
aws ce get-cost-and-usage \
  --time-period Start=$START,End=$END \
  --granularity MONTHLY --metrics UnblendedCost \
  --group-by Type=DIMENSION,Key=USAGE_TYPE \
  --query "ResultsByTime[].Groups[?Metrics.UnblendedCost.Amount>'0.0001'].{Type:Keys[0],Cost:Metrics.UnblendedCost.Amount}" \
  --output table
```

### 3. Build a stack, then break it behind CloudFormation's back

```bash
SUFFIX=$(aws sts get-caller-identity --query Account --output text)-$RANDOM

cat > /tmp/v9-stack.yaml <<'EOF'
AWSTemplateFormatVersion: '2010-09-09'
Description: Volume 9 drift demo

Parameters:
  Suffix:
    Type: String

Resources:
  DemoTopic:
    Type: AWS::SNS::Topic
    Properties:
      DisplayName: !Sub 'volume9-${Suffix}'
      Tags:
        - Key: ManagedBy
          Value: cloudformation
        - Key: Environment
          Value: lab

Outputs:
  TopicArn:
    Value: !Ref DemoTopic
EOF

aws cloudformation create-stack --stack-name volume9-lab \
  --template-body file:///tmp/v9-stack.yaml \
  --parameters ParameterKey=Suffix,ParameterValue=$SUFFIX

aws cloudformation wait stack-create-complete --stack-name volume9-lab

TOPIC=$(aws cloudformation describe-stacks --stack-name volume9-lab \
  --query "Stacks[0].Outputs[0].OutputValue" --output text)
echo "Topic: $TOPIC"
```

Now change it in a way CloudFormation doesn't know about — simulating the 2 AM console fix:

```bash
aws sns set-topic-attributes --topic-arn $TOPIC \
  --attribute-name DisplayName --attribute-value "changed-by-hand"

DRIFT_ID=$(aws cloudformation detect-stack-drift --stack-name volume9-lab \
  --query StackDriftDetectionId --output text)

sleep 20
aws cloudformation describe-stack-resource-drifts --stack-name volume9-lab \
  --query "StackResourceDrifts[].{Resource:LogicalResourceId,Status:StackResourceDriftStatus,Diffs:PropertyDifferences[].PropertyPath}" \
  --output json
```

**What to expect:** a drift status of `MODIFIED` with the changed property identified.

**Why it's interesting:** CloudFormation found a change nobody recorded. **Drift is inevitable** — emergencies happen and people click. The failure isn't that drift occurs; it's that nobody runs detection, so the template and reality diverge silently until an update fails with `UPDATE_ROLLBACK_FAILED` because the rollback references a state that no longer exists. Run drift detection on a schedule.

### 4. See a change before you make it

```bash
cat > /tmp/v9-stack-v2.yaml <<'EOF'
AWSTemplateFormatVersion: '2010-09-09'
Description: Volume 9 drift demo

Parameters:
  Suffix:
    Type: String

Resources:
  DemoTopic:
    Type: AWS::SNS::Topic
    Properties:
      DisplayName: !Sub 'volume9-${Suffix}'
      Tags:
        - Key: ManagedBy
          Value: cloudformation
        - Key: Environment
          Value: lab

  DemoQueue:
    Type: AWS::SQS::Queue
    Properties:
      QueueName: !Sub 'volume9-queue-${Suffix}'
      MessageRetentionPeriod: 3600

Outputs:
  TopicArn:
    Value: !Ref DemoTopic
EOF

aws cloudformation create-change-set --stack-name volume9-lab \
  --change-set-name add-a-queue \
  --template-body file:///tmp/v9-stack-v2.yaml \
  --parameters ParameterKey=Suffix,ParameterValue=$SUFFIX

sleep 15
aws cloudformation describe-change-set --stack-name volume9-lab \
  --change-set-name add-a-queue \
  --query "Changes[].ResourceChange.{Action:Action,Resource:LogicalResourceId,Type:ResourceType,Replacement:Replacement}" \
  --output table
```

**What to expect:** one `Add` for the queue, and the existing topic either absent or listed with `Replacement: False`.

**Why it's interesting:** the **`Replacement`** column is the one to read. `True` means CloudFormation will **destroy and recreate** the resource — and on a database or a stateful resource, that is a data-loss event dressed up as a configuration change. A change set takes fifteen seconds and is the difference between knowing and finding out.

You can execute it or abandon it. Abandoning is fine:

```bash
aws cloudformation delete-change-set --stack-name volume9-lab --change-set-name add-a-queue
```

### 5. Check your governance posture

```bash
echo "=== Organizations ==="
aws organizations describe-organization \
  --query "Organization.{Id:Id,Master:MasterAccountId,Features:FeatureSet}" \
  --output table 2>/dev/null || echo "not part of an organization (normal for a solo account)"

echo "=== Cost anomaly monitors ==="
aws ce get-anomaly-monitors \
  --query "AnomalyMonitors[].{Name:MonitorName,Type:MonitorType}" \
  --output table 2>/dev/null || echo "no anomaly detection configured"

echo "=== Budgets ==="
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
aws budgets describe-budgets --account-id $ACCOUNT \
  --query "Budgets[].{Name:BudgetName,Limit:BudgetLimit.Amount,Unit:BudgetLimit.Unit}" \
  --output table 2>/dev/null || echo "NO BUDGETS - go back to Volume 1 step 4"

echo "=== Some service quotas that bite ==="
aws service-quotas get-service-quota --service-code lambda \
  --quota-code L-B99A9384 --query "Quota.{Name:QuotaName,Value:Value}" --output table 2>/dev/null
aws service-quotas get-service-quota --service-code vpc \
  --quota-code L-F678F1CE --query "Quota.{Name:QuotaName,Value:Value}" --output table 2>/dev/null
```

**What to expect:** no organization on a solo account, your budget from Volume 1, and a couple of quota values — Lambda concurrent executions (the 1,000 from Volume 7) and VPCs per Region.

**Why it's interesting:** those quotas are **per account**, which is the concrete argument for multi-account from earlier in this volume. If you and a noisy dev workload share an account, you share that Lambda concurrency pool — and Volume 7 showed you exactly what happens next.

If anomaly detection shows nothing, set it up. It's free, and it's the tool that catches a runaway loop in hours rather than at month end.

**Cleanup:** none — read-only.

### Teardown

```bash
aws cloudformation delete-stack --stack-name volume9-lab
aws cloudformation wait stack-delete-complete --stack-name volume9-lab
rm -f /tmp/v9-stack.yaml /tmp/v9-stack-v2.yaml

echo "remaining stacks:"
aws cloudformation list-stacks \
  --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE \
  --query "StackSummaries[].StackName" --output text
```

Note how much easier that was than the manual teardowns in Volumes 3, 4, and 6. **One command removed everything in the correct dependency order.** That convenience is the smallest benefit of infrastructure as code and the most immediately obvious one.

---

## What You Should Now Be Able To Say

- The four cost categories, and which two produce the surprises
- Why cross-AZ traffic costs roughly double the headline rate
- Why using a public IP inside your own VPC costs money
- What a Savings Plan commits you to, and which services it doesn't cover
- Why building for Spot interruption makes you resilient to everything else
- Why cost allocation tags must be activated before you need them
- Why an attacker who can only make you spend money has still caused harm
- What `Replacement: True` in a change set means for a database
- Why drift detection matters more than preventing drift
- Why service quotas are the concrete argument for multiple accounts
- Who owns Terraform, and why that turned out to matter

---

## Where We Go Next

**Volume 10 — Epilogue: Where AWS Sits Now.**

The last one. Where AWS sits in the current landscape — flagged as time-sensitive, because that section will age faster than anything else in this guide. A branching "what next" menu keyed to whichever volume you found most interesting, because the honest answer to "what should I learn next" depends entirely on that. A career map that treats certifications honestly rather than as a sales pitch. And a closing reflection on what you've actually built here.

---

*Volume 9 complete. Say **continue** for the epilogue.*
