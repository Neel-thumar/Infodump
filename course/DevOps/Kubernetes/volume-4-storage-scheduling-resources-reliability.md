---
id: storage-scheduling-resources-reliability
title: Volume 4 — Storage, Scheduling, Resources and Reliability
order: 4
description: Persistent storage with PV/PVC/StorageClass, how the scheduler picks a node, requests and limits, autoscaling, and staying available during maintenance.
draft: false
---

# Mastering Kubernetes: DevOps Engineering Guide

## Volume 4 — Storage, Scheduling, Resources and Reliability

## What Are We Learning?

Four things that are really one conversation: **what a workload needs, and where it can therefore run.**

Storage — does it need to remember anything. Scheduling — which node can actually host it. Resources — how much of that node it is allowed to use. Reliability — what happens to all of this during scaling and maintenance.

## Why Should a DevOps Engineer Care?

`Pending` Pods, `OOMKilled` containers, and "why did the scheduler put it there" are daily reality once you run anything beyond a toy Deployment. This volume is also where interviewers separate people who copied YAML from people who understand what the numbers mean.

## What You Will Be Able to Do

* Give a Pod storage that survives its own deletion
* Explain the PV/PVC/StorageClass chain end to end
* Explain exactly how the scheduler chooses a node
* Control placement with nodeSelector, affinity and taints
* Set requests and limits correctly, and explain QoS classes
* Configure autoscaling for workloads and nodes
* Keep an application available during rollouts and node maintenance

## Storage: Why Pods Cannot Just Write to Disk

A container's own filesystem dies with the container. Restart it — even the *same* Pod restarting a crashed container — and anything written locally is gone. For a stateless web server this is fine. For a database, it is fatal.

### Volumes vs PersistentVolumes — the distinction that confuses everyone

Kubernetes has two different things called "volume", and mixing them up causes real mistakes.

**A `volume` in a Pod spec** is just storage attached to a Pod's lifetime. Some volume types are genuinely temporary:

```yaml
volumes:
  - name: cache
    emptyDir: {}          # exists only as long as the Pod does
```

`emptyDir` is useful for scratch space or sharing files between containers *in the same Pod* — but it disappears when the Pod is deleted, not just when it restarts oddly. Never store anything you cannot afford to lose in `emptyDir`.

**A `PersistentVolume` (PV)** is storage that outlives any single Pod, and even outlives the Deployment that used it. This is what a database needs.

### The chain: Pod → PVC → PV → StorageClass

```text
Pod
 ↓  "I need 10Gi of storage"
PersistentVolumeClaim (PVC)
 ↓  matched against
StorageClass
 ↓  which tells the CSI driver
 ↓  to create real storage and produce a
PersistentVolume (PV)
```

Read this carefully, because the direction of the relationship is the whole point:

* A **PVC** is a request: "I need 10Gi, read-write by one Pod at a time."
* A **PV** is the actual storage that satisfies that request — could be a cloud disk, an NFS share, anything.
* A **StorageClass** describes *how* to make a PV automatically when a PVC asks for one.

You almost never create a PV by hand in a cloud environment. You create a PVC, and **dynamic provisioning** creates the PV for you.

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: data
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 5Gi
  storageClassName: standard
```

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: db
spec:
  containers:
    - name: postgres
      image: postgres:16
      env:
        - name: POSTGRES_PASSWORD
          value: demo
      volumeMounts:
        - name: data
          mountPath: /var/lib/postgresql/data
  volumes:
    - name: data
      persistentVolumeClaim:
        claimName: data
```

The Pod never mentions the PV. It only mentions the PVC — the request, not the storage itself. This indirection is deliberate: the same PVC-referencing manifest works whether the underlying disk is an AWS EBS volume, an Azure disk, or a local test volume, because the StorageClass is what changes between environments.

### Access modes

| Mode | Meaning |
|---|---|
| `ReadWriteOnce` (RWO) | One node can mount it read-write — the common case, including most cloud block storage |
| `ReadOnlyMany` (ROX) | Many nodes, read-only |
| `ReadWriteMany` (RWX) | Many nodes, read-write — needs storage that supports it (NFS-style), not plain cloud block storage |

A very common early mistake: expecting to scale a Deployment using a single RWO PVC to multiple replicas. It will not work — only one Pod can mount it read-write at a time, and the others will sit stuck.

### CSI, briefly

**CSI (Container Storage Interface)** is the standard Kubernetes uses to talk to storage systems, the same pattern as CRI for runtimes and CNI for networking. Kubernetes does not know how to talk to any specific storage backend; a CSI driver — provided by your cloud provider or storage vendor — does the actual provisioning, attaching and mounting. This is **ecosystem tooling**, not Kubernetes core, even though PV/PVC/StorageClass are core objects.

```bash
kubectl get storageclass
kubectl get pvc
kubectl get pv
kubectl describe pvc data
```

`kubectl describe pvc` is your first stop when a Pod is stuck waiting on storage — it shows whether the claim is `Bound`, `Pending`, and why.

## LAB 1 — Storage That Survives a Pod

### Goal

Prove that data outlives the Pod, and see the PVC/PV binding directly.

### Setup

`kind` has a default StorageClass out of the box, so dynamic provisioning works locally without extra setup.

```bash
kubectl create namespace storage-lab
kubectl config set-context --current --namespace=storage-lab
kubectl get storageclass
```

### Commands

```bash
kubectl apply -f - <<'EOF'
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: data
spec:
  accessModes: ["ReadWriteOnce"]
  resources:
    requests:
      storage: 1Gi
---
apiVersion: v1
kind: Pod
metadata:
  name: writer
spec:
  containers:
    - name: box
      image: busybox:1.36
      command: ["sh", "-c", "echo hello > /data/note.txt && sleep 3600"]
      volumeMounts:
        - name: data
          mountPath: /data
  volumes:
    - name: data
      persistentVolumeClaim:
        claimName: data
EOF

kubectl get pvc
kubectl get pv
kubectl exec writer -- cat /data/note.txt
```

Now delete the Pod entirely and recreate it pointing at the same PVC:

```bash
kubectl delete pod writer
kubectl apply -f - <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: reader
spec:
  containers:
    - name: box
      image: busybox:1.36
      command: ["sh", "-c", "sleep 3600"]
      volumeMounts:
        - name: data
          mountPath: /data
  volumes:
    - name: data
      persistentVolumeClaim:
        claimName: data
EOF
kubectl exec reader -- cat /data/note.txt
```

### Expected result

`hello` appears both times, from two completely different Pods, because both mounted the same PVC.

### What to observe

`kubectl get pv` shows the PV that was automatically created for your PVC, and its status stays `Bound` through the whole exercise. The Pod is disposable. The claim and its underlying volume are not.

### Why this matters

This is the difference between a stateless web tier and a database tier, demonstrated directly rather than described.

### Cleanup

```bash
kubectl delete pod reader
kubectl delete pvc data
```

Deleting the PVC will delete the PV too, if the StorageClass's reclaim policy is `Delete` — the default for dynamic provisioning. Check with `kubectl get storageclass -o yaml` if you need to know for certain before deleting anything real.

## Scheduling: How the Scheduler Actually Decides

Recall from Volume 1: the scheduler's whole job is picking a node for a Pod and writing that choice into the Pod object. Here is how it decides.

```text
All nodes
   ↓  FILTERING — remove nodes that cannot possibly work
Feasible nodes
   ↓  SCORING — rank the survivors
Best node
   ↓
Write nodeName into the Pod
```

**Filtering** eliminates nodes that fail hard requirements: not enough CPU/memory for the Pod's requests, a taint the Pod does not tolerate, a required label the node lacks, a port conflict, and more.

**Scoring** ranks what is left — preferring, for example, nodes with more free resources, or better spreading Pods across the cluster. This is a soft preference, not a hard rule.

If **no** node survives filtering, the Pod stays `Pending`. This is why `kubectl describe pod` on a `Pending` Pod usually shows a message like `0/3 nodes are available: 2 Insufficient memory, 1 node(s) had taint...` — it is telling you exactly which filter every node failed.

### Controlling placement

**`nodeSelector`** — the simplest, a hard requirement matching node labels:

```yaml
spec:
  nodeSelector:
    disktype: ssd
```

**Node affinity** — the same idea, more expressive, and can be a soft preference instead of a hard rule:

```yaml
spec:
  affinity:
    nodeAffinity:
      requiredDuringSchedulingIgnoredDuringExecution:
        nodeSelectorTerms:
          - matchExpressions:
              - key: disktype
                operator: In
                values: ["ssd"]
```

The name is long on purpose and worth reading literally: **required during scheduling** (a hard rule when placing), **ignored during execution** (if the node's label changes later, the already-running Pod is not evicted).

**Pod affinity / anti-affinity** — place Pods relative to *other Pods*, not nodes:

```yaml
spec:
  affinity:
    podAntiAffinity:
      requiredDuringSchedulingIgnoredDuringExecution:
        - labelSelector:
            matchLabels:
              app: web
          topologyKey: kubernetes.io/hostname
```

This says: do not schedule this Pod on a node that already has another Pod labelled `app: web`. Used constantly for spreading replicas across nodes so one node failure cannot take out the whole application.

**Taints and tolerations** — the opposite direction. A **taint** on a node repels Pods; a **toleration** on a Pod allows it to ignore a specific taint.

```bash
kubectl taint nodes node1 dedicated=gpu:NoSchedule
```

```yaml
spec:
  tolerations:
    - key: "dedicated"
      operator: "Equal"
      value: "gpu"
      effect: "NoSchedule"
```

The distinction that trips people up: **affinity is the Pod choosing a node it wants. A taint is the node refusing Pods it does not want**, and a toleration is permission to ignore that refusal — not a request to be placed there. Taints and tolerations are commonly used to reserve nodes for specific workloads (GPU nodes, dedicated batch nodes) so ordinary Pods never land there by accident.

**Topology spread constraints** — a more direct way to spread Pods evenly across zones or nodes without the verbosity of anti-affinity:

```yaml
spec:
  topologySpreadConstraints:
    - maxSkew: 1
      topologyKey: topology.kubernetes.io/zone
      whenUnsatisfiable: DoNotSchedule
      labelSelector:
        matchLabels:
          app: web
```

This keeps the Pod count per zone within 1 of each other — genuinely useful for surviving a zone outage, and increasingly the preferred tool over anti-affinity for this specific purpose.

## Resources: Requests, Limits and QoS

Every container should declare what it needs.

```yaml
resources:
  requests:
    cpu: "250m"
    memory: "256Mi"
  limits:
    cpu: "500m"
    memory: "512Mi"
```

**Requests** are what the scheduler uses for filtering — "does any node have at least this much free?" Requests are also a reservation: once scheduled, that amount is set aside for the Pod even if it is not using it yet.

**Limits** are the hard ceiling. For memory, going over the limit gets the container killed (`OOMKilled`, exit code 137 — from Volume 2). For CPU, going over the limit does not kill anything; the container is **throttled** — it simply gets less CPU time, and things quietly slow down instead of crashing.

This asymmetry matters and is frequently misunderstood: **memory limits are enforced by killing. CPU limits are enforced by throttling.** A CPU-starved application will not show up as a crash — it will show up as unexplained latency.

### QoS classes

Kubernetes derives a Quality of Service class from your requests and limits — you do not set it directly.

| Class | How you get it | Behaviour under node pressure |
|---|---|---|
| `Guaranteed` | requests == limits, for every container, for both CPU and memory | Last to be evicted |
| `Burstable` | requests set, but lower than limits (or limits missing on some) | Evicted before Guaranteed |
| `BestEffort` | No requests or limits set at all | First to be evicted |

```bash
kubectl get pod <name> -o jsonpath='{.status.qosClass}'
```

When a node runs low on memory, Kubernetes evicts Pods in that order — `BestEffort` first, `Burstable` next, `Guaranteed` last. This is precisely why production databases are almost always given `Guaranteed` QoS deliberately.

### ResourceQuota and LimitRange

Requests and limits are per-container. Two namespace-level objects control the aggregate and set defaults:

**ResourceQuota** caps total resource usage in a namespace:

```yaml
apiVersion: v1
kind: ResourceQuota
metadata:
  name: team-quota
spec:
  hard:
    requests.cpu: "4"
    requests.memory: 8Gi
    pods: "20"
```

**LimitRange** sets defaults and bounds so nobody forgets to set anything, or sets something absurd:

```yaml
apiVersion: v1
kind: LimitRange
metadata:
  name: defaults
spec:
  limits:
    - default:
        cpu: "500m"
        memory: "512Mi"
      defaultRequest:
        cpu: "250m"
        memory: "256Mi"
      type: Container
```

Together these are how a platform team stops one careless deployment from starving every other team on a shared cluster.

## LAB 2 — See Scheduling and Limits Enforced

### Goal

Watch a Pod get rejected by filtering, then watch a memory limit get enforced.

### Commands

```bash
kubectl taint nodes --all dedicated=special:NoSchedule
kubectl run test --image=nginx:1.27
kubectl get pods
kubectl describe pod test | tail -10
```

### Expected result

The Pod stays `Pending`. The events show something like `1 node(s) had untolerated taint {dedicated: special}`.

Now fix it:

```bash
kubectl run test2 --image=nginx:1.27 --overrides='{"spec":{"tolerations":[{"key":"dedicated","operator":"Equal","value":"special","effect":"NoSchedule"}]}}'
kubectl get pods
```

### What to observe

The scheduler told you *exactly* which filter failed. This is the message to read first on every `Pending` Pod, before assuming anything more complicated.

Now the memory limit:

```bash
kubectl run hog --image=polinux/stress --limits=memory=50Mi -- stress --vm 1 --vm-bytes 150M --timeout 30s
sleep 5
kubectl describe pod hog | grep -A3 "Last State"
```

### Expected result

`Last State: Terminated`, `Reason: OOMKilled`.

### Why this matters

You have now caused, on purpose, in a safe lab, the exact failure most engineers meet for the first time in a 2 AM production incident. Recognising `OOMKilled` immediately, instead of treating it as a mystery, is worth a great deal.

### Cleanup

```bash
kubectl delete pod test test2 hog --ignore-not-found
kubectl taint nodes --all dedicated=special:NoSchedule-
```

That trailing `-` on the taint command removes it. ⚠️ Confirm this on a real cluster before untainting nodes you do not own — taints are often there deliberately.

## Autoscaling

Three different autoscalers answer three different questions, and it is worth being precise about which is which.

### Horizontal Pod Autoscaler (HPA) — more Pods

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: web
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: web
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
```

This changes `replicas` on the Deployment based on observed metrics (CPU, memory, or custom metrics if you have a metrics pipeline for them). It needs the **metrics server** installed to read CPU/memory usage — a common early lab mistake is configuring HPA and wondering why it does nothing, when the real problem is that no metrics source exists yet.

Note the requirement this creates: **HPA only works well if requests are set correctly**, because "70% utilization" is measured against the requested CPU, not some absolute number.

### Vertical Pod Autoscaler (VPA) — bigger Pods

VPA adjusts a Pod's requests and limits based on observed usage, rather than adding more replicas. It is not built into Kubernetes core — it is a separate project you install. Its most disruptive mode restarts Pods to apply new values, which is why VPA and HPA are normally not pointed at the same metric on the same workload — they can fight each other.

### Cluster Autoscaler — more nodes

This is a different layer entirely. When Pods are `Pending` because **no node has room**, the cluster autoscaler adds a new node. When nodes sit mostly empty, it removes them. This is cloud-provider-integrated tooling, not something that runs meaningfully on a fixed local cluster like `kind`.

```text
Traffic increases
      ↓
HPA sees high CPU → increases replicas
      ↓
New Pods are Pending — no node has room
      ↓
Cluster Autoscaler sees Pending Pods → adds a node
      ↓
Scheduler places the new Pods on the new node
```

This is the complete picture interviewers are actually asking about when they say "how does Kubernetes scale."

## Keeping Things Available: PodDisruptionBudget

Two very different kinds of disruption exist, and the distinction matters:

* **Involuntary** — a node crashes, hardware fails. Nothing can be scheduled in advance for this.
* **Voluntary** — a human or a system deliberately removes a Pod: node drain for maintenance, a cluster upgrade, the cluster autoscaler scaling down. This *can* be controlled.

**PodDisruptionBudget (PDB)** protects against voluntary disruption by telling Kubernetes the minimum number of Pods that must stay available during operations like drain:

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: web-pdb
spec:
  minAvailable: 2
  selector:
    matchLabels:
      app: web
```

With this in place, `kubectl drain` on a node will refuse to evict a Pod if doing so would drop `web` below 2 available replicas — it waits, or fails, instead of taking your application down for the sake of finishing maintenance quickly.

```bash
kubectl drain node1 --ignore-daemonsets --delete-emptydir-data
```

`--ignore-daemonsets` is needed because DaemonSet Pods (Volume 2) are meant to run on every node and are not meant to be drained away in the usual sense.

## Production Reality

| Topic | Local (`kind`) | Production |
|---|---|---|
| Storage | Local-path default StorageClass | Cloud block storage via a real CSI driver, snapshots configured |
| Scheduling | One node, little to decide | Affinity/anti-affinity and topology spread actively used across zones |
| Resources | Often skipped in labs | Always set; frequently enforced by LimitRange and ResourceQuota |
| Autoscaling | Cluster autoscaler irrelevant | HPA and cluster autoscaler working together routinely |
| PDBs | Rarely needed | Standard on anything user-facing before the first cluster upgrade |

## Core vs Ecosystem

| Category | From this volume |
|---|---|
| **Kubernetes core** | PersistentVolume, PersistentVolumeClaim, StorageClass (the API objects), the scheduler, affinity/taints/tolerations, requests/limits, QoS, HPA, PodDisruptionBudget |
| **Project tooling** | Metrics server (commonly used, not bundled by default) |
| **Ecosystem** | CSI drivers (EBS CSI driver, Azure Disk CSI driver, etc.), Vertical Pod Autoscaler, Cluster Autoscaler |
| **Cloud provider** | The actual disks, the actual extra VMs added by cluster autoscaling |

The pattern repeats from earlier volumes: Kubernetes defines the **objects and the contract** — StorageClass, HPA, PDB — but the thing that does the physical work (attaching a real disk, launching a real VM) is always a separate, vendor-specific piece.

## Things Senior Engineers Notice

1. **A `Pending` Pod's events almost always say exactly why**, filter by filter. Read them before guessing.
2. **CPU limits throttle; memory limits kill.** A slow service and a crashing service point to different resource problems.
3. **HPA percentages are relative to requests, not real machine capacity.** A wrong request value makes autoscaling meaningless.
4. **A single RWO PVC cannot back a scaled-out Deployment.** This is a very common early storage mistake.
5. **`emptyDir` is not persistence.** It survives a container restart inside the same Pod but not a Pod deletion.
6. **`BestEffort` Pods are evicted first under memory pressure**, silently, with no crash to investigate — just a Pod that is suddenly gone.
7. **Anti-affinity has a real scheduling cost at scale**; topology spread constraints usually achieve the same safety more cheaply.
8. **A PodDisruptionBudget set too strictly can block a node drain indefinitely**, which is its job — but it needs to be understood by whoever runs the upgrade, or it looks like a stuck maintenance window.
9. **Taints reserve nodes; tolerations don't request them.** A Pod that tolerates a taint might still land on an ordinary node too, unless affinity is also used to pull it toward the tainted one specifically.
10. **Reclaim policy decides whether deleting a PVC deletes real data.** Check it before any storage cleanup on a real cluster.

## Interview Preparation

### Level 1 — Fundamentals

**Q: What is the difference between a PV and a PVC?**

Answer: A PVC is a request for storage — how much, and what access mode. A PV is the actual storage that satisfies it. In most environments, creating a PVC automatically triggers dynamic provisioning of a matching PV.

**Q: What is the difference between requests and limits?**

Answer: Requests are what the scheduler reserves and uses to decide if a node has room. Limits are the hard ceiling — exceeding the memory limit gets the container killed, exceeding the CPU limit just throttles it.

### Level 2 — Practical

**Q: How does the scheduler choose a node?**

Answer: In two stages. Filtering removes nodes that cannot satisfy hard requirements — insufficient resources, unmatched taints, failed affinity rules. Scoring then ranks the remaining nodes by softer preferences and picks the best one. If filtering removes every node, the Pod stays Pending.

**Q: What is a PodDisruptionBudget for?**

Answer: It protects against voluntary disruptions like node drains or cluster upgrades, by declaring the minimum Pods that must stay available. It does not protect against a node crashing unexpectedly — that is involuntary and cannot be scheduled around.

### Level 3 — Scenario

**Q: A Pod is stuck `Pending` and `kubectl describe` shows `Insufficient cpu`. What do you do?**

How to think: give options, not one guess.

Answer: Either the requests are set higher than the cluster actually has room for, in which case I'd check node capacity and either reduce requests or add capacity, or the cluster genuinely needs more nodes, in which case cluster autoscaling (if configured) should handle it — and if it isn't configured, that's the real gap. I'd also check whether affinity or taints are narrowing the eligible nodes more than intended.

**Q: An application scaled up under load through HPA, but latency got worse, not better. Why might that be?**

Answer: New replicas may be Pending due to insufficient node capacity, so the extra replicas HPA "added" aren't actually serving traffic — I'd check `kubectl get pods` for Pending Pods and whether cluster autoscaling is keeping up. Alternatively, if requests were set too low, HPA's utilization percentage might be misleading, or the bottleneck could be a shared dependency, like a database, that more Pods make worse rather than better.

### Level 4 — Senior Thinking

**Q: Why does Kubernetes separate the concept of a PVC from a PV instead of letting Pods reference storage directly?**

Answer: It decouples the application's request ("I need 10Gi, read-write") from the specific implementation of that storage, the same separation the API server enforces everywhere else. The same manifest then works across different environments — a cloud disk in production, a local path in a test cluster — because only the StorageClass changes, not the workload definition.

**Q: How would you design resource governance for a shared cluster with several teams?**

Answer: ResourceQuota per namespace to cap total consumption per team, LimitRange to set sane defaults so nobody deploys unbounded workloads by accident, Guaranteed QoS reserved deliberately for critical stateful workloads, and PodDisruptionBudgets on anything user-facing so cluster maintenance doesn't become an outage. I'd also make sure HPA targets are based on requests that reflect real measured usage, not guesses, since bad requests quietly undermine every other control.

## Summary

| Concept | One line |
|---|---|
| Volume vs PV | A volume can be as temporary as the Pod; a PV outlives it |
| PVC | A request for storage; PV is what satisfies it |
| StorageClass | How to automatically create a PV for a PVC |
| Filtering | Removes nodes that cannot satisfy hard requirements |
| Scoring | Ranks the nodes that remain |
| Requests | Reserved and used for scheduling |
| Limits | Hard ceiling — memory kills, CPU throttles |
| QoS | Guaranteed > Burstable > BestEffort, in eviction priority |
| HPA | More Pods, based on metrics |
| Cluster Autoscaler | More nodes, based on Pending Pods |
| PDB | Protects availability during voluntary disruption |

## What You Learned

You can now give a workload real persistent storage and explain the chain behind it, read exactly why the scheduler rejected a Pod, set resource values with intent instead of guessing, configure autoscaling correctly, and keep an application up through a node drain.

Practical skills gained: watching a PVC bind to a PV, forcing and reading a scheduling failure, causing and recognising an `OOMKilled` event, and writing a PodDisruptionBudget that actually protects a rollout.

## Next Volume

**Volume 5 — Security, Observability and Troubleshooting** covers RBAC and ServiceAccounts, what actually protects a Secret, Pod-level security settings, observing the cluster itself, and a full systematic method for debugging failures across every layer covered so far.

Say **continue** when you are ready.
