---
id: production-kubernetes-and-devops
title: Volume 6 — Production Kubernetes and Real-World DevOps
order: 6
description: How real teams run Kubernetes — managed vs self-managed, upgrades, deployment strategies, backup and recovery, the ecosystem map, a final project, and complete revision.
draft: false
---

# Mastering Kubernetes: DevOps Engineering Guide

## Volume 6 — Production Kubernetes and Real-World DevOps

## What Are We Learning?

Everything so far has been "how Kubernetes works." This volume is "how a team actually operates it" — who runs the control plane, how you upgrade without breaking anything, how you deploy safely, how you recover from disaster, and where the enormous ecosystem around Kubernetes actually fits.

Then we close the whole guide: a final project, the complete mental model, a production checklist, and interview revision.

## Why Should a DevOps Engineer Care?

This is what separates "I can deploy an app to Kubernetes" from "I can be trusted to run Kubernetes for a company." It is also where the most senior-sounding interview answers come from — trade-offs, judgement, and knowing what actually breaks in real operations.

## What You Will Be Able to Do

* Explain managed vs self-managed Kubernetes and the trade-offs
* Understand version skew and plan a safe cluster upgrade
* Choose and explain rolling, blue/green, and canary deployment strategies
* Explain what backup and disaster recovery mean for Kubernetes specifically
* Correctly place every major ecosystem tool relative to Kubernetes core
* Walk through a complete, realistic final project in an interview
* Recall the whole system as one connected mental model

## Managed vs Self-Managed Kubernetes

Recall from Volume 1: the control plane is the API server, etcd, scheduler and controller manager. Someone has to run that. The question is who.

| | Self-managed | Managed (EKS, AKS, GKE) |
|---|---|---|
| Control plane | You install, upgrade, and secure it | The cloud provider runs it |
| etcd backups | Your responsibility entirely | Usually handled by the provider |
| Node upgrades | Fully your responsibility | Often assisted or automated |
| Cost | Infrastructure only, more engineering time | Control-plane fee, less operational burden |
| Flexibility | Full control over every component and version | Bound to what the provider supports |
| Typical choice | Regulated environments, on-prem, specific compliance needs | The large majority of teams |

Most companies in 2026 run managed Kubernetes, precisely because control-plane operations — the hardest and least differentiated part — get handled by someone whose whole job is exactly that. Self-managed clusters remain common where data must stay on-premises, where a specific compliance regime demands it, or inside platform teams building Kubernetes distributions for others.

**`kubeadm`** is the standard tool for bootstrapping a self-managed cluster — initialising the control plane, generating certificates, and joining worker nodes. Knowing it exists and roughly what it does is useful for interviews even if you never run it directly; most working engineers interact with Kubernetes exclusively through a managed control plane.

## Cluster Upgrades and Version Skew

Kubernetes ships a new minor version roughly every four months, and — this is the number to actually know, not a guess — the project supports the **three most recent minor releases** at any time, each for about a year of patch support. That means you are expected to upgrade a production cluster a few times a year, not once every few years.

### Version skew policy

Components are allowed to be at different versions during an upgrade, but only within specific limits:

* The API server can be **up to 2 minor versions newer** than a kubelet
* `kube-proxy` should match its node's kubelet version
* `kubectl` can be one minor version older or newer than the API server

The practical consequence: **you upgrade the control plane before the nodes**, never the other way around, and you do it one minor version at a time — you cannot jump from 1.30 straight to 1.33.

```text
Upgrade order:
etcd  →  control plane (API server, scheduler, controller manager)  →  nodes (kubelet, kube-proxy)  →  kubectl
```

### What actually goes wrong during upgrades

**API deprecations.** Kubernetes removes old API versions on a schedule. A manifest still using a removed `apiVersion` will be rejected outright after the removal — not deprecated-with-a-warning, actually rejected. Before any upgrade, check for deprecated APIs in use:

```bash
kubectl get --raw /metrics | grep apiserver_requested_deprecated_apis
```

**CRD and webhook compatibility.** Anything extending the API (Volume 5's admission webhooks, custom resources from operators) must also support the new version. This is frequently the actual blocker in upgrades, not Kubernetes itself.

**Node upgrades need the same care as any maintenance.** This is exactly where the PodDisruptionBudgets from Volume 4 matter — draining a node for a kubelet upgrade is a voluntary disruption, and a PDB stops it from taking your application down.

## Deployment Strategies

Volume 2 covered the mechanics of a rolling update. Here is where that fits among the broader set of strategies a real team chooses from.

### Rolling update — the Kubernetes default

Already covered in depth. New Pods start, old Pods are removed once new ones are Ready, controlled by `maxSurge` and `maxUnavailable`. Good default for most stateless services; the risk is that both old and new versions serve traffic simultaneously during the rollout, which matters if the two versions are not compatible with each other (e.g. a database schema change).

### Blue/green

Two full environments exist side by side — "blue" (current) and "green" (new). Traffic is switched all at once, usually by updating a Service selector or an Ingress/Gateway rule, once green is fully verified.

```text
Service → (selector: version=blue)   ← switch this to version=green
```

**Advantage:** instant rollback — just switch the selector back. No mixed-version traffic ever.

**Cost:** you need double the resources running at once, at least briefly, and stateful components (databases) need a real migration strategy, not just a traffic switch.

### Canary

A small percentage of traffic goes to the new version first, and is increased gradually as confidence grows.

```text
95% of traffic → v1 (stable)
 5% of traffic → v2 (canary)
```

With plain Kubernetes, this is usually approximated with two Deployments behind one Service, using replica counts as a rough percentage (2 canary Pods out of 40 total ≈ 5%). Genuine traffic-percentage-based splitting needs a service mesh or a Gateway API implementation supporting weighted routing — which is exactly the kind of feature the Gateway API (Volume 3) was designed to express properly, instead of approximating with replica counts.

**Advantage:** real production traffic tests the new version on a small, bounded blast radius before full rollout.

**Cost:** more operational complexity, and you need solid metrics to actually judge whether the canary is healthy before expanding it.

### Choosing between them

| Situation | Reasonable choice |
|---|---|
| Routine, low-risk stateless update | Rolling update |
| High-risk change, need instant full rollback | Blue/green |
| Want to validate against real traffic before full exposure | Canary |
| Incompatible schema/data change between versions | Blue/green with careful data migration, not a rolling update |

## Backup and Disaster Recovery

Two different things need protecting, and teams frequently only think of one.

**etcd** — the cluster's entire configuration: every object, every Secret, every Deployment definition. Lose this with no backup and you have lost the cluster's memory entirely, even if every workload keeps running for a while on residual kubelet state.

```bash
ETCDCTL_API=3 etcdctl snapshot save backup.db \
  --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/server.crt \
  --key=/etc/kubernetes/pki/etcd/server.key
```

On managed Kubernetes, the provider typically handles etcd backups as part of the control-plane service — one of the genuine conveniences of not self-managing.

**Application data and objects** — your actual PersistentVolumes, and the Kubernetes objects themselves (Deployments, ConfigMaps, Secrets) as a separate concern from etcd's raw internal format. Tools like **Velero** back up both Kubernetes object definitions and, with the right plugin, the underlying volume data — genuinely useful for "restore this whole namespace" or "migrate this application to a different cluster" scenarios, not just disaster recovery.

**RPO and RTO**, worth knowing by name for interviews:

* **RPO (Recovery Point Objective)** — how much data you can afford to lose, measured in time. "We back up etcd every 6 hours" means an RPO of up to 6 hours.
* **RTO (Recovery Time Objective)** — how long recovery is allowed to take before it is unacceptable.

A backup you have never restored from is not a backup — it is an unverified hope. Practising a restore, on a schedule, is what actually earns the term "disaster recovery."

## LAB 1 — See a Version Deprecation and Practice a Restore Concept

### Goal

Directly observe deprecated API usage, and understand a restore path without needing a multi-node cluster to prove it.

### Setup

Your `kind` cluster.

### Part A — Deprecated API detection

```bash
kubectl api-versions | grep networking
kubectl get --raw /metrics 2>/dev/null | grep apiserver_requested_deprecated_apis || echo "none found in this short-lived cluster"
```

**What to observe:** in a long-running production cluster, this metric fills up with real evidence of exactly which old manifests need updating before the next upgrade — this is the actual command teams run before scheduling an upgrade window.

### Part B — Object backup and restore, conceptually

```bash
kubectl create namespace restore-demo
kubectl create deployment demo --image=nginx:1.27 --replicas=2 -n restore-demo
kubectl get all -n restore-demo -o yaml > backup.yaml
kubectl delete namespace restore-demo
kubectl apply -f backup.yaml
kubectl get all -n restore-demo
```

**What to observe:** everything comes back, because you captured the object definitions before deleting them. This is a simplified version of exactly what Velero automates properly at scale, including volume snapshots — but the core idea is the same: **object definitions are data, and losing them without a backup is losing the ability to recreate anything.**

**Why this matters:** most engineers understand backing up a database instinctively but forget that the Kubernetes objects describing their entire application are equally irreplaceable without a backup.

### Cleanup

```bash
kubectl delete namespace restore-demo
rm backup.yaml
```

## The Kubernetes Ecosystem — Complete Map

This is the map this whole guide has been building toward, piece by piece. Here it is together.

### Kubernetes Core

Defined and shipped by the Kubernetes project itself: the API server, etcd, scheduler, controller manager, kubelet; Pods, Deployments, Services, ConfigMaps, Secrets, RBAC, NetworkPolicy, PV/PVC, HPA, CRDs.

### Official / Common Kubernetes Tooling

Maintained by the project or expected on essentially every cluster: `kubectl`, `kubeadm`, `kube-proxy`, CoreDNS, the metrics server.

### Kubernetes Ecosystem

Built around Kubernetes, chosen independently, each replaceable by an alternative:

| Category | Tools |
|---|---|
| Packaging manifests | Helm, Kustomize |
| Continuous delivery | Argo CD, Flux |
| Networking (CNI) | Cilium, Calico, Flannel |
| Service mesh | Istio, Linkerd |
| Observability | Prometheus, Grafana, OpenTelemetry |
| Policy enforcement | Kyverno, OPA/Gatekeeper |
| Backup | Velero |
| Secrets sync | External Secrets Operator, Vault |

### Cloud Provider Technology

EKS, AKS, GKE and their specific integrations: managed load balancers, IAM-based authentication, managed disks and their CSI drivers, managed logging.

### The one-sentence test

For any tool someone mentions in a Kubernetes conversation, ask: **is this shipped and defined by the Kubernetes project, or is it something you separately chose to install on top?** If it's the latter, it's ecosystem — useful, sometimes essential, but never assume every cluster has it, and never confuse its behaviour with Kubernetes' own.

## Final Project: A Realistic Production Setup

This project pulls together the whole guide. Talk through it in an interview the way it's written here — decisions and reasoning, not just a YAML dump.

### Scenario

A small e-commerce checkout service needs to run reliably on Kubernetes: a stateless API, a Postgres database, internal-only in one environment, public-facing in another.

### Architecture decisions, with reasoning

**Workload type:** Deployment for the API (stateless, interchangeable Pods — Volume 2). StatefulSet for Postgres, because it needs stable identity and its own persistent storage (Volume 2 and Volume 4) — though in practice, many teams use a managed database service instead and avoid running stateful storage in Kubernetes at all; that trade-off is worth naming explicitly.

**Configuration:** non-secret settings in a ConfigMap, mounted as a volume so changes are visible without a rebuild (Volume 2). Database credentials in a Secret, mounted as a file rather than an environment variable, with RBAC restricting which ServiceAccounts can read it (Volume 5).

**Networking:** a `ClusterIP` Service in front of the API Pods, an Ingress (or Gateway API `HTTPRoute`, depending on what the platform already runs) exposing it externally with TLS, and a NetworkPolicy default-denying traffic into the `checkout` namespace except explicitly from the Ingress controller and explicitly allowing egress to CoreDNS (Volume 3).

**Resources and scheduling:** requests and limits set from measured usage, `Guaranteed` QoS deliberately chosen for the Postgres Pod, pod anti-affinity spreading API replicas across nodes, and an HPA scaling the API on CPU utilization within a sensible min/max (Volume 4).

**Reliability:** a PodDisruptionBudget on the API Deployment so node maintenance never drops below 2 available replicas (Volume 4).

**Security:** SecurityContext dropping all capabilities and requiring non-root on the API containers, Pod Security Standards set to `restricted` on the namespace, and `automountServiceAccountToken: false` on every Pod that never calls the Kubernetes API — which, here, is all of them (Volume 5).

**Deployment strategy:** rolling update for routine API changes; blue/green considered specifically for any release that changes the database schema, because a rolling update would otherwise run two schema-incompatible versions simultaneously (this volume).

**Observability and recovery:** logs shipped centrally rather than relying on `kubectl logs`, metrics feeding the HPA and a real monitoring pipeline, and etcd/object backups scheduled and periodically test-restored (Volume 5 and this volume).

### What this demonstrates in an interview

Not that you memorised YAML — that you can justify each decision against a real constraint (availability, security, cost, complexity) and that you know which parts are Kubernetes primitives versus ecosystem choices layered on top.

## Complete Kubernetes Mental Model

One picture, tying every volume together.

```text
You describe desired state (Volume 1: the API, the object model)
        ↓
Control plane reconciles it (Volume 1: scheduler, controllers)
        ↓
Workloads run as Pods (Volume 2: Deployments, config, probes)
        ↓
Traffic reaches them (Volume 3: Services, DNS, Ingress/Gateway, NetworkPolicy)
        ↓
They get the resources and placement they need (Volume 4: storage, scheduling, resources, scaling)
        ↓
Access is controlled and the system is observable (Volume 5: RBAC, security, troubleshooting)
        ↓
All of it is operated safely over time (Volume 6: upgrades, strategies, backup, ecosystem)
```

Every concept in this guide is an instance of the same underlying pattern from Volume 0: **you declare what you want, a controller compares it to what exists, and it acts to close the gap — forever, at every layer, from a single Pod's replica count to the whole cluster's version.**

## Production Checklist

Before running anything real in Kubernetes, check:

- [ ] Every container has resource requests and limits set from real measurement
- [ ] Readiness and liveness probes exist and check different things
- [ ] `automountServiceAccountToken: false` unless the Pod genuinely needs API access
- [ ] RBAC follows least privilege — no unreviewed `cluster-admin` bindings
- [ ] Secrets are not committed to Git, and encryption at rest is enabled
- [ ] A NetworkPolicy exists for the namespace, tested to confirm it does not also block DNS
- [ ] A PodDisruptionBudget protects anything user-facing
- [ ] Image tags are pinned, not `latest`
- [ ] etcd backups run on a schedule and have been test-restored at least once
- [ ] The rollback command has actually been rehearsed, not just known in theory
- [ ] Someone owns the cluster upgrade cadence and checks for deprecated APIs before each upgrade

## Common Mistakes to Actively Avoid

* Deploying without resource requests, "because it works in the lab"
* Treating a green rollout as proof the release is good, without a real readiness probe backing it
* Assuming namespaces provide network isolation
* Writing a default-deny NetworkPolicy without an explicit DNS allow rule
* Using a StatefulSet by reflex for anything that sounds "stateful," without checking whether a managed service would be simpler
* Leaving the `default` ServiceAccount auto-mounted everywhere
* Storing real Secret values in a Git-tracked manifest
* Skipping a practiced restore, and discovering the backup process was broken during an actual incident

## Senior Engineer Checklist

What experienced engineers actually think about before touching production:

1. What is the blast radius if this change goes wrong, and how do I undo it quickly?
2. Is this problem actually a Kubernetes problem, or an application problem Kubernetes is only exposing?
3. Which specific component is responsible for the behaviour I'm seeing, and what evidence proves it?
4. What does this configuration do under resource pressure or during a node failure, not just under normal conditions?
5. Is this a Kubernetes primitive or an ecosystem choice — and would swapping the ecosystem tool break anything that depends on it?
6. Have we actually tested the recovery path, or only ever tested the happy path?

## Interview Revision — Concise Answers

**What is Kubernetes?** A system that runs applications across machines, based on desired state you declare, continuously reconciled by controllers.

**Why does a Pod exist instead of running containers directly?** Some containers must share a network and storage and be scheduled together; the Pod is that unit.

**What's the difference between a Deployment and a ReplicaSet?** ReplicaSet keeps N Pods running; Deployment manages ReplicaSets to allow safe, reversible updates.

**How does a Service find its Pods?** Via label selector, materialised into EndpointSlices, turned into kernel packet rules by kube-proxy.

**Readiness vs liveness?** Readiness controls traffic; liveness controls restarts.

**Requests vs limits?** Requests are reserved and used for scheduling; limits are the ceiling — memory kills on breach, CPU throttles.

**What actually protects a Secret?** RBAC and encryption at rest — not base64.

**What's the real difference between Ingress and the Gateway API?** Same general purpose — routing external traffic — but Gateway API is role-oriented, standardised across vendors instead of leaning on custom annotations, and also models east-west (mesh) traffic in the same system.

**How do you upgrade a cluster safely?** Control plane before nodes, one minor version at a time, checking for deprecated API usage and CRD/webhook compatibility first.

**Rolling vs blue/green vs canary?** Rolling for routine low-risk changes; blue/green for instant full rollback or incompatible schema changes; canary to validate against real traffic on a bounded blast radius.

## Scenario Questions for Final Revision

**"Users report intermittent 502s only during deployments."** Investigate SIGTERM handling and `preStop` hooks, and whether `maxUnavailable` allows capacity to drop too far during the rollout (Volume 2/6).

**"A Pod can't reach a Service that clearly has healthy endpoints."** Check DNS resolution next, then NetworkPolicy — in that order, because DNS is more often the actual gap (Volume 3).

**"The cluster upgrade is blocked."** Look for CRDs or webhooks that don't yet support the new API version — this is the most common real blocker, not Kubernetes core itself (this volume).

**"A namespace's Pods keep getting evicted under load, but not other namespaces'."** Check QoS class — likely `BestEffort` or `Burstable` without adequate requests, evicted before better-provisioned workloads elsewhere on the same node (Volume 4).

## What to Learn Next

Kubernetes is a foundation, not an endpoint. Natural next directions, each genuinely useful depending on where your career goes:

* **A service mesh (Istio or Linkerd)** — if your organisation runs many services needing mutual TLS, fine-grained traffic control, or observability between services specifically
* **GitOps properly (Argo CD or Flux)** — if you want to go deeper into how real teams manage `kubectl apply` at scale, safely, through Git as the source of truth
* **Deeper CI/CD engineering** — building the pipelines that produce the images and manifests this guide assumed already existed
* **Cloud-specific deep dives (AWS, Azure, or GCP)** — since managed Kubernetes is where most engineers actually work, and each provider's specific integrations matter in practice
* **Observability engineering (Prometheus, Grafana, OpenTelemetry)** properly, beyond the basics covered here
* **Kubernetes internals and controller-writing** — if you want to go past *using* Kubernetes into *extending* it, which is a genuinely different and deeper skill

## Summary

| Concept | One line |
|---|---|
| Managed vs self-managed | Trade operational burden for less control, or the reverse |
| Version skew | Control plane before nodes, one minor version at a time |
| Rolling / blue-green / canary | Routine, instant-rollback, and gradual-validation strategies respectively |
| etcd backup | Protects the cluster's entire memory — test the restore, not just the backup |
| Ecosystem map | Kubernetes gives primitives; the ecosystem builds systems on top |
| Final project | Every decision should be justifiable against a real constraint |

## What You Learned

You can now discuss how Kubernetes is actually operated in the real world, not just how it behaves in a lab — upgrades, deployment strategy trade-offs, disaster recovery, and exactly where the enormous ecosystem sits relative to the system you've spent five volumes learning. You have a complete project you can walk an interviewer through, and a checklist you can genuinely use before your next real deployment.

## Closing

This is the end of the guide, but the mental model it built — **desired state, reconciled by controllers, at every layer** — is the same model professional Kubernetes engineers carry for their entire careers. Everything new you meet from here (a new CRD, a new operator, a new ecosystem tool) is an instance of that same pattern. You already know how to reason about it.
