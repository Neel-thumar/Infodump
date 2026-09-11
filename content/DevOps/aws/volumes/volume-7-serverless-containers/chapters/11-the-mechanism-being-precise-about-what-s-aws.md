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

