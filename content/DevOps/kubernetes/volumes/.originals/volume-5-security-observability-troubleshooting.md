---
id: security-observability-troubleshooting
title: Volume 5 — Security, Observability and Troubleshooting
order: 5
description: RBAC and ServiceAccounts, what actually protects a Secret, Pod-level security, observing the cluster itself, and a systematic method for debugging failures across every layer.
draft: false
---

# Mastering Kubernetes: DevOps Engineering Guide

## Volume 5 — Security, Observability and Troubleshooting

## What Are We Learning?

Three things that all answer the same underlying question: **what is actually happening in this cluster, who is allowed to do what, and how do I find out when something is wrong?**

Security first, because it is the part most beginners skip and most interviews probe. Observability second, because it is how you see the truth instead of guessing. Troubleshooting last, tying everything from Volumes 1–4 into one method.

## Why Should a DevOps Engineer Care?

Nearly every real Kubernetes security incident traces back to a small number of repeated mistakes — overly broad RBAC, exposed Secrets, containers running as root by default. And nearly every debugging session that takes four hours instead of twenty minutes is missing a method, not missing knowledge. Both of these are fixable with the same discipline: look at evidence in the right order.

## What You Will Be Able to Do

* Explain authentication vs authorization and set up RBAC correctly
* Use ServiceAccounts the way production systems actually do
* Explain what really protects a Secret, and configure it properly
* Apply Pod-level security settings and Pod Security Standards
* Read cluster health from events, metrics and logs
* Debug an unfamiliar broken cluster using one consistent method

## Authentication vs Authorization

These are two different questions, answered by two different mechanisms, and conflating them is the most common beginner confusion in this whole area.

```text
Request arrives at kube-apiserver
        ↓
AUTHENTICATION — "who are you?"
   (certificate, token, OIDC identity)
        ↓
AUTHORIZATION — "are you allowed to do this?"
   (RBAC checks your identity against Roles)
        ↓
ADMISSION — "is this object itself allowed, and should it be modified?"
        ↓
Object is validated and stored
```

**Authentication** identifies you. In most clusters this is a client certificate (for humans, often via `kubectl` and your kubeconfig) or a bearer token (for automated clients — most importantly, ServiceAccounts, covered below). Kubernetes does not manage user accounts itself; it trusts whatever identity provider issued the credential, which is why enterprise clusters commonly plug in an OIDC provider tied to their existing single sign-on.

**Authorization** decides what that identity may do, once known. This is where **RBAC** — Role-Based Access Control — lives.

## RBAC

Four objects, and the pattern is always the same: a **Role** describes permissions, a **RoleBinding** grants them to someone.

**Role** — a set of permissions, scoped to one namespace:

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: pod-reader
  namespace: apps
rules:
  - apiGroups: [""]
    resources: ["pods"]
    verbs: ["get", "list", "watch"]
```

**RoleBinding** — grants that Role to a user, group, or ServiceAccount, in that same namespace:

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: read-pods
  namespace: apps
subjects:
  - kind: User
    name: jane
    apiGroup: rbac.authorization.k8s.io
roleRef:
  kind: Role
  name: pod-reader
  apiGroup: rbac.authorization.k8s.io
```

**ClusterRole** and **ClusterRoleBinding** — the same idea, but not scoped to one namespace. Used either for genuinely cluster-scoped resources (like Nodes, which have no namespace) or to grant the same permission across every namespace at once.

### Reading a Role correctly

Three parts matter, and all three must match for a rule to apply:

* `apiGroups` — which part of the API (`""` means the core group: Pods, Services, ConfigMaps)
* `resources` — which object type
* `verbs` — which actions: `get`, `list`, `watch`, `create`, `update`, `patch`, `delete`

There is no such thing as a partial match. A Role granting `get` on `pods` does not grant `list`, even though they sound similar in casual conversation — you must include both explicitly if both are needed.

### Least privilege in practice

```bash
kubectl auth can-i delete pods --as=jane -n apps
kubectl auth can-i list secrets --as=system:serviceaccount:apps:default
```

`kubectl auth can-i` is the single most useful RBAC command you have. Use it to check a permission before granting more, and use it while debugging "forbidden" errors instead of guessing at the Role definition.

The senior-level habit: **start from nothing and add specific verbs on specific resources**, rather than starting from `cluster-admin` and trying to remember to restrict it later. In practice, "later" rarely comes.

## ServiceAccounts

Humans authenticate with certificates or SSO tokens. **Applications running inside the cluster** authenticate with **ServiceAccounts**.

Every Pod runs as a ServiceAccount — if you do not specify one, it gets the `default` ServiceAccount for its namespace, automatically.

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: app-reader
  namespace: apps
---
apiVersion: v1
kind: Pod
metadata:
  name: my-app
  namespace: apps
spec:
  serviceAccountName: app-reader
  containers:
    - name: app
      image: myapp:1.0
```

Kubernetes automatically mounts a **projected token** for that ServiceAccount into the Pod, at `/var/run/secrets/kubernetes.io/serviceaccount/token`. Any code inside that Pod calling the Kubernetes API — a controller, an operator, an application checking its own Pod status — authenticates using that token, and RBAC then decides what it can actually do.

### The mistake almost every cluster makes

The `default` ServiceAccount, in every namespace, exists automatically and gets mounted into every Pod that does not specify otherwise. If RBAC bound to `default` is too generous — or the cluster has no meaningful RBAC restrictions at all — **every single Pod in that namespace inherits those permissions**, whether or not the application inside it was ever meant to talk to the Kubernetes API.

The fix is simple and often skipped:

```yaml
spec:
  automountServiceAccountToken: false
```

Set this on any Pod that has no legitimate reason to call the Kubernetes API — which, in most clusters, is most Pods. A web server serving HTTP traffic almost never needs to talk to the API server at all.

## Secrets — What Actually Protects Them

Volume 2 already said this once, but it belongs here properly, because it is a security topic, not a configuration topic.

**Base64 is encoding, not encryption.** Anyone with read access to a Secret object can decode it in one command. The things that actually provide protection:

| Layer | What it does |
|---|---|
| RBAC | Controls who can `get` Secret objects at all — your primary defence |
| Encryption at rest | Encrypts Secret data inside etcd itself; must be explicitly configured on self-managed clusters, and is on by default for most managed offerings |
| Not committing to Git | Entirely your own discipline; a Secret manifest with real values in a repo is a Secret already leaked |
| External secret managers | Vault, AWS Secrets Manager, etc., synced into the cluster by a controller — ecosystem tooling, not core Kubernetes |

```bash
kubectl get secret db-creds -o jsonpath='{.data.password}' | base64 -d
```

Run that once against a Secret you have access to. Seeing how trivial it is tends to permanently change how casually people treat RBAC around Secrets.

## Pod-Level Security

Even with correct RBAC, a container can still do damage if it runs with more privilege on its host than it needs. **SecurityContext** controls this, at both the Pod and the container level.

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: secure-app
spec:
  securityContext:
    runAsNonRoot: true
    runAsUser: 1000
    fsGroup: 2000
  containers:
    - name: app
      image: myapp:1.0
      securityContext:
        allowPrivilegeEscalation: false
        readOnlyRootFilesystem: true
        capabilities:
          drop: ["ALL"]
```

Key fields:

* **`runAsNonRoot` / `runAsUser`** — refuses to run as UID 0. Many container images default to root unless told otherwise; this is worth checking explicitly, not assuming.
* **`allowPrivilegeEscalation: false`** — stops a process from gaining more privileges than its parent had, closing off a common container-escape technique.
* **`readOnlyRootFilesystem: true`** — the container cannot write to its own filesystem at all, except explicitly mounted volumes. This alone blocks a large category of attacks that rely on writing a malicious file to disk.
* **`capabilities.drop: ["ALL"]`** — removes Linux capabilities the container almost certainly does not need (raw networking, kernel module loading, and so on), then you add back only the specific ones actually required.

### Pod Security Standards

Rather than hand-writing SecurityContext rules from scratch every time, Kubernetes defines three named levels, enforced cluster-wide (or per-namespace) through **Pod Security Admission**:

| Level | Meaning |
|---|---|
| `Privileged` | No restrictions — effectively opt-out |
| `Baseline` | Blocks known privilege-escalation paths, allows most normal workloads |
| `Restricted` | Heavily locked down — non-root required, no added capabilities, and more |

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: apps
  labels:
    pod-security.kubernetes.io/enforce: restricted
    pod-security.kubernetes.io/warn: restricted
```

This is a genuinely current, actively used feature — it replaced the older PodSecurityPolicy mechanism, which was removed from Kubernetes entirely. If you encounter PodSecurityPolicy in older material, know that it no longer exists in any currently supported Kubernetes version; Pod Security Standards is its replacement.

## Image and Supply-Chain Basics

Two practical habits, kept brief on purpose:

**Pin image versions, never `latest`.** An image tag is mutable — someone can push a different image under the same tag tomorrow. A specific tag, or better, an image **digest** (`image@sha256:...`), guarantees you are running exactly what you tested.

**Scan images before they run.** Vulnerability scanning of container images (Trivy, Grype, and cloud-provider registry scanning) is standard practice, and is ecosystem tooling that plugs into your CI pipeline before an image is ever pushed to a cluster.

Neither of these is a Kubernetes feature. They are practices that make everything Kubernetes runs trustworthy in the first place.

## LAB 1 — RBAC and SecurityContext, Hands-On

### Goal

Grant a narrow, real permission, prove the boundary with `auth can-i`, and lock a Pod down properly.

### Setup

```bash
kubectl create namespace sec-lab
kubectl config set-context --current --namespace=sec-lab
```

### Commands

```bash
kubectl create serviceaccount viewer
kubectl auth can-i list pods --as=system:serviceaccount:sec-lab:viewer
```

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: pod-viewer
rules:
  - apiGroups: [""]
    resources: ["pods"]
    verbs: ["get", "list"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: viewer-binding
subjects:
  - kind: ServiceAccount
    name: viewer
    namespace: sec-lab
roleRef:
  kind: Role
  name: pod-viewer
  apiGroup: rbac.authorization.k8s.io
```

```bash
kubectl apply -f role.yaml
kubectl auth can-i list pods --as=system:serviceaccount:sec-lab:viewer
kubectl auth can-i delete pods --as=system:serviceaccount:sec-lab:viewer
```

### Expected result

The first check fails — no permission yet. After applying the Role and RoleBinding, `list pods` succeeds and `delete pods` still fails.

### What to observe

You granted exactly two verbs. Nothing else became available — RBAC does not infer adjacent permissions.

### Part B — a locked-down Pod

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: locked
spec:
  automountServiceAccountToken: false
  securityContext:
    runAsNonRoot: true
    runAsUser: 1000
  containers:
    - name: app
      image: nginx:1.27
      securityContext:
        readOnlyRootFilesystem: true
        allowPrivilegeEscalation: false
        capabilities:
          drop: ["ALL"]
```

```bash
kubectl apply -f locked.yaml
kubectl get pod locked
kubectl describe pod locked | tail -15
```

### Expected result

The Pod actually fails to become `Ready` — nginx tries to write to its default paths and cannot, because of `readOnlyRootFilesystem`. This is deliberate: it shows you that real security settings have real consequences, and images often need small adjustments (writable volumes for specific paths) to run correctly under them.

### Why this matters

This is the honest version of Pod security — not just "add these settings and it works", but the actual friction a team meets when tightening a workload for the first time, and how to reason about it instead of reflexively loosening the settings back to defaults.

### Cleanup

```bash
kubectl delete namespace sec-lab
```

## Observability: Seeing What the Cluster Knows

Before troubleshooting, you need visibility. Three sources, in increasing order of detail.

### Events

Already used throughout this guide via `kubectl describe`, but they deserve their own attention:

```bash
kubectl get events --sort-by=.lastTimestamp -A
```

Events are short-lived — typically kept about an hour — and they are the closest thing to a live narration of what the control plane just did: scheduled, pulled an image, failed a probe, killed a container. Look here first, always, before logs.

### Metrics

The **metrics server** (mentioned in Volume 4 for HPA) provides basic CPU and memory usage:

```bash
kubectl top nodes
kubectl top pods
```

This is not historical — it is a live snapshot, useful for "what is happening right now" but not for "what happened at 3 AM last night." For that you need a real metrics pipeline (Prometheus and similar) — ecosystem tooling, covered only briefly here because it is not Kubernetes core, though understanding *that Kubernetes exposes metrics endpoints for this to consume* is the core-relevant part.

### Logs

```bash
kubectl logs <pod>
kubectl logs <pod> -c <container>       # multi-container Pod
kubectl logs <pod> --previous           # the crashed attempt, from Volume 2
kubectl logs -l app=web --all-containers --prefix
```

Logs are application output, captured by the container runtime and exposed by the kubelet. They are **not persisted anywhere by Kubernetes** — delete the Pod, lose the logs, unless something is shipping them elsewhere. This is why production clusters run a log-shipping agent (commonly as a DaemonSet, from Volume 2) sending logs to a central store. That agent is ecosystem tooling; the fact that Kubernetes makes container output available for it to collect is core behaviour.

### The order that actually works

```text
1. Events        — what did the control plane try to do?
2. Pod status    — what state is it in right now?
3. Logs          — what did the application actually say?
4. Metrics       — is a resource constraint involved?
```

Skipping straight to logs is the single most common inefficiency in Kubernetes debugging — if the container never started, there are no logs to read, and you have wasted a step.

## The Complete Troubleshooting Method

Every volume so far has taught a piece of this. Here it is as one method, because that is how it gets used under real pressure.

### The five questions

1. **What do we know?** The reported symptom, exactly as described — not your assumption about the cause.
2. **What do we not know?** Which layer hasn't been checked yet.
3. **Which Kubernetes layer could be responsible?** Scheduling, kubelet/runtime, networking, application, or the control plane itself.
4. **What evidence would confirm or rule out each layer?** Name the command before running it.
5. **What does the evidence actually say?** Not what you expected it to say.

### The layer map, assembled from every volume

```text
Is kubectl responding at all?
        ↓ no → API server / kubeconfig / network to cluster
        ↓ yes
Does the Pod exist and what phase is it in?
        ↓ Pending → scheduler (Volume 4): describe pod, read the filter failure
        ↓ ContainerCreating → kubelet/runtime/volume/network plugin
        ↓ CrashLoopBackOff → application: logs --previous, exit code (Volume 2)
        ↓ Running, not Ready → failing readiness probe (Volume 2/3)
        ↓ Running, Ready
Does the Service have endpoints for it?
        ↓ no → selector/label mismatch (Volume 3)
        ↓ yes
Does DNS resolve the Service name?
        ↓ no → CoreDNS health, NetworkPolicy blocking port 53 (Volume 3)
        ↓ yes
Does Ingress route correctly?
        ↓ no → Ingress rules, ingressClassName, controller logs (Volume 3)
        ↓ yes
Is a NetworkPolicy blocking the path?
        ↓ yes → review policy, add explicit allow rule (Volume 3)
```

This is not new material — it is Volumes 1 through 4, ordered into one decision tree, because that is the actual shape of debugging a request that fails somewhere between a user and a Pod.

### RBAC and security-specific failures

A category not yet covered: the request never even gets processed.

| Symptom | Likely layer |
|---|---|
| `Error from server (Forbidden)` | RBAC — check with `kubectl auth can-i` |
| `Error from server (Unauthorized)` | Authentication — expired token, bad kubeconfig |
| Pod's own calls to the API fail with 403 | ServiceAccount lacks the RBAC permission its code needs |
| Admission webhook rejection message | A policy engine (Kyverno, OPA/Gatekeeper — ecosystem) is blocking the object; the message usually names the rule |

## LAB 2 — Full Investigation From a Cold Start

### Goal

Practice the method on a problem you have not been told the cause of.

### Setup

```bash
kubectl create namespace debug-lab
kubectl config set-context --current --namespace=debug-lab
```

Deploy something deliberately broken across two layers at once, without reading the manifest closely first:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: broken
spec:
  replicas: 2
  selector:
    matchLabels:
      app: broken
  template:
    metadata:
      labels:
        app: broken-typo
    spec:
      containers:
        - name: web
          image: nginx:1.27
          readinessProbe:
            httpGet:
              path: /
              port: 8080
---
apiVersion: v1
kind: Service
metadata:
  name: broken
spec:
  selector:
    app: broken
  ports:
    - port: 80
      targetPort: 80
```

```bash
kubectl apply -f broken.yaml
```

### Investigation

Follow the method. Do not read the YAML above again — work from evidence:

```bash
kubectl get deployment broken
kubectl get pods -l app=broken
kubectl get pods --show-labels
```

**What to observe:** `kubectl get deployment` shows 0/2 ready but 2 Pods reported by the ReplicaSet controller as "existing" — and yet filtering by `app=broken` shows nothing. That mismatch is itself a clue: check `--show-labels` and you will find the real label is `broken-typo`, not `broken`. This is the selector/template mismatch from Volume 1, appearing here as an actual bug to find rather than a demonstration.

Fix the label, then continue:

```bash
kubectl describe pod -l app=broken | tail -15
```

**What to observe:** the Pod is `Running` but the readiness probe targets port 8080, while nginx listens on 80. Events show repeated probe failures. The Pod never becomes Ready, so the Service never gets endpoints.

### Why this matters

Two independent, realistic mistakes, stacked — exactly like a real incident, where the first thing you find is not always the only thing wrong. The method (evidence, one layer at a time) finds both; guessing usually fixes one and declares victory too early.

### Cleanup

```bash
kubectl delete namespace debug-lab
```

## Production Reality

| Topic | Local (`kind`) | Production |
|---|---|---|
| RBAC | Often `cluster-admin` for convenience | Least privilege per team/namespace, reviewed periodically |
| ServiceAccount tokens | Default, auto-mounted everywhere | `automountServiceAccountToken: false` unless genuinely needed |
| Secrets | Plain `kubectl create secret` | Encryption at rest enabled, often synced from an external manager |
| Pod security | Rarely configured in labs | Enforced via Pod Security Standards at the namespace level |
| Logs | Read with `kubectl logs`, then gone | Shipped centrally; retained independently of Pod lifecycle |
| Metrics | `kubectl top`, a live snapshot only | A real time-series pipeline with alerting and history |
| Incident response | Manual investigation | Runbooks built around the same layer-by-layer method |

## Core vs Ecosystem

| Category | From this volume |
|---|---|
| **Kubernetes core** | RBAC objects (Role, RoleBinding, ClusterRole, ClusterRoleBinding), ServiceAccount, Secret, SecurityContext, Pod Security Admission, Events, the metrics API that `kubectl top` reads |
| **Project tooling** | Metrics server |
| **Ecosystem** | Prometheus, Grafana, log-shipping agents (Fluent Bit, Fluentd), Vault and External Secrets Operator, image scanners (Trivy), policy engines (Kyverno, OPA/Gatekeeper) |
| **Cloud provider** | Managed identity/OIDC integration, managed logging and monitoring services |

The recurring theme of this whole guide shows up clearly here: Kubernetes gives you the **primitives** — RBAC, SecurityContext, an events API, a logs API — and the ecosystem builds the **operational systems** on top of them. Knowing this boundary is what lets you evaluate a new tool quickly: does it replace a Kubernetes primitive, or does it consume one?

## Things Senior Engineers Notice

1. **`cluster-admin` bound broadly is the single most common serious misconfiguration** found in cluster security reviews. It is almost always granted for convenience and never revisited.
2. **The `default` ServiceAccount, auto-mounted, is a bigger risk than most teams realise** — a compromised Pod inherits whatever that ServiceAccount can do, even if the Pod never intended to call the API.
3. **A Secret is only as protected as the RBAC around it.** Auditing "who can read Secrets" is worth doing on a schedule, not just once.
4. **`readOnlyRootFilesystem` breaks more images than people expect**, because many images write cache or temp files by default — plan for a small writable volume rather than abandoning the setting.
5. **Events expire faster than incidents get investigated.** If a Pod's history matters, capture `kubectl describe` output before it ages out.
6. **`kubectl top` is not monitoring.** It has no history and no alerting — treat it as a spot-check tool only.
7. **Admission policy rejections often look like validation errors** and get misdiagnosed as a YAML mistake, when the manifest is fine and a policy engine is enforcing a rule.
8. **`auth can-i` should be used before granting a permission, not just after something breaks.** It is cheap, instant, and prevents over-granting out of uncertainty.
9. **PodSecurityPolicy is gone.** Anyone referencing it is working from outdated material; Pod Security Standards replaced it entirely.
10. **A working `kubectl` session with a wide-open Role is a bigger liability than most infrastructure misconfigurations**, because it is a standing credential, not a one-time mistake.

## Interview Preparation

### Level 1 — Fundamentals

**Q: What is the difference between authentication and authorization in Kubernetes?**

Answer: Authentication establishes who is making the request — usually a certificate or a token. Authorization, done through RBAC, decides what that identity is allowed to do. They're separate steps and separate mechanisms.

**Q: What is a ServiceAccount?**

Answer: An identity for things running inside the cluster — applications, not humans. Every Pod runs as one, defaulting to the namespace's `default` ServiceAccount if nothing else is specified, and it's how Pods authenticate if they call the Kubernetes API themselves.

### Level 2 — Practical

**Q: How do you check what permissions a user or ServiceAccount actually has?**

Answer: `kubectl auth can-i <verb> <resource> --as=<identity>`. It's the direct way to confirm a permission rather than reading through Role and RoleBinding definitions and hoping you traced them correctly.

**Q: Why isn't base64 encoding of Secrets considered a security measure?**

Answer: Base64 is reversible with a single command by anyone who can read the object — it's an encoding for storing binary-safe text, not encryption. The real protections are RBAC controlling who can read Secret objects at all, and encryption at rest protecting the underlying etcd data.

### Level 3 — Scenario

**Q: A deployment fails with `Error from server (Forbidden)`. How do you investigate?**

How to think: name the layer immediately — this is not a scheduling or networking problem.

Answer: This is an RBAC problem, not an application problem. I'd check which identity is being used — my own user or a CI ServiceAccount — and run `kubectl auth can-i` for the specific verb and resource the failing command needs. Then I'd look at the Role and RoleBinding bound to that identity to see what's actually missing, and add the minimum permission required rather than reaching for a broader Role.

**Q: You suspect a Pod is compromised. What immediate steps tell you what it could have done?**

Answer: Check which ServiceAccount it was running as, and what that ServiceAccount's RBAC bindings actually grant — that defines its blast radius against the Kubernetes API. Separately check its SecurityContext — whether it ran as root, whether it had a writable root filesystem, whether it dropped capabilities — because that defines what it could have done to the node itself, independent of RBAC entirely.

### Level 4 — Senior Thinking

**Q: Why does Kubernetes handle authentication and authorization as two completely separate systems instead of one combined check?**

Answer: Authentication is inherently pluggable — organisations already have identity systems (certificates, OIDC, cloud IAM) and Kubernetes needs to trust whichever one is in place rather than reinventing identity management. Authorization, though, needs to be consistent and fine-grained regardless of how identity was established. Separating them means RBAC rules work the same way whether the identity came from a certificate, an OIDC token, or a ServiceAccount — the authorization model doesn't need to know or care how you proved who you are.

**Q: How would you approach hardening a cluster that currently has almost no security controls in place?**

Answer: I'd start with RBAC audit — find and narrow any broad `cluster-admin` bindings first, since that's usually the highest-impact fix. Then disable `automountServiceAccountToken` cluster-wide by default, re-enabling it only where a Pod genuinely calls the API. Then Pod Security Standards at `baseline` initially, moving toward `restricted` per namespace as workloads are adjusted to tolerate it — doing this all at once tends to break everything simultaneously and erodes trust in the effort. Encryption at rest for Secrets, and a real audit trail so future changes are traceable, round it out.

## Summary

| Concept | One line |
|---|---|
| Authentication | Who are you — certificate, token, OIDC |
| Authorization / RBAC | What you're allowed to do — Role + RoleBinding |
| ServiceAccount | Identity for things running inside the cluster |
| Secret protection | RBAC and encryption at rest — not base64 |
| SecurityContext | Controls what a container can do on its node |
| Pod Security Standards | Baseline/Restricted enforcement, replacing PodSecurityPolicy |
| Events | The first place to look — short-lived, narrates control-plane actions |
| Logs | Application output; not persisted by Kubernetes itself |
| Troubleshooting method | Evidence, one layer at a time, in the order things actually happen |

## What You Learned

You can now set up least-privilege RBAC and verify it directly, understand exactly what protects a Secret and what does not, lock down a Pod's security settings and reason about the friction that creates, read a cluster's own signals in the right order, and debug an unfamiliar failure methodically rather than by guessing.

Practical skills gained: writing and testing a real RBAC Role, hardening a Pod with SecurityContext and observing the real consequences, and finding two independent stacked bugs using evidence rather than by reading the manifest.

## Next Volume

**Volume 6 — Production Kubernetes and Real-World DevOps** is the final volume: how real teams actually run this — managed vs self-managed clusters, upgrades and version skew, deployment strategies, backup and recovery, and a complete core-vs-ecosystem map covering Helm, Argo CD, Prometheus, Cilium and the rest. It closes with the final project, a full mental-model revision, a production checklist, interview revision, and what to learn next.

Say **continue** when you are ready.
