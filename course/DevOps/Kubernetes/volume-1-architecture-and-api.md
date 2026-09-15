---
id: architecture-and-api
title: Volume 1 — Architecture, the API, and Talking to the Cluster
order: 1
description: How Kubernetes is built internally, what really happens after kubectl apply, how to read any YAML manifest, and how to organise resources with namespaces, labels and selectors.
draft: false
---

# Mastering Kubernetes: DevOps Engineering Guide

## Volume 1 — Architecture, the API, and Talking to the Cluster

## What Are We Learning?

Three connected things:

1. **The machine** — which components make up Kubernetes and what each one does
2. **The language** — the object model, so you can read any YAML file instead of copying it
3. **The tools** — `kubectl`, namespaces, labels and selectors for daily work

## Why Should a DevOps Engineer Care?

Because almost every Kubernetes problem you will ever debug is really the question: **which component stopped doing its job?**

Pod stuck in `Pending`? That is the scheduler. Pod created but nothing running on the node? That is the kubelet. `kubectl` timing out? That is the API server. If you do not know who does what, you are guessing.

## What You Will Be Able to Do

* Name every major Kubernetes component and explain its job in one sentence
* Describe step by step what happens after `kubectl apply`
* Read any Kubernetes YAML and understand its structure
* Use `kubectl` properly — including `describe`, `explain`, `logs`, and label selectors
* Organise resources using namespaces and labels the way real teams do
* Know which component to suspect when something breaks

## The Two Halves of a Cluster

Every Kubernetes cluster has two parts.

```text
┌─────────────────── CONTROL PLANE ───────────────────┐
│  kube-apiserver   etcd   kube-scheduler             │
│  kube-controller-manager   (cloud-controller-mgr)   │
└─────────────────────────────────────────────────────┘
                         ▲
                         │  (nodes talk to the API server)
                         ▼
┌──────── NODE ────────┐  ┌──────── NODE ────────┐
│ kubelet              │  │ kubelet              │
│ kube-proxy           │  │ kube-proxy           │
│ container runtime    │  │ container runtime    │
│   → your Pods        │  │   → your Pods        │
└──────────────────────┘  └──────────────────────┘
```

In our apartment analogy: the **control plane is the management office**, and the **nodes are the buildings** where people actually live.

One thing surprises everybody: **the components do not talk to each other.** The scheduler does not call the kubelet. The controller manager does not call the scheduler. They all read from and write to the API server, and that is the only conversation happening.

## Control Plane Components

### kube-apiserver

The front door. Every request — from you, from `kubectl`, from any component — goes through it.

Its jobs:

* Authenticate (who are you?)
* Authorize (are you allowed to do this?)
* Validate (is this object even legal?)
* Store the object in etcd
* Notify anyone watching that something changed

If the API server is down, **nothing can be changed** in the cluster. Existing Pods keep running, but no new decisions get made.

### etcd

The cluster's memory. A key-value database holding every object — every Pod, Deployment, Secret, everything.

Two things to remember:

* Only the API server talks to etcd. Nothing else should.
* **If you lose etcd and have no backup, you have lost the cluster's entire configuration.** This is the number one backup priority in production.

### kube-scheduler

Decides which node a new Pod should run on. That is its entire job.

It does not start the Pod. It writes the chosen node name into the Pod object and stops. Something else picks it up from there.

### kube-controller-manager

One program containing many controllers. Each controller watches one type of object and enforces one rule:

* Deployment controller → makes sure ReplicaSets exist
* ReplicaSet controller → makes sure the right number of Pods exist
* Node controller → notices when a node stops reporting
* Job controller, endpoint controller, and many more

This is where reconciliation actually happens.

### cloud-controller-manager

Only present on cloud clusters. It talks to the cloud provider — creating load balancers, attaching disks, reading node metadata. This is the piece that knows about AWS, Azure or GCP, kept separate on purpose so the rest of Kubernetes stays cloud-neutral.

## Node Components

### kubelet

The agent on every node. It watches the API server for Pods assigned to *its* node, then makes them real: pulls images, asks the runtime to start containers, mounts volumes, runs health checks, and reports status back.

Important: **the kubelet is not told what to do. It looks for work.** Nobody pushes instructions to it.

### kube-proxy

Makes Services work on that node by programming network rules in the Linux kernel (using iptables, IPVS or nftables depending on the mode and Kubernetes version). We cover this properly in Volume 3.

### Container runtime

The software that actually creates containers — normally **containerd**, sometimes **CRI-O**. Kubernetes talks to it through a standard interface called **CRI** (Container Runtime Interface).

Note for 2026: Docker is no longer used as a runtime by Kubernetes. Support for it was removed in Kubernetes 1.24. Images built with `docker build` still work perfectly — the image format is standard. Docker is a build tool here, not a runtime.

## What Actually Happens After `kubectl apply`

This is one of the most common interview questions. Learn this flow properly.

```text
kubectl apply -f deployment.yaml
        ↓
kubectl reads kubeconfig, sends an HTTP request to the API server
        ↓
API SERVER
   1. Authentication  — who is this?
   2. Authorization   — is this user allowed? (RBAC)
   3. Admission       — modify or reject the object by policy
   4. Validation      — is the object schema-correct?
   5. Write to etcd
        ↓
Object now exists. The API server notifies watchers.
        ↓
Deployment controller sees a new Deployment → creates a ReplicaSet
        ↓
ReplicaSet controller sees it → creates Pod objects (no node yet)
        ↓
Scheduler sees Pods with no node → picks a node → writes it to the Pod
        ↓
kubelet on that node sees a Pod assigned to it
        ↓
kubelet → container runtime (CRI) → pull image, create container
        ↓
Network plugin (CNI) gives the Pod an IP
        ↓
Pod is Running. kubelet reports status back to the API server.
```

Notice something important: **when `kubectl apply` returns "created", nothing is running yet.** You have only written down your intent. Everything after that happens asynchronously, and every one of those steps can fail in its own way.

This one diagram explains most troubleshooting:

| Where it stops | What you see |
|---|---|
| Authorization | `Error from server (Forbidden)` |
| Admission | Request rejected with a policy message |
| Scheduler | Pod stays `Pending` |
| Image pull | `ImagePullBackOff` |
| Container start | `CrashLoopBackOff` |
| Network plugin | Pod stuck in `ContainerCreating` |

## The Object Model — How to Read Any YAML

Every Kubernetes object, without exception, has the same four top-level parts.

```yaml
apiVersion: apps/v1        # which API group and version
kind: Deployment           # what type of object
metadata:                  # name, namespace, labels, annotations
  name: web
spec:                      # WHAT YOU WANT
  replicas: 3
status:                    # WHAT ACTUALLY EXISTS (Kubernetes writes this)
```

### apiVersion

Which part of the Kubernetes API this object belongs to.

* `v1` — the original core group (Pod, Service, ConfigMap, Secret, Namespace)
* `apps/v1` — workloads (Deployment, StatefulSet, DaemonSet, ReplicaSet)
* `batch/v1` — Job, CronJob
* `networking.k8s.io/v1` — Ingress, NetworkPolicy

Never guess this. Ask the cluster:

```bash
kubectl api-resources
```

### kind

The type of object. Always capitalised: `Pod`, `Deployment`, `Service`.

### metadata

Identity and organisation: `name`, `namespace`, `labels`, `annotations`.

A name must be unique **for that kind, in that namespace**. You can have a Pod named `web` and a Service named `web` in the same namespace — no conflict.

### spec vs status — the most important distinction

**You write `spec`. Kubernetes writes `status`.**

`spec` is your desired state. `status` is observed reality. Controllers exist to make status match spec.

```bash
kubectl get pod <name> -o yaml
```

Look at the output — you will see your small `spec` and a much bigger `status` full of things you never typed: the Pod IP, the node name, conditions, container states. All of that was written by Kubernetes, not by you.

This is why editing `status` by hand is pointless. A controller will overwrite it within seconds.

### A realistic example, field by field

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  namespace: shop
  labels:
    app: web
spec:
  replicas: 3
  selector:
    matchLabels:
      app: web          # which Pods this Deployment owns
  template:             # the Pod blueprint
    metadata:
      labels:
        app: web        # must match the selector above
    spec:
      containers:
        - name: nginx
          image: nginx:1.27
          ports:
            - containerPort: 80
```

Two fields deserve attention because they confuse everybody:

**`selector.matchLabels`** — how the Deployment finds the Pods it owns. Not by name. By label.

**`template`** — this is a Pod definition inside a Deployment. Everything under `template.spec` is Pod configuration. This is why Pod knowledge is never wasted; it appears inside every workload type.

And the rule that trips up beginners: **the labels in `template.metadata.labels` must match `selector.matchLabels`.** If they do not, the Deployment creates Pods and then cannot see them, so it creates more, forever.

## Working with kubectl

`kubectl` is a program on your laptop that turns your command into an HTTP request. Nothing more.

It reads `~/.kube/config` to know which cluster to talk to and as whom.

```bash
kubectl config get-contexts        # which clusters do I have?
kubectl config current-context     # which am I using right now?
kubectl config use-context kind-devops
```

⚠️ Check `current-context` before running anything destructive. Running a command against the wrong cluster is one of the most common serious mistakes in this job.

### The commands you will use every day

| Command | What it does |
|---|---|
| `kubectl get <kind>` | List objects |
| `kubectl describe <kind> <name>` | Full detail **plus events** — your first debugging tool |
| `kubectl logs <pod>` | Application output |
| `kubectl apply -f file.yaml` | Create or update from a file |
| `kubectl delete -f file.yaml` | Remove what that file created |
| `kubectl exec -it <pod> -- sh` | Shell inside a container |
| `kubectl explain <path>` | Built-in documentation for any field |

### Two commands people underuse

**`kubectl describe`** — the Events section at the bottom tells you what Kubernetes actually tried to do and why it failed. Most beginners jump straight to `logs`, but if the container never started there are no logs. `describe` first.

**`kubectl explain`** — the API documentation, live from your cluster:

```bash
kubectl explain deployment.spec.strategy
kubectl explain pod.spec.containers.resources
```

This is more reliable than blog posts, because it comes from the version you are actually running.

### Useful flags

```bash
kubectl get pods -o wide              # adds node name and Pod IP
kubectl get pods -A                   # every namespace
kubectl get pods -w                   # watch live changes
kubectl get pods -l app=web           # filter by label
kubectl get pod web-xyz -o yaml       # the full object
```

## Namespaces — Dividing the Complex

A namespace is a separate area inside one cluster. In our analogy, the cluster is the apartment complex and a namespace is one apartment — your team's own space.

```bash
kubectl get namespaces
```

Every new cluster has these:

| Namespace | Purpose |
|---|---|
| `default` | Where things go if you do not say otherwise |
| `kube-system` | Kubernetes' own components — do not put your apps here |
| `kube-public` | Readable by everyone, rarely used |
| `kube-node-lease` | Internal node heartbeats |

Namespaces give you:

* **Organisation** — `dev`, `staging`, `team-payments`
* **Name reuse** — every team can have a Deployment called `api`
* **Access control** — RBAC rules can be limited to one namespace
* **Resource limits** — quotas can be applied per namespace

What namespaces do **not** give you: network isolation. By default a Pod in `dev` can reach a Pod in `prod` over the network. Namespaces are not a security boundary on their own — you need NetworkPolicy for that, which we cover in Volume 3. This misunderstanding causes real incidents.

Also note: some things are **cluster-scoped** and live outside namespaces entirely — Nodes, Namespaces themselves, PersistentVolumes, ClusterRoles.

```bash
kubectl api-resources --namespaced=false
```

## Labels, Selectors and Annotations

### Labels

Key-value pairs you attach to objects so you can find them later.

```yaml
metadata:
  labels:
    app: web
    env: production
    team: payments
```

Labels are not decoration. **They are how Kubernetes connects objects.** A Service finds its Pods by label. A Deployment finds its Pods by label. Nothing uses names for this.

### Selectors

A query over labels.

```bash
kubectl get pods -l app=web
kubectl get pods -l 'env in (staging,production)'
kubectl get pods -l app=web,env=production      # AND
kubectl get pods -l '!canary'                   # label not present
```

### Annotations

Also key-value pairs, but for **information**, not selection. You cannot query by annotation.

Use labels for things you want to find. Use annotations for things you want to record — a git commit, a contact email, configuration for an Ingress controller.

```yaml
metadata:
  annotations:
    contact: payments-team@example.com
    git-commit: 4f2a9c1
```

### The habit good teams build

Agree on a standard label set from day one and apply it everywhere:

```yaml
labels:
  app: checkout
  env: production
  team: payments
  version: "2.3.1"
```

Six months later, when someone asks "what is the payments team running in production?", you have an answer in one command instead of an afternoon.

## LAB 1 — Watch the Machine Work

### Goal

See the components doing their individual jobs, and see labels controlling real behaviour.

### Setup

The `kind` cluster from Volume 0. If you deleted it:

```bash
kind create cluster --name devops
```

### Part A — Look at the control plane itself

```bash
kubectl get pods -n kube-system
```

**Expected result:** you will see `kube-apiserver-...`, `etcd-...`, `kube-scheduler-...`, `kube-controller-manager-...`, `kube-proxy-...` and CoreDNS.

**What to observe:** the control plane runs as Pods, inside Kubernetes. Kubernetes runs itself.

### Part B — Follow one Pod through the system

```bash
kubectl create namespace lab
kubectl create deployment web --image=nginx --replicas=2 -n lab
kubectl get pods -n lab -o wide
kubectl describe pod -n lab -l app=web | tail -25
```

**What to observe:** in the events at the bottom you can literally read the handover — the scheduler assigning the Pod to a node, then the kubelet pulling the image and starting the container. Two different components, named in the output.

### Part C — Prove that labels control ownership

```bash
kubectl get pods -n lab --show-labels
POD=$(kubectl get pods -n lab -l app=web -o name | head -1)
kubectl label $POD app=broken --overwrite -n lab
kubectl get pods -n lab --show-labels
```

**Expected result:** you now have **three** Pods. The relabelled one is still running perfectly.

**What to observe:** nothing crashed. You changed a string, so the Deployment's selector no longer matched that Pod, so it counted 1 instead of 2 and created a replacement. The old Pod is now an orphan that nothing manages.

**Why this matters:** this is how engineers pull a broken Pod out of service to investigate it — and also how a careless `kubectl label` silently removes a Pod from production traffic. Same mechanism, two very different days.

### Part D — Read the object model directly

```bash
kubectl get deployment web -n lab -o yaml | head -40
kubectl explain deployment.spec.selector
```

**What to observe:** compare the small thing you created with the large object that came back. Everything extra was added by the API server and the controllers.

### Cleanup

```bash
kubectl delete namespace lab
```

Deleting a namespace deletes everything inside it. Useful in labs. ⚠️ Dangerous in production — there is no undo.

## Troubleshooting With the Architecture

Do not memorise fixes. Ask: **which component was supposed to act next?**

| Symptom | Which component | First command |
|---|---|---|
| `kubectl` hangs or times out | API server or your kubeconfig | `kubectl cluster-info` |
| Pod stays `Pending` | Scheduler — could not find a suitable node | `kubectl describe pod <name>` |
| Pod stuck `ContainerCreating` | kubelet, network plugin or volume mount | `kubectl describe pod <name>` |
| `ImagePullBackOff` | kubelet could not fetch the image | `kubectl describe pod <name>` |
| `CrashLoopBackOff` | Container starts then exits — application problem | `kubectl logs <pod> --previous` |
| Deployment creates endless Pods | Selector and template labels do not match | `kubectl get deployment -o yaml` |
| Node shows `NotReady` | kubelet stopped reporting | `kubectl describe node <name>` |

The pattern: **`describe` tells you what Kubernetes tried to do. `logs` tells you what your application did.** Use them in that order.

## Production Reality

| Topic | Local (`kind`) | Production |
|---|---|---|
| Control plane | One node, no redundancy | 3 API servers and 3 etcd members across failure zones |
| Who runs it | You | Usually a managed service (EKS, AKS, GKE) or a platform team |
| etcd backup | None | Scheduled snapshots, tested restores |
| Namespaces | Ad hoc | Per team or per environment, with quotas and RBAC |
| Access | `cluster-admin` | Least privilege, per namespace |
| `kubectl apply` by hand | Normal | Rare — changes come through Git and a CD tool |

On managed clusters you do not see the control-plane Pods at all, because the provider runs them for you. The architecture is identical; you just have no access to that half.

## Core vs Ecosystem

| Category | Examples from this volume |
|---|---|
| **Kubernetes core** | API server, etcd, scheduler, controller manager, kubelet, the object model, namespaces, labels |
| **Kubernetes project tooling** | `kubectl`, `kube-proxy`, `kubeadm`, CoreDNS |
| **Ecosystem** | containerd, CRI-O, `kind`, `minikube`, Helm, Argo CD |
| **Cloud provider** | EKS, AKS, GKE and their load balancers and IAM integrations |

`kubectl` is a client, not the system. containerd is a runtime Kubernetes *uses*, not a part of it. Getting these boundaries right saves you from debugging the wrong thing.

## Things Senior Engineers Notice

1. **The API server is the single point everything depends on.** When it is slow, controllers stop receiving updates and the cluster quietly stops correcting itself while looking healthy.
2. **`kubectl apply` succeeding means nothing about your application.** Always follow with `kubectl get pods` or `kubectl rollout status`.
3. **Events expire.** They are kept for about an hour by default, so `describe` on an old problem may show nothing. Investigate while it is fresh.
4. **Mismatched selector and template labels** create an infinite Pod loop. It is a five-second mistake and a confusing outage.
5. **Namespaces are not a security boundary.** Network traffic crosses them freely unless you add NetworkPolicy.
6. **`kubectl edit` is a trap.** Your change lives only in the cluster and disappears on the next `apply`. Change the file, not the cluster.
7. **Never store important data only in etcd's default setup.** Secrets are only base64-encoded unless encryption at rest is configured.
8. **Check `current-context` before every destructive command.** People have deleted production namespaces this way.
9. **Cluster-scoped objects exist.** Deleting a namespace does not clean up the PersistentVolumes or ClusterRoles it was using.
10. **Random Pod names are a design signal.** If any part of your system depends on a Pod name or IP, that design will break.

## Interview Preparation

### Level 1 — Fundamentals

**Q: What are the main Kubernetes components?**

How to think: split into control plane and node, then one line each.

Answer: Control plane — the API server (entry point and validation), etcd (stores all cluster state), the scheduler (chooses nodes for Pods), and the controller manager (runs the reconciliation loops). On each node — the kubelet (starts and supervises Pods), kube-proxy (Service networking), and a container runtime like containerd.

**Q: What is the difference between spec and status?**

Answer: `spec` is what I asked for. `status` is what actually exists, written by Kubernetes. Controllers work to make status match spec.

### Level 2 — Practical

**Q: What happens when you run `kubectl apply`?**

How to think: walk the path, do not list components randomly.

Answer: `kubectl` sends an HTTP request to the API server. The API server authenticates and authorizes me, runs admission controllers, validates the object, and stores it in etcd. Controllers watching that object react — the Deployment controller creates a ReplicaSet, the ReplicaSet controller creates Pods. The scheduler assigns each Pod to a node. The kubelet on that node sees the Pod, tells containerd to start the container, and the network plugin assigns an IP. Then the kubelet reports status back.

**Q: How does a Deployment know which Pods belong to it?**

Answer: through the label selector. It does not use names. Any Pod matching `spec.selector.matchLabels` is counted as its own.

### Level 3 — Scenario

**Q: A Pod has been `Pending` for ten minutes. How do you investigate?**

How to think: name the component first, then the evidence.

Answer: `Pending` means the scheduler has not placed it, so I start with `kubectl describe pod` and read the events — the scheduler usually states why. Typical reasons are insufficient CPU or memory on any node, a nodeSelector or affinity rule that nothing satisfies, taints without matching tolerations, or a PersistentVolumeClaim that is not bound. Then I check `kubectl get nodes` and node capacity to confirm.

**Q: Someone reports that a Deployment keeps creating Pods endlessly. What is your first guess?**

Answer: the labels in the Pod template do not match the Deployment's selector. The Deployment cannot see the Pods it created, so it keeps creating more. I would check with `kubectl get deployment -o yaml` and compare `spec.selector.matchLabels` with `spec.template.metadata.labels`.

### Level 4 — Senior Thinking

**Q: Why did Kubernetes put an API server in front of etcd instead of letting components read it directly?**

Answer: it gives one place for authentication, authorization, validation, admission policy and API versioning. It also means components never depend on each other or on the storage format, so the system can evolve — and it is the reason a custom resource you define behaves exactly like a built-in one. The cost is that the API server becomes a shared dependency for the whole control plane.

**Q: What breaks if etcd is unavailable?**

Answer: running Pods keep running, because the kubelet already knows what it should be doing. But nothing new can be created or changed, controllers cannot reconcile, and failed Pods will not be replaced. The cluster becomes frozen rather than dead — which is more dangerous, because it can look fine for a while.

## Summary

| Concept | One line |
|---|---|
| Control plane | Decides what should happen |
| Node components | Make it happen |
| API server | The only door; everything goes through it |
| etcd | The cluster's memory; back it up |
| Scheduler | Chooses a node, nothing more |
| Controllers | Continuously fix the difference between spec and status |
| kubelet | Watches for its own work and runs it |
| Object model | `apiVersion`, `kind`, `metadata`, `spec`, `status` |
| Labels | How Kubernetes connects objects to each other |
| Namespaces | Organisation and access control — not network isolation |

## What You Learned

You can now explain the whole architecture, trace a request from your keyboard to a running container, read a manifest instead of copying it, use `kubectl` deliberately, and organise a cluster with namespaces and labels. Most importantly, when something breaks you can name the component responsible.

## Next Volume

**Volume 2 — Running Applications: Pods, Deployments and Configuration** is the biggest practical volume. Why Pods exist, Pod lifecycle and restart behaviour, Pods → ReplicaSets → Deployments as one connected story, rolling updates and rollbacks, ConfigMaps and Secrets, health probes, and a first real project. It also covers debugging `CrashLoopBackOff` and `ImagePullBackOff` properly.

Say **continue** when you are ready.
