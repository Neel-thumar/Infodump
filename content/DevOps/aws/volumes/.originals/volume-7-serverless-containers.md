---
id: serverless-containers
title: "Volume 7 — Compute Without Instances: Lambda, ECR, ECS, EKS"
order: 7
description: Firecracker microVMs, what actually causes cold starts, concurrency limits as an outage mechanism, and an honest accounting of which parts of AWS containers are AWS's — anchored on the recursive trigger and Log4Shell.
draft: false
---

# Mastering AWS: The Engineering, The History, The Incidents

## Volume 7 — Compute Without Instances: Lambda, ECR, ECS, EKS

---

## The Question This Volume Answers

Everything so far has been about provisioning: instances, volumes, load balancers, database instances. You decide how much, you pay for it, it sits there.

**Now: what if you didn't have to decide?**

Upload some code. It runs when something happens. You pay for the milliseconds it ran and nothing else. At three in the morning, when nobody is using your application, you pay zero.

That proposition — Lambda's, announced at re:Invent in November 2014 — required AWS to solve a problem that had defeated the industry: **how do you run untrusted code from thousands of different customers on the same physical machine, safely, with startup times measured in milliseconds?**

Containers are fast but share a kernel. Virtual machines are isolated but slow to boot. For a decade that was the trade. AWS's answer to it is one of the more interesting pieces of systems engineering of the last ten years, and it's now running underneath more of AWS than most people realize.

Four things to take away:

1. **Firecracker dissolved the container-versus-VM trade-off**, and understanding it explains Lambda's pricing, its limits, and its cold starts.
2. **Cold starts are five distinct phases**, and only some of them are your problem.
3. **Concurrency limits are an outage mechanism**, not just a billing control.
4. **"AWS containers" is three different things**, two of which AWS didn't build.

---

## Part One: Lambda

## THE PROBLEM: Isolation Was Either Safe or Fast

Think about what AWS needs for a function service.

Thousands of customers, arbitrary code, running on shared hardware. Function A must not read function B's memory, see its network traffic, or escape to the host. And a function that hasn't run in an hour must start in *milliseconds*, because a user is waiting on an HTTP request.

### Containers: fast, insufficiently isolated

A container is a process with namespaces and cgroups applied. It starts in milliseconds because it's just a process.

But **it shares the host kernel.** The isolation boundary is the kernel's own security model — namespaces, seccomp, capabilities. That's a very large, very complex boundary, and kernel vulnerabilities that allow container escape appear regularly.

For your own workloads on your own hosts, that's usually acceptable. For **arbitrary code from anonymous customers with a credit card**, sharing a kernel is not a risk AWS can take.

### Virtual machines: isolated, too slow

A VM has its own kernel. The boundary is the hypervisor — a far smaller, more defensible surface.

But a conventional VM emulates a whole computer: BIOS, PCI bus, legacy devices, a full device model. Boot takes seconds, sometimes tens of seconds, and each VM carries hundreds of megabytes of overhead. You cannot run thousands per host, and you certainly can't start one inside a user's HTTP request.

### What Lambda did first

Early Lambda ran on EC2 instances, with containers providing per-function separation and **whole instances dedicated per customer** to get the security boundary.

That works and it's wasteful. A customer with one small function occupies capacity sized for a whole instance. Density is poor, and poor density in a service priced per millisecond is an economics problem.

---

## THE MECHANISM: Firecracker

At re:Invent in November 2018, AWS announced **Firecracker** and open-sourced it under Apache 2.0.

The insight: a VM is slow because it pretends to be a *computer*. But a function doesn't need a BIOS, a PCI bus, a floppy controller, a VGA adapter, or USB. It needs a CPU, some memory, a network interface, and a block device.

So Firecracker is a **virtual machine monitor with almost no device model**. Built on KVM, written in Rust, deliberately minimal:

- Boots a microVM in around **125 milliseconds**
- Roughly **5 MB of memory overhead** per microVM
- Thousands of microVMs per host
- A tiny attack surface — dramatically less code than a general-purpose hypervisor

**You get VM-grade isolation at container-grade speed and density.** The trade-off that had defined the industry stopped being a trade-off.

The design principle is worth stealing: *the general-purpose thing is slow because it's general-purpose. If you know your workload, remove everything it doesn't need.* This is the same move as Nitro in Volume 4 (strip the hypervisor to nothing by moving I/O to cards) and Aurora in Volume 6 (stop shipping pages, ship only the log).

Firecracker now underpins Lambda **and** Fargate. It's also used outside AWS — which is what open-sourcing it was for.

---

## THE MECHANISM: The Execution Model

### Invocation types

**Synchronous** — the caller waits. API Gateway, ALB, direct SDK calls. Errors return to the caller, who decides what to do. Payload up to 6 MB.

**Asynchronous** — Lambda queues the event and returns immediately. S3 events, SNS, EventBridge. Payload up to 256 KB. **Lambda retries failures automatically** — twice by default, so three attempts total — then sends the event to a dead-letter queue or an on-failure destination if you've configured one. If you haven't, the event is silently dropped.

**Poll-based** — Lambda polls the source and invokes with batches. SQS, Kinesis, DynamoDB Streams. Retry behaviour is the source's, not Lambda's, and differs significantly between them.

**The retry behaviour is the part people get wrong.** A function that isn't idempotent, invoked asynchronously, will process the same event up to three times on failure. If it charges a credit card, it may charge three times. Idempotency is not optional in an async Lambda.

### The limits, and what they mean

| Limit | Value | Why it matters |
|---|---|---|
| Timeout | 15 minutes max | Not a batch processing platform |
| Memory | 128 MB – 10,240 MB | **Also sets CPU** — see below |
| `/tmp` | 512 MB – 10,240 MB | Ephemeral, per execution environment |
| Sync payload | 6 MB | Big payloads go via S3 |
| Async payload | 256 KB | Smaller than you'd think |
| Zipped package | 50 MB direct upload | 250 MB unzipped |
| Container image | 10 GB | The escape hatch for large dependencies |

**The memory setting is the most misunderstood control in Lambda.** It does not only allocate memory. **CPU is allocated proportionally.** At roughly 1,769 MB you get the equivalent of one full vCPU; below that, a fraction; above, more than one.

The counterintuitive consequence: **increasing memory often reduces cost.** A CPU-bound function at 512 MB running for 4 seconds may run in 1 second at 2,048 MB. You pay for GB-seconds, so:

```text
512 MB  × 4.0s  =  2,048 MB-seconds
2048 MB × 1.0s  =  2,048 MB-seconds
```

The same price — and four times faster. Often it's cheaper outright, because the speedup is more than linear once you cross the one-vCPU threshold. Almost nobody tunes this, and it's one of the easiest wins available.

---

## THE MECHANISM: Cold Starts, Properly Understood

"Cold start" gets used as one word for five distinct things. Separating them tells you which ones you can fix.

### The phases

**1. Download the code.** Lambda fetches your deployment package or container image. Proportional to size. A 250 MB package costs more here than a 5 MB one.

**2. Start the microVM.** Firecracker boots. ~125 ms. **Not yours to optimize.**

**3. Start the runtime.** Node, Python, the JVM, .NET. This varies enormously by language.

**4. Run your initialization code** — everything outside the handler function. Imports, dependency injection, SDK client construction, database connection setup, config loading. **This is where the real variance lives.**

**5. Run the handler.** The actual invocation.

Phases 1–4 are the cold start. Phase 5 happens every time.

### Why some cold starts are a hundred times worse

A minimal Python or Node function: roughly **100–300 ms**.

A Java or .NET function with a heavy dependency-injection framework, dozens of libraries, classpath scanning at startup: **2 to 10 seconds**, sometimes worse.

That's not a small difference in degree. It's the difference between "users don't notice" and "the request times out."

The dominant factor is almost always **phase 4** — your own initialization — not the runtime itself. A JVM function with lean initialization starts far faster than a Python function that imports a large scientific stack and constructs six SDK clients at module level.

### What actually helps

**Move work into initialization — deliberately.** Code outside the handler runs once per execution environment and is *reused* across invocations. Create your database connection and SDK clients there, not inside the handler. This makes cold starts slightly slower and every warm invocation much faster.

**Shrink the deployment package.** Bundle only what you use. Tree-shaking, layers for shared dependencies, and not shipping the entire AWS SDK when you use one client.

**Provisioned Concurrency** (2019) keeps a set number of environments pre-initialized and warm. It eliminates cold starts for that many concurrent executions — and it costs money whether or not they're used, which partly undoes the serverless economics. Correct for latency-critical paths, wasteful everywhere else.

**SnapStart** (introduced for Java in 2022, later extended to other runtimes) takes a Firecracker snapshot *after* initialization completes and restores from it. Initialization effectively happens once, at publish time, rather than on every cold start. For JVM workloads this can cut cold starts by an order of magnitude at no extra charge.

It comes with a genuine correctness caveat: **anything captured in the snapshot is shared by every restored environment.** A random seed, a generated unique ID, or an open connection created during init is now identical across all of them. Java's CRaC hooks exist to let you re-randomize and reconnect on restore. If you use SnapStart, you have to think about this.

**Don't chase it if you don't need it.** For an asynchronous, event-driven workload where nothing is waiting on a response, a 400 ms cold start is irrelevant. Cold start optimization matters on synchronous, user-facing paths and almost nowhere else.

---

## THE MECHANISM: Concurrency, and How It Becomes an Outage

### The model

Lambda scales by running more execution environments in parallel. One environment handles exactly one invocation at a time.

```text
concurrent executions ≈ invocations per second × average duration in seconds
```

100 requests/second at 200 ms each means about 20 concurrent executions.

### The limits

**Account concurrency** — a per-Region ceiling across all your functions. The default is **1,000**, raisable via a support request.

**Reserved concurrency** — set on a function, and it does **two** things simultaneously:

- It **guarantees** that function can reach that level
- It **caps** that function at that level
- And it **removes** that amount from the pool available to everything else

That combination is the trap.

**Provisioned concurrency** — pre-warmed environments, a subset of reserved.

### The outage shapes

**Shape one — one function starves the account.** A function is triggered by a large S3 batch, or a queue backs up, and scales to 1,000 concurrent executions. It has no reserved concurrency limit, so it consumes the whole account pool.

**Every other Lambda function in that Region and account now throttles.** Your authentication function. Your payment webhook handler. Your API backend. None of them are broken. None of them are under unusual load. They cannot run because a batch job ate the budget.

This is why reserved concurrency on high-volume functions is a *reliability* control, not a cost control. It's a bulkhead.

**Shape two — throttling looks different depending on invocation type.** Synchronous invocations return `429 TooManyRequestsException` immediately to the caller, who sees an error. Asynchronous invocations are retried with backoff for up to six hours — so the work isn't lost, but it arrives late and out of order, and your queue depth climbs while everything looks superficially fine.

**Shape three — downstream connection exhaustion.** Lambda scales to a thousand concurrent executions. Each opens a database connection. Your RDS instance has a `max_connections` of 100 (Volume 6). The database falls over, taking down services that never touched Lambda.

**RDS Proxy** exists precisely for this — it sits between Lambda and the database, pooling and multiplexing connections so a thousand Lambdas share a small number of real ones. If you connect Lambda to a relational database at any scale, you want it.

### The VPC problem, and its fix

Worth knowing because it explains a lot of old advice.

Before 2019, attaching a Lambda function to a VPC (Volume 3) was painful. **Each concurrent execution needed its own ENI** created and attached to your subnet. ENI creation takes on the order of ten seconds — *added to every cold start*. And a few hundred concurrent executions could exhaust the IP addresses in a `/24`.

The advice at the time was: don't put Lambda in a VPC unless you absolutely must.

In September 2019, AWS re-engineered it using its internal Hyperplane network function. Now a **small number of shared ENIs** are created once per unique subnet-plus-security-group combination, and executions are mapped through them. The cold start penalty essentially vanished, and the IP exhaustion problem with it.

**So: pre-2019 advice about avoiding Lambda in VPCs is obsolete.** You'll still find it everywhere.

---

## REAL INCIDENT: The Recursive Trigger

### The shape

This one is a genre, not a single event. It recurs constantly, and the arithmetic is what makes it memorable.

The classic setup:

```text
S3 bucket  →  (on object created)  →  Lambda function
Lambda function  →  writes output  →  same S3 bucket
```

Perfectly reasonable-looking. A function that generates thumbnails, or compresses uploads, or normalizes filenames. And if the output lands in the same bucket with a prefix the trigger also matches:

1. Upload one file
2. Lambda fires, writes an output file
3. That write triggers Lambda
4. Which writes another file
5. Which triggers Lambda

Exponential, running at Lambda's full scaling rate, in parallel, overnight, while everyone's asleep.

The same pattern appears with SQS (a function that writes to the queue it consumes), SNS, and DynamoDB Streams (a function that writes to the table whose stream invokes it).

### What it costs

Do the arithmetic. A function at 1,024 MB running for 500 ms, at the account concurrency limit of 1,000, running continuously:

```text
1,000 concurrent × 2 invocations/second  = 2,000 invocations/sec
                                         ≈ 7.2 million invocations/hour
```

Add the compute charge, the S3 PUT requests, the S3 GET requests, the storage for however many millions of objects it created, and the CloudWatch Logs ingestion for millions of log entries — which is frequently the largest line, because every invocation logs.

Eight hours of that is a four- or five-figure bill. Public accounts of exactly this exist in abundance.

### Why it's so easy to do

- **It looks correct in review.** "Function reads from bucket, writes to bucket" is not obviously a loop until you trace the trigger configuration.
- **Nothing fails.** Every invocation succeeds. Every write succeeds. There is no error to alert on.
- **It's fastest at night.** Nobody is watching, and there's no competing load to slow it down.
- **Billing is delayed.** Cost data lags by hours. By the time a budget alarm fires, the loop has been running for a long time.

### What AWS built

In 2023 AWS introduced **recursive loop detection**. Lambda tracks invocation lineage through a request metadata chain and, after roughly 16 recursive invocations of the same lineage, stops the function and notifies you. A `RecursiveInvocationsDropped` CloudWatch metric records it.

**Note the coverage carefully.** It works for Lambda-to-Lambda, SQS, and SNS chains. **S3-triggered loops are not covered the same way**, because the lineage metadata doesn't traverse an S3 object write. The single most common version of this incident is the one the safety net doesn't catch.

### What you should do

- **Never write output to the same prefix that triggers the function.** Use a different bucket, or an output prefix that the trigger's prefix filter excludes. Configure the filter explicitly rather than relying on the code.
- **Set reserved concurrency on every function.** A cap you never hit costs nothing. A cap you do hit converts a catastrophe into a bounded incident.
- **Budget alarms** — Volume 1, step 4. This is what they're for.
- **Alarm on invocation count**, not just errors. A function that normally runs 100 times an hour running 100,000 times an hour is the signal, and every one of those invocations is "successful."
- **Set log retention.** Lambda log groups default to never expiring. Volume 8 covers this.

---

## Part Two: Containers

## THE PROBLEM: "It Works on My Machine"

Containers solve a packaging problem: bundle the application with its dependencies, its runtime, and its filesystem, so it runs identically everywhere.

Then a second problem appears immediately. You have a hundred containers and twenty machines. Something must decide what runs where, restart what dies, roll out new versions without dropping traffic, and route to the right instance as things move.

That's **orchestration**, and AWS's offerings here are genuinely three different things.

---

## THE MECHANISM: Being Precise About What's AWS

This is the section your guide's rules demand most, because marketing blurs it relentlessly.

### ECR — Elastic Container Registry (AWS's)

A private registry for container images. AWS's own product, integrated with IAM (Volume 2) so pull permissions are role-based.

**Images are layered and content-addressed.** Each instruction in a Dockerfile creates a layer identified by the hash of its content. Layers are shared across images — push two images built on the same base and the base layers are stored once.

This is why layer ordering matters. Put the thing that changes most often **last**:

```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
CMD ["python", "main.py"]
```

Dependencies install before the source copy. Change your code and only the final layer rebuilds and re-uploads. Put `COPY . .` before the install and every code change reinstalls every dependency — slower builds, larger pushes, worse caching.

**Lifecycle policies** expire old images. Without them, a registry accumulates every image from every CI build forever, and you pay for all of it.

**Image scanning** checks layers against vulnerability databases. Basic scanning is free; enhanced scanning uses Amazon Inspector and continuously rescans as new CVEs are published — which is the one that matters, for reasons the next incident makes clear.

### ECS — Elastic Container Service (AWS's)

**This is AWS's own orchestrator**, built by AWS, with a scheduler AWS wrote. It is not Kubernetes and shares no code with it.

The model:

- **Task definition** — the blueprint. Which images, CPU and memory, ports, environment, IAM roles, logging.
- **Task** — a running instance of a task definition. One or more containers scheduled together.
- **Service** — maintains N tasks, integrates with a load balancer, handles rolling deployments.
- **Cluster** — a logical grouping.

**Two IAM roles, and the distinction matters:**

- **Task execution role** — used by the ECS *agent*, to pull the image from ECR and write logs to CloudWatch
- **Task role** — used by *your application code*, for whatever AWS APIs it calls

Confusing these produces a specific, common bug: your container starts fine (execution role works) and your application gets `AccessDenied` on its first S3 call (task role missing or wrong).

**ECS's strength is integration.** Native ALB target registration, native IAM, native CloudWatch, native VPC networking. It is dramatically simpler than Kubernetes and there is no control plane charge.

**Its weakness is portability and ecosystem.** It runs on AWS only, and the enormous Kubernetes tooling ecosystem doesn't apply.

### Fargate — a capacity mode, not an orchestrator (AWS's)

Fargate is not a third orchestrator. It's a way of *running* tasks for either ECS or EKS where **you don't manage the instances at all**.

- No EC2 instances to patch, scale, or right-size
- Pay per vCPU-second and GB-second of the task
- Each task runs in its own **Firecracker microVM** — the same technology as Lambda

Trade-offs: higher per-unit cost than well-utilized EC2, no daemon containers, no GPU support on Fargate, no privileged mode, and less control over the host.

**The honest rule:** Fargate wins when your utilization is spiky or low, or when instance management is work you don't want. EC2 capacity wins when you run steady high utilization and can keep instances genuinely busy, or need GPUs.

### EKS — Elastic Kubernetes Service (AWS operating someone else's software)

**Kubernetes is not an AWS product.** It came out of Google, was donated to the **Cloud Native Computing Foundation** in 2015, and is developed by a large multi-vendor community. AWS is one contributor among many.

**EKS is AWS running the Kubernetes control plane for you** — the API server, etcd, the scheduler, the controller manager — across multiple AZs, patched and backed up. Announced in late 2017, generally available June 2018.

What you get is **upstream, conformant Kubernetes**. Your manifests, your Helm charts, your operators work the same as anywhere else. That portability is the entire point.

**It costs roughly 0.10 USD per hour per cluster** for the control plane — about 73 USD per month — *before any worker nodes*. This is the main reason EKS is a poor choice for small workloads.

**Where AWS's own code does appear inside EKS**, and it's worth naming precisely:

- **The VPC CNI plugin** — AWS-built, and it's the one with real architectural consequences
- **The EBS and EFS CSI drivers** — AWS-built storage integration
- **The AWS Load Balancer Controller** — AWS-built, provisions ALBs from Ingress resources
- **CoreDNS and kube-proxy** — CNCF/Kubernetes projects that AWS packages as managed add-ons

### The VPC CNI and the subnet arithmetic from Volume 3

This deserves its own attention, because it's where Kubernetes collides with AWS networking.

Most Kubernetes networking plugins give pods addresses on an overlay network, invisible to the underlying VPC. **AWS's VPC CNI gives every pod a real VPC IP address** from your subnet.

The upside is substantial: pods are first-class VPC citizens. Security groups can reference them. VPC Flow Logs see them. There's no overlay encapsulation overhead. Anything in the VPC can route to a pod directly.

The downside is arithmetic. **Every pod consumes a subnet IP address**, and the number of pods per node is bounded by hardware:

```text
max pods ≈ (max ENIs per instance type × IPs per ENI) − 1
```

A `t3.medium` supports 3 ENIs with 6 IPs each, giving roughly 17 pods. Not because of CPU or memory — because of network interfaces.

And Volume 3's warning arrives: a `/24` subnet has 251 usable addresses. A cluster of 20 nodes at 17 pods each needs around 360 addresses. **You run out of IPs before you run out of compute**, and the symptom is pods stuck in `ContainerCreating` with an error about failing to assign an IP.

**Plan subnet sizing for pod count, not node count.** `/24` is usually too small for a real EKS cluster. This is the single most common EKS networking surprise.

### IRSA and Pod Identity — Volume 2 at the pod level

A pod needs AWS credentials. The lazy answer is to give the *node's* instance role broad permissions — but then **every pod on that node** inherits them, which is exactly the Capital One over-permissioning failure from Volume 2 at container granularity.

**IRSA** (IAM Roles for Service Accounts, 2019) does it properly:

1. The cluster gets an **OIDC identity provider** registered in IAM
2. A Kubernetes service account is annotated with a role ARN
3. Pods using that service account get a **projected, short-lived OIDC token** mounted into the filesystem
4. The AWS SDK exchanges it via `AssumeRoleWithWebIdentity` (Volume 2) for temporary credentials

Per-pod, least-privilege, short-lived, no stored secrets. It is the same federation mechanism recommended for GitHub Actions in Volume 2, pointed at a Kubernetes service account instead.

**EKS Pod Identity** (2023) achieves the same outcome with less setup — no per-cluster OIDC provider, using an agent on the node instead. Simpler for AWS-only clusters; IRSA remains relevant for portability and for certain cross-account setups.

**ECS's equivalent is the task role**, which needs none of this machinery because ECS has AWS identity built in from the start. It's a fair illustration of the general trade: ECS is simpler because it's AWS-native; EKS needs a bridge because Kubernetes was never designed around any one cloud's identity system.

---

## REAL INCIDENT: Log4Shell, December 2021

### What happened

On December 9–10, 2021, **CVE-2021-44228** became public. A vulnerability in Apache Log4j 2, one of the most widely used Java logging libraries in existence.

The bug: Log4j supported a lookup syntax inside logged strings, including JNDI lookups. If an attacker could get a crafted string **into a log message**, Log4j would fetch and execute code from a remote server.

Remote code execution, trivially triggered, with a CVSS score of 10.0 — the maximum.

The exploit was often as simple as putting the payload string in an HTTP `User-Agent` header, a username field, or a chat message. Anything that ended up in a log.

### Why it was so bad

**Log4j is everywhere, and mostly not on purpose.** Almost nobody chose Log4j directly. It arrives as a transitive dependency of a framework, which arrived as a dependency of another framework. Organizations could not answer the question *"do we use Log4j?"* — not because they were careless, but because nothing they had was designed to answer it.

**And in a containerized world, it's worse.** A vulnerable library may be:

- In your application's JAR
- In a base image you inherited three layers up
- In a vendor's sidecar container
- In a third-party operator running in your cluster
- In an image built eighteen months ago and still running because nothing prompted a rebuild

The immediate industry-wide question was not "how do we patch this" but **"where is it?"**

### The weekend

What followed was a global scramble. Security teams worked through the weekend. Attackers were scanning and exploiting within hours of disclosure. Follow-up CVEs appeared as incomplete fixes were found, requiring repeated re-patching.

AWS shipped hotpatch tooling for EC2, ECS, EKS, and Fargate to mitigate the issue without requiring an immediate rebuild of every image.

**And then — the detail I find most instructive — security researchers subsequently disclosed vulnerabilities in the hotpatch tooling itself**, including issues that could permit container escape or privilege escalation. AWS patched them in 2022.

*I'd treat the specifics of that follow-on as worth verifying against primary sources; the broad fact that the emergency fix required its own fixes is well documented.* The lesson stands regardless: **emergency remediation shipped under time pressure is itself unreviewed code running with high privilege.**

### What it actually tested

Log4shell was not really a Java vulnerability event. It was an **inventory** event. The organizations that handled it well had:

**A software bill of materials.** They could query, mechanically, which artifacts contained which library versions, including transitive dependencies. The ones who couldn't spent days on archaeology.

**Continuous image scanning.** Not scan-at-build. ECR enhanced scanning rescans existing images as new CVEs are published — which is exactly what you need when the vulnerability is discovered *after* your image was built. Scan-at-build tells you nothing about an image built in June.

**Short image lifetimes.** Teams that rebuilt and redeployed frequently could roll a fix out in hours. Teams running images built a year ago, with no reproducible build, had to reconstruct the build first.

**Minimal base images.** Distroless or slim images contain less. Less software means fewer things that can be vulnerable and less to audit. An image built on a full OS distribution carries hundreds of packages nobody chose.

**A single deployment path.** Organizations with one pipeline patched once. Organizations with dozens of teams deploying dozens of ways patched dozens of times, and were never confident they'd got them all.

### Carry this forward

**Your container images are not artifacts you build. They are inventory you own.**

An image sitting in ECR that was built last year and is still running in production is a liability with an unknown contents list. The questions to be able to answer *before* the next Log4Shell:

- What images are running in production right now?
- What's inside each of them, transitively?
- How long would it take to rebuild and redeploy all of them?
- Who would do it?

If you can't answer all four, that's the work.

---

## TRY THIS ON YOUR MACHINE

Exercises 1–3 use Lambda, which has a **perpetual free tier** of 1 million requests and 400,000 GB-seconds per month — these cost effectively nothing. Exercise 4 needs Docker installed locally and uses a tiny image well inside ECR's free tier. Exercise 5 is a read-only calculation and creates nothing.

**No EKS cluster is created anywhere here** — at roughly 73 USD/month for the control plane alone, it's not something to spin up casually. Exercise 5 gets you the important EKS lesson without the bill.

### 1. Take a cold start apart

```bash
export AWS_DEFAULT_REGION=us-east-1
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)

# Execution role (Volume 2)
aws iam create-role --role-name volume7-lambda-role \
  --assume-role-policy-document '{
    "Version":"2012-10-17",
    "Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}'

aws iam attach-role-policy --role-name volume7-lambda-role \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
sleep 15
```

Write a function that does measurable CPU work:

```bash
mkdir -p /tmp/v7fn && cat > /tmp/v7fn/main.py <<'EOF'
import hashlib, time, os

# This runs ONCE per execution environment - the init phase
COLD_START_TIME = time.time()
BOOT_ID = os.urandom(4).hex()

def handler(event, context):
    start = time.time()
    h = b"seed"
    for _ in range(400000):
        h = hashlib.sha256(h).digest()
    return {
        "boot_id": BOOT_ID,
        "env_age_seconds": round(time.time() - COLD_START_TIME, 3),
        "work_seconds": round(time.time() - start, 3)
    }
EOF

cd /tmp/v7fn && zip -q fn.zip main.py

aws lambda create-function --function-name volume7-demo \
  --runtime python3.12 --handler main.handler \
  --role arn:aws:iam::$ACCOUNT:role/volume7-lambda-role \
  --zip-file fileb:///tmp/v7fn/fn.zip \
  --memory-size 512 --timeout 30 \
  --query "{Name:FunctionName,Memory:MemorySize}"
```

Invoke it twice and compare:

```bash
echo "--- first (cold) ---"
aws lambda invoke --function-name volume7-demo --log-type Tail /tmp/out1.json \
  --query LogResult --output text | base64 -d | grep -i "REPORT"
cat /tmp/out1.json; echo

echo "--- second (warm) ---"
aws lambda invoke --function-name volume7-demo --log-type Tail /tmp/out2.json \
  --query LogResult --output text | base64 -d | grep -i "REPORT"
cat /tmp/out2.json; echo
```

**What to expect:** the first REPORT line includes an **`Init Duration`** field. The second does not. And `boot_id` is **identical** across both invocations, while `env_age_seconds` has grown.

**Why it's interesting:** `Init Duration` is phases 1–4 of the cold start, isolated and measured for you. The identical `boot_id` proves the execution environment was reused — which is why putting expensive setup outside the handler pays off, and also why global mutable state in a Lambda is a bug waiting to happen.

### 2. Prove that memory is CPU

```bash
for mem in 256 512 1024 1769 3008; do
  aws lambda update-function-configuration --function-name volume7-demo \
    --memory-size $mem > /dev/null
  aws lambda wait function-updated --function-name volume7-demo

  # Warm it first so we measure work, not cold start
  aws lambda invoke --function-name volume7-demo /dev/null > /dev/null

  result=$(aws lambda invoke --function-name volume7-demo /tmp/r.json > /dev/null && \
    python3 -c "import json;print(json.load(open('/tmp/r.json'))['work_seconds'])")
  echo "${mem} MB -> ${result}s   (GB-seconds: $(python3 -c "print(round($mem/1024*$result,4))"))"
done
```

**What to expect:** duration falls sharply as memory rises, with the biggest gains up to around 1,769 MB. The GB-seconds column — what you actually pay — often stays flat or **falls**.

**Why it's interesting:** you just watched a function get several times faster at the same or lower cost. Memory is a CPU dial with a misleading name. Almost every Lambda in production is set to 128 or 512 MB because that was the default someone accepted, and a large fraction of them would be cheaper and faster higher up.

### 3. Throttle yourself on purpose

```bash
aws lambda put-function-concurrency --function-name volume7-demo \
  --reserved-concurrent-executions 1

# Fire 10 invocations in parallel against a cap of 1
for i in $(seq 1 10); do
  aws lambda invoke --function-name volume7-demo --invocation-type RequestResponse \
    /tmp/throttle-$i.json --query StatusCode --output text 2>&1 &
done
wait

grep -l "" /tmp/throttle-*.json 2>/dev/null | head -3
echo "--- checking for throttles ---"
sleep 60
aws cloudwatch get-metric-statistics --namespace AWS/Lambda --metric-name Throttles \
  --dimensions Name=FunctionName,Value=volume7-demo \
  --start-time $(date -u -d '10 minutes ago' +%Y-%m-%dT%H:%M:%S 2>/dev/null || date -u -v-10M +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 --statistics Sum --query "Datapoints[].Sum" --output text
```

**What to expect:** some invocations return errors, and the `Throttles` metric is non-zero.

**Why it's interesting:** you just built the outage. Now scale the thought up: that reserved concurrency of 1 came out of the account pool of 1,000. A function with *no* reserved limit, scaling freely under a batch load, takes that budget from every other function in the Region. Reserved concurrency is a bulkhead, and this is what it feels like when the bulkhead holds.

**Remove the cap:**
```bash
aws lambda delete-function-concurrency --function-name volume7-demo
```

### 4. Watch layers deduplicate

**Requires Docker locally. Uses a tiny image, well inside ECR's free tier.**

```bash
aws ecr create-repository --repository-name volume7-lab \
  --query "repository.repositoryUri" --output text

REPO=$(aws ecr describe-repositories --repository-names volume7-lab \
  --query "repositories[0].repositoryUri" --output text)

aws ecr get-login-password | docker login --username AWS --password-stdin ${REPO%/*}

mkdir -p /tmp/v7img && cd /tmp/v7img
cat > Dockerfile <<'EOF'
FROM public.ecr.aws/docker/library/alpine:3.19
RUN apk add --no-cache curl
COPY app.txt /app.txt
CMD ["cat", "/app.txt"]
EOF

echo "version one" > app.txt
docker build -q -t $REPO:v1 .
docker push $REPO:v1
```

Now change only the last layer and push again:

```bash
echo "version two" > app.txt
docker build -q -t $REPO:v2 .
docker push $REPO:v2
```

**What to expect:** the second push reports most layers as **already existing**, uploading only the changed one. It completes almost instantly.

**Why it's interesting:** the base image and the `apk add` layer were stored once and referenced twice. That's content-addressable storage doing its job — and it's exactly why Dockerfile ordering matters. Reverse the `COPY` and `RUN` lines, rebuild, and watch the dependency layer re-upload every time.

Check what's inside:

```bash
aws ecr describe-images --repository-name volume7-lab \
  --query "imageDetails[].{Tags:imageTags,SizeMB:imageSizeInBytes,Pushed:imagePushedAt}" \
  --output table
```

### 5. Compute how many pods fit — and where your subnet runs out

No cluster required.

```bash
for t in t3.small t3.medium m5.large m5.xlarge m5.4xlarge; do
  aws ec2 describe-instance-types --instance-types $t \
    --query "InstanceTypes[0].{Type:InstanceType,ENIs:NetworkInfo.MaximumNetworkInterfaces,IPsPerENI:NetworkInfo.Ipv4AddressesPerInterface}" \
    --output text
done | awk '{ printf "%-12s ENIs:%-3s IPs/ENI:%-3s  max pods ≈ %d\n", $3, $1, $2, ($1*$2)-1 }'
```

**What to expect:** a `t3.small` supports roughly 11 pods. A `t3.medium` roughly 17. An `m5.4xlarge` far more — but still a fixed ceiling set by network hardware, not by CPU or RAM.

Now the subnet arithmetic:

```bash
python3 - <<'EOF'
subnets = {"/24": 251, "/22": 1019, "/20": 4091}
nodes, pods_per_node = 20, 17
needed = nodes * pods_per_node + nodes
print(f"{nodes} nodes x {pods_per_node} pods = {needed} IP addresses needed\n")
for cidr, avail in subnets.items():
    verdict = "OK" if avail > needed else "RUNS OUT"
    print(f"  {cidr}: {avail} usable -> {verdict}")
EOF
```

**What to expect:** a `/24` is insufficient for a modest 20-node cluster.

**Why it's interesting:** this is the AWS VPC CNI meeting Volume 3's subnet reservations, and it's the most common EKS networking surprise there is. The symptom in a real cluster is pods stuck in `ContainerCreating` with an IP assignment failure, on nodes with plenty of free CPU and memory. You planned capacity for compute and ran out of addresses. **Size EKS subnets for pod count, not node count** — and because a VPC's primary CIDR can never be changed (Volume 3), this is a decision you make once.

**Cleanup:** none — read-only.

### Teardown

```bash
aws lambda delete-function --function-name volume7-demo
aws logs delete-log-group --log-group-name /aws/lambda/volume7-demo 2>/dev/null

aws iam detach-role-policy --role-name volume7-lambda-role \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
aws iam delete-role --role-name volume7-lambda-role

aws ecr delete-repository --repository-name volume7-lab --force

rm -rf /tmp/v7fn /tmp/v7img /tmp/out*.json /tmp/throttle-*.json /tmp/r.json
```

Note the explicit log group deletion. **Lambda creates log groups with no expiry by default**, and they outlive the function. A deleted function's logs keep billing you forever. That's Volume 8's opening problem.

---

## What You Should Now Be Able To Say

- Why containers were too weak and VMs too slow, and what Firecracker removed to fix it
- The five phases of a cold start, and which one you actually control
- Why raising Lambda memory can make a function cheaper
- How one function can throttle every other function in your account
- Why async Lambda invocations demand idempotent handlers
- Why S3-triggered recursive loops slip past AWS's loop detection
- Which parts of EKS were built by AWS and which by the CNCF
- Why an EKS cluster runs out of IP addresses before it runs out of CPU
- What Log4Shell actually tested, and the four questions to be able to answer

---

## Where We Go Next

**Volume 8 — Knowing What Happened, and Surviving It: Observability, HA, DR.**

Everything so far has been building. This volume is about **seeing** and **surviving**.

First: metrics, logs, and traces as genuinely different things with different costs. CloudWatch alarms and composite alarms. Log retention — the cost trap you just met in this volume's teardown, at organizational scale. EventBridge as the nervous system tying services together. And CloudTrail, which is the only reason anyone ever finds out what an attacker did.

Then resilience, properly. RTO and RPO as engineering inputs rather than aspirations. Multi-AZ versus multi-Region with the real costs attached. The four disaster recovery strategies and what each actually buys. AWS Backup. **Static stability** — the idea from Volume 1 that finally gets its full treatment. And game days, because Volume 5's untested restart path and Volume 6's untested failover are the same failure wearing different clothes.

The incidents: breaches discovered months late, where CloudTrail was the only reason anyone could reconstruct what happened — and Netflix in 2011, which is where Chaos Monkey stops being an anecdote and becomes a method.

---

*Volume 7 complete. Say **continue** when you're ready for Volume 8.*
