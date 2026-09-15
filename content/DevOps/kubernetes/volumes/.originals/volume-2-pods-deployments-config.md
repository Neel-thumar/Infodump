---
id: running-applications
title: "Volume 2 — Running Applications: Pods, Deployments and Configuration"
order: 2
description: How Kubernetes actually runs your application — Pods, ReplicaSets, Deployments, rolling updates, ConfigMaps, Secrets and health probes — plus the debugging skills for when it goes wrong.
draft: false
---

# Mastering Kubernetes: DevOps Engineering Guide

## Volume 2 — Running Applications: Pods, Deployments and Configuration

## What Are We Learning?

This is the volume where you actually run things.

We start at the smallest unit — the Pod — and build upward until you can deploy a real application, update it safely, roll it back when it breaks, feed it configuration and secrets, and tell Kubernetes how to check whether it is healthy.

## Why Should a DevOps Engineer Care?

This is 80% of daily Kubernetes work. Deployments, ConfigMaps, Secrets and probes are what you touch every day. Everything in later volumes — networking, storage, scaling, security — is added *around* what you build here.

It is also where the two most common production failures live: `CrashLoopBackOff` and a badly configured probe. Both are covered properly.

## What You Will Be Able to Do

* Explain why Pods exist instead of running containers directly
* Read Pod status and know exactly what Kubernetes is doing
* Deploy an application with a Deployment and update it with zero downtime
* Roll back a bad release in seconds
* Move configuration and secrets out of your image
* Add liveness, readiness and startup probes correctly
* Debug `CrashLoopBackOff`, `ImagePullBackOff` and `OOMKilled`
* Choose the right workload type for the job

## Why Does a Pod Exist?

Here is a fair question: Kubernetes runs containers. Why not just have a "Container" object?

Because some processes genuinely need to run *together* — sharing a filesystem, talking over `localhost`, living and dying as a unit. A log shipper reading files written by an app. A proxy sitting in front of an app. If containers were the unit, Kubernetes would need a separate "please put these two on the same machine and let them share things" feature.

So Kubernetes made the group the unit instead.

> **A Pod is one or more containers that share a network address and can share storage, always scheduled together on the same node.**

In the apartment analogy: the Pod is the **room**, and the containers are the **people living in that room**. They share the address and the space. You cannot put one roommate in a different building.

### What "sharing a network" really means

Every Pod gets **its own IP address**. All containers inside that Pod share it.

That means:

* Containers in the same Pod reach each other on `localhost`
* They **cannot** use the same port — two containers both wanting port 8080 in one Pod is a conflict
* From outside, the Pod has one address, no matter how many containers are inside

This is a big deal. It means your application can listen on port 80 like normal software, because port 80 belongs to that Pod alone.

### The rule about multi-container Pods

Beginners see "one or more containers" and put their app and their database in one Pod. Do not do this.

Use one container per Pod **unless** the extra container is a helper that cannot live independently:

| Good reason | Example |
|---|---|
| Log shipper | Reads log files the app writes to a shared volume |
| Proxy / sidecar | Handles TLS or service-mesh traffic for the app |
| Config reloader | Watches for config changes and signals the app |

Bad reason: "they belong to the same project". App and database are separate Pods, because they scale, fail and update independently.

## Pod Lifecycle

A Pod has a **phase** — a simple summary of where it is.

| Phase | Meaning |
|---|---|
| `Pending` | Accepted, but not running yet — waiting for scheduling, image pull, or volumes |
| `Running` | Bound to a node, at least one container is running |
| `Succeeded` | All containers exited successfully and will not restart |
| `Failed` | All containers stopped and at least one failed |
| `Unknown` | Kubernetes lost contact with the node |

Phase is a summary. The detail is in the **container statuses**, which is what you read in `kubectl describe`: `Waiting`, `Running`, `Terminated`, with a reason like `CrashLoopBackOff` or `OOMKilled`.

### restartPolicy

This applies to containers **inside** the Pod, not to the Pod itself.

| Value | Behaviour | Used by |
|---|---|---|
| `Always` | Restart the container whenever it exits, success or not | Deployments (required) |
| `OnFailure` | Restart only on non-zero exit | Jobs |
| `Never` | Never restart | One-shot tasks |

Important: **Kubernetes never restarts a Pod.** It restarts containers inside it, or it replaces the whole Pod with a new one. A Pod object is never resurrected once destroyed.

### How a Pod shuts down

You should know this, because it explains failed deployments and dropped requests.

```text
Pod marked for deletion
      ↓
Pod removed from Service endpoints (stops receiving new traffic)
      ↓
SIGTERM sent to the container
      ↓
Grace period (terminationGracePeriodSeconds, default 30s)
      ↓
Still running? SIGKILL — forced
```

If your application ignores SIGTERM, every deployment drops in-flight requests. Handling SIGTERM and shutting down cleanly is an **application** responsibility that Kubernetes exposes.

## LAB 1 — A Bare Pod

### Goal

See a Pod directly, before any controller is involved.

### Setup

Your `kind` cluster from Volume 1.

```bash
kind create cluster --name devops   # only if you deleted it
kubectl create namespace apps
kubectl config set-context --current --namespace=apps
```

That last line saves you typing `-n apps` on every command.

### Commands

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: solo
  labels:
    app: solo
spec:
  containers:
    - name: web
      image: nginx:1.27
      ports:
        - containerPort: 80
```

Save as `pod.yaml`, then:

```bash
kubectl apply -f pod.yaml
kubectl get pod solo -o wide
kubectl describe pod solo | tail -20
```

Now delete it and see what happens:

```bash
kubectl delete pod solo
kubectl get pods
```

### Expected result

The Pod runs, gets an IP and a node. After deletion, it is **gone**. Nothing brings it back.

### What to observe

Compare this with Volume 0, where deleting a Pod produced a replacement. The difference is that this Pod had no controller managing it. A bare Pod is a one-time instruction, not a desired state.

### Why this matters

You will almost never create bare Pods in real work, except for debugging. This lab exists so you understand what Deployments are actually adding.

### Cleanup

Already deleted.

## From Pods to Deployments

Bare Pods have three problems:

1. If the Pod dies, nothing replaces it
2. If you want 5 copies, you write 5 Pods with 5 names
3. Updating means deleting and recreating — downtime

Kubernetes solves this in two layers.

```text
Deployment    → manages versions and rollouts
     ↓
ReplicaSet    → keeps N identical Pods running
     ↓
Pod           → runs your containers
```

**ReplicaSet** has one job: keep exactly N Pods matching a label selector. That is the reconciliation loop from Volume 0.

**Deployment** manages ReplicaSets. When you change the image, it creates a *new* ReplicaSet and gradually shifts Pods from old to new. The old ReplicaSet stays around with zero Pods — which is exactly how rollback works.

You almost never create a ReplicaSet yourself. You create a Deployment and let it manage them.

In the analogy: the **Deployment is the building manager**. You say "keep 3 rooms occupied with this type of tenant". If a room becomes unusable, the manager arranges another. When you change the requirement, the manager moves tenants gradually rather than emptying the building.

### A Deployment, explained

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
spec:
  replicas: 3
  selector:
    matchLabels:
      app: web              # which Pods this Deployment owns
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1           # how many extra Pods during an update
      maxUnavailable: 0     # how many may be missing during an update
  template:                 # ← this is a Pod definition
    metadata:
      labels:
        app: web            # MUST match the selector above
    spec:
      containers:
        - name: web
          image: nginx:1.27
          ports:
            - containerPort: 80
```

Fields that matter:

* **`replicas`** — how many Pods you want
* **`selector.matchLabels`** — ownership, by label, never by name
* **`template`** — the blueprint; everything under `template.spec` is Pod configuration
* **`strategy`** — how updates happen

The defaults for `maxSurge` and `maxUnavailable` are both 25%. Setting `maxUnavailable: 0` means capacity never drops during a rollout — a good default for user-facing services, at the cost of needing room for one extra Pod.

⚠️ `selector` is **immutable** after creation. If you get it wrong, you delete and recreate the Deployment.

## Rolling Updates and Rollbacks

When you change the Pod template, the Deployment starts a rollout:

```text
Old ReplicaSet: 3 Pods        New ReplicaSet: 0 Pods
        ↓                              ↓
Old: 3                        New: 1   (start one new Pod)
Old: 2                        New: 1   (new Pod ready → remove one old)
Old: 2                        New: 2
...
Old: 0                        New: 3   (rollout complete)
```

The key sentence: **a new Pod must become Ready before an old one is removed.** Readiness is decided by your readiness probe. If you have no readiness probe, Kubernetes assumes a started container is ready — which is how teams ship broken releases with a green rollout.

Commands you will use constantly:

```bash
kubectl rollout status deployment/web      # wait and watch
kubectl rollout history deployment/web     # list revisions
kubectl rollout undo deployment/web        # back to previous revision
kubectl rollout undo deployment/web --to-revision=2
kubectl rollout restart deployment/web     # recreate all Pods (e.g. to pick up new config)
```

`kubectl rollout restart` is genuinely useful — it does a normal rolling restart without changing anything in the spec.

## LAB 2 — Deploy, Update, Break, Roll Back

### Goal

Perform a real zero-downtime update and recover from a bad release.

### Commands

```bash
kubectl create deployment web --image=nginx:1.26 --replicas=3
kubectl rollout status deployment/web
kubectl get rs
```

Update to a new version:

```bash
kubectl set image deployment/web nginx=nginx:1.27
kubectl rollout status deployment/web
kubectl get rs
```

Now deploy something broken:

```bash
kubectl set image deployment/web nginx=nginx:does-not-exist
kubectl get pods -w
```

Press Ctrl-C after ten seconds, then:

```bash
kubectl rollout status deployment/web --timeout=20s
kubectl rollout history deployment/web
kubectl rollout undo deployment/web
kubectl get pods
```

### Expected result

After the first update, `kubectl get rs` shows two ReplicaSets — the old one at 0 Pods, the new one at 3.

With the broken image, you see a new Pod in `ImagePullBackOff` while **the three old Pods keep running and serving traffic**. `rollout status` times out instead of succeeding.

After `undo`, everything is healthy again within seconds.

### What to observe

The broken deployment did not cause an outage. The rollout stalled because the new Pod never became ready, so no old Pod was removed. This is the safety property of a rolling update, and it only works if `maxUnavailable` allows it and your readiness signal is honest.

Also notice: rollback was instant, because the old ReplicaSet still existed with the full old Pod template. Kubernetes did not need to look anything up.

### Why this matters

"How do you roll back a bad release?" is a guaranteed interview question, and the answer is one command — but you must be able to explain *why* it is instant.

### Cleanup

```bash
kubectl delete deployment web
```

## Configuration: ConfigMaps

Never bake configuration into your image. If you do, every environment needs its own image, and changing a setting means a rebuild.

A **ConfigMap** holds non-secret configuration as key-value pairs. In the analogy, it is the **notice board** — information everyone can read.

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
data:
  LOG_LEVEL: "info"
  APP_MODE: "production"
  app.properties: |
    timeout=30
    retries=3
```

There are two ways to use it, and the difference matters.

### As environment variables

```yaml
spec:
  containers:
    - name: app
      image: myapp:1.0
      envFrom:
        - configMapRef:
            name: app-config
```

Simple. But **environment variables are set once, at container start.** Change the ConfigMap and nothing happens until the Pod is recreated.

### As a mounted volume

```yaml
spec:
  containers:
    - name: app
      image: myapp:1.0
      volumeMounts:
        - name: config
          mountPath: /etc/config
          readOnly: true
  volumes:
    - name: config
      configMap:
        name: app-config
```

Each key becomes a file. Mounted files **do** update when the ConfigMap changes, usually within about a minute — but your application must notice and reload them. Most applications do not.

### The practical rule

| You need | Use |
|---|---|
| Simple settings, restart on change is fine | Environment variables |
| Config files, or an app that watches for changes | Volume mount |
| Guaranteed rollout after a config change | Either, plus `kubectl rollout restart` |

That last row is what teams actually do: change the ConfigMap, then restart the Deployment. Explicit and predictable.

## Configuration: Secrets

A **Secret** is the same idea for sensitive data — passwords, tokens, TLS certificates. The locked document cabinet.

```bash
kubectl create secret generic db-creds \
  --from-literal=username=appuser \
  --from-literal=password='S3cur3!'
```

Use it the same way:

```yaml
env:
  - name: DB_PASSWORD
    valueFrom:
      secretKeyRef:
        name: db-creds
        key: password
```

### The truth about Secrets

This is important and frequently misunderstood.

**Secrets are only base64-encoded, not encrypted.** Base64 is not security — anyone can decode it:

```bash
kubectl get secret db-creds -o jsonpath='{.data.password}' | base64 -d
```

What actually protects a Secret:

| Protection | Status |
|---|---|
| Base64 encoding | Not protection at all |
| RBAC — who can read Secrets | **Your main defence**, covered in Volume 5 |
| Encryption at rest in etcd | Must be configured; not on by default in self-managed clusters |
| Not committing them to Git | Your responsibility |

Practical rules:

* Prefer mounting Secrets as files over environment variables — environment variables leak into logs, crash dumps and `docker inspect`-style output
* Never put a Secret manifest in Git with real values
* In production, teams commonly use an external secret manager (Vault, AWS Secrets Manager, Azure Key Vault) with a controller that syncs into Kubernetes Secrets — that is **ecosystem tooling**, not core Kubernetes

## Health Probes

Kubernetes cannot guess whether your application is working. You have to tell it, with probes.

There are three, and they answer three different questions.

| Probe | Question | Action on failure |
|---|---|---|
| **Startup** | Has it finished starting? | Kill and restart the container |
| **Readiness** | Can it serve traffic *right now*? | Remove the Pod from Service endpoints |
| **Liveness** | Is it broken beyond recovery? | Kill and restart the container |

The distinction people miss: **readiness removes traffic, liveness kills the container.** Getting these backwards causes outages.

```yaml
containers:
  - name: app
    image: myapp:1.0
    startupProbe:
      httpGet:
        path: /healthz
        port: 8080
      failureThreshold: 30
      periodSeconds: 5          # allows up to 150s to start
    readinessProbe:
      httpGet:
        path: /ready
        port: 8080
      periodSeconds: 5
    livenessProbe:
      httpGet:
        path: /healthz
        port: 8080
      periodSeconds: 10
      failureThreshold: 3
```

Probe types are `httpGet`, `tcpSocket`, `exec` and `grpc`.

### How the startup probe saves you

Before startup probes existed, a slow-starting application needed a long `initialDelaySeconds` on its liveness probe — which meant a genuinely hung application also went undetected for that long.

A startup probe fixes this: **liveness and readiness are disabled until the startup probe succeeds.** Give the startup probe a generous budget and keep the liveness probe fast. Best of both.

### Probe mistakes that cause real outages

**1. Liveness probe pointing at a dependency.** If your `/healthz` checks the database, then a database blip restarts every Pod at once — turning a slow database into a total outage. Liveness should only answer "is this process broken?"

**2. Same endpoint for readiness and liveness.** Then "temporarily busy" is treated as "permanently broken", and Kubernetes kills Pods that would have recovered.

**3. Timeouts too tight.** `timeoutSeconds` defaults to 1 second. An application under load that takes 1.2 seconds to answer gets killed.

**4. No readiness probe at all.** Kubernetes assumes a started container is ready and sends traffic to an application still loading. Rollouts then complete "successfully" while returning errors.

## Init Containers and Sidecars

**Init containers** run **before** your main containers, one at a time, each to completion.

```yaml
spec:
  initContainers:
    - name: wait-for-db
      image: busybox:1.36
      command: ['sh', '-c', 'until nc -z db 5432; do sleep 2; done']
  containers:
    - name: app
      image: myapp:1.0
```

Use them for: waiting on a dependency, running database migrations, fetching a file the app needs, setting permissions on a volume. If an init container fails, the Pod restarts it according to the restart policy and the main containers never start.

**Sidecar containers** run *alongside* your app for the Pod's whole life. Kubernetes has native sidecar support — an init container with `restartPolicy: Always` starts before the main containers, keeps running, and shuts down after them. This feature moved through alpha and beta in the 1.28–1.29 releases and reached stable in 1.33; on any currently supported release it is available. Check `kubectl explain pod.spec.initContainers.restartPolicy` on your own cluster to confirm.

## The Other Workload Types

You will meet these constantly. Know what each is for.

| Kind | Use it when | Key property |
|---|---|---|
| **Deployment** | Stateless apps — web, API, workers | Pods are interchangeable |
| **StatefulSet** | Databases, queues, anything needing stable identity | Stable names (`db-0`, `db-1`), own storage, ordered start/stop |
| **DaemonSet** | One Pod per node — log agents, monitoring, CNI | Automatically runs on every node, including new ones |
| **Job** | Run once until it succeeds | Tracks completions, retries on failure |
| **CronJob** | Run on a schedule | Creates a Job at each scheduled time |

The most common mistake is using a StatefulSet because something "sounds stateful". If your Pods do not need stable individual identity and per-Pod storage, a Deployment is simpler and better. We cover StatefulSet storage properly in Volume 4.

## LAB 3 — Project: A Configured, Health-Checked Application

### Goal

Build something close to real: a Deployment with configuration, a secret, and correct probes.

### Commands

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: site-config
data:
  index.html: |
    <h1>Shop API</h1>
    <p>environment: production</p>
---
apiVersion: v1
kind: Secret
metadata:
  name: api-creds
type: Opaque
stringData:
  API_TOKEN: "demo-token-not-real"
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: shop
  labels:
    app: shop
spec:
  replicas: 3
  selector:
    matchLabels:
      app: shop
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  template:
    metadata:
      labels:
        app: shop
    spec:
      containers:
        - name: web
          image: nginx:1.27
          ports:
            - containerPort: 80
          env:
            - name: API_TOKEN
              valueFrom:
                secretKeyRef:
                  name: api-creds
                  key: API_TOKEN
          volumeMounts:
            - name: site
              mountPath: /usr/share/nginx/html
          readinessProbe:
            httpGet:
              path: /
              port: 80
            periodSeconds: 5
          livenessProbe:
            httpGet:
              path: /
              port: 80
            periodSeconds: 10
            failureThreshold: 3
      volumes:
        - name: site
          configMap:
            name: site-config
```

Save as `shop.yaml`.

```bash
kubectl apply -f shop.yaml
kubectl rollout status deployment/shop
kubectl exec deploy/shop -- cat /usr/share/nginx/html/index.html
kubectl exec deploy/shop -- printenv API_TOKEN
```

Now change the config and observe the two behaviours:

```bash
kubectl edit configmap site-config     # change the text, save
sleep 70
kubectl exec deploy/shop -- cat /usr/share/nginx/html/index.html
```

### Expected result

The mounted file shows your new text without any Pod restart. The environment variable would **not** have changed this way — it needs a restart:

```bash
kubectl rollout restart deployment/shop
```

### What to observe

You just saw the core difference between mounted config and environment config, on a live application. This single behaviour is behind a lot of "I changed the config and nothing happened" confusion.

### Why this matters

This is the shape of nearly every real workload: a Deployment, config from a ConfigMap, credentials from a Secret, probes for health. Everything we add in later volumes attaches to this.

### Cleanup

```bash
kubectl delete -f shop.yaml
```

## Troubleshooting

Remember the rule from Volume 1: **`describe` tells you what Kubernetes tried to do; `logs` tells you what your application did.**

### CrashLoopBackOff

**Symptom:** the Pod restarts over and over, with increasing gaps between attempts.

**What it means:** the container starts, then exits. Kubernetes restarts it, waits longer each time (roughly 10s, 20s, 40s… capped around 5 minutes). `CrashLoopBackOff` is the *waiting* state, not the crash itself.

**Investigation:**

```bash
kubectl describe pod <name>              # exit code and restart count
kubectl logs <name>                      # current attempt
kubectl logs <name> --previous           # the attempt that actually failed ← key command
```

**Common causes:**

| Exit code / clue | Likely cause |
|---|---|
| Exit 1 with a stack trace | Application error — missing config, bad connection string |
| Exit 0 immediately | Container has no long-running process (common with base images) |
| Exit 137 | Killed — usually OOM, check `describe` for `OOMKilled` |
| Exit 127 | Command not found — wrong `command` or entrypoint |
| Crashes only after some seconds | Failing liveness probe, not a crash at all |

**Prevention:** correct probes, resource limits that match reality, and validating config before deploying.

### ImagePullBackOff / ErrImagePull

**Symptom:** the Pod never starts; status shows one of these.

**Investigation:** `kubectl describe pod <name>` and read the event — it states the actual reason.

**Common causes:** typo in the image name or tag; the tag does not exist; a private registry with no `imagePullSecret`; the node cannot reach the registry.

**Prevention:** use explicit version tags rather than `latest`, and configure registry credentials at the ServiceAccount level so every Pod inherits them.

### OOMKilled

**Symptom:** container restarts; `describe` shows `Reason: OOMKilled`, exit code 137.

**What it means:** the container exceeded its memory **limit** and the Linux kernel killed it. This is not Kubernetes being harsh — it is a cgroup limit being enforced.

**Investigation:** compare the limit against actual usage (`kubectl top pod`, if the metrics server is installed), and check whether usage grows steadily, which suggests a leak.

**Prevention:** set limits based on measurement, not guesswork. Volume 4 covers requests and limits properly.

### Pod stays Pending

Covered in Volume 1 — this is the scheduler. `kubectl describe pod` names the reason.

### The general method

1. `kubectl get pods` — what state is it in?
2. `kubectl describe pod <name>` — read the **Events** at the bottom
3. Did the container start? No → image, scheduling or volume problem. Yes → `kubectl logs --previous`
4. Is it running but not serving? → probes and Service (Volume 3)

## Production Reality

| Topic | Learning setup | Production |
|---|---|---|
| Image tags | `nginx:latest` | Explicit versions or image digests |
| Applying changes | `kubectl apply` by hand | Git + a CD tool (Argo CD, Flux) — ecosystem, not core |
| Replicas | 1 | At least 2, spread across nodes and zones |
| Probes | Often skipped | Always present, with separate readiness and liveness endpoints |
| Resources | Not set | Requests and limits always set |
| Secrets | `kubectl create secret` | External secret manager synced in |
| Config changes | Edit and hope | Change in Git, then `rollout restart` |
| Rollback plan | "We'll figure it out" | `rollout undo` rehearsed, plus a revision history policy |

One production note on `revisionHistoryLimit`: a Deployment keeps old ReplicaSets so you can roll back, defaulting to 10. That is fine, but it means `kubectl get rs` gets noisy. Do not delete old ReplicaSets manually to tidy up — you are deleting your rollback path.

## Core vs Ecosystem

| Category | From this volume |
|---|---|
| **Kubernetes core** | Pod, ReplicaSet, Deployment, StatefulSet, DaemonSet, Job, CronJob, ConfigMap, Secret, probes, init and sidecar containers |
| **Project tooling** | `kubectl` and its `rollout`, `set image`, `create secret` helpers |
| **Ecosystem** | Helm and Kustomize (templating manifests), Argo CD and Flux (delivering them), External Secrets Operator, Vault |
| **Cloud provider** | Managed registries (ECR, ACR, Artifact Registry), cloud secret managers |

A Deployment is Kubernetes. A Helm chart that produces a Deployment is not. When something is wrong, always debug the object in the cluster, not the template that generated it.

## Things Senior Engineers Notice

1. **A rollout finishing does not mean the release works.** It means new Pods reported ready. If readiness is weak, you have shipped a broken version with a green light.
2. **`imagePullPolicy` is silently set by your tag.** With tag `latest` it defaults to `Always`; with a fixed tag it defaults to `IfNotPresent`. That is why "I pushed a new image to the same tag and nothing changed".
3. **`maxUnavailable: 0` with only one node** means a rollout can deadlock if the node cannot fit an extra Pod.
4. **A liveness probe that checks a dependency turns a small outage into a large one.**
5. **Environment variables from ConfigMaps never update.** Half of "config not applied" tickets are this.
6. **Secrets in environment variables leak.** Crash dumps, debug endpoints and process listings all expose them. Mount files instead.
7. **`kubectl delete pod` is not a restart.** It is a delete; the controller creates a new one. Fine for stateless apps, potentially harmful for StatefulSets.
8. **If the app does not handle SIGTERM, every deploy drops requests** — and the graphs will blame Kubernetes.
9. **Deployment `selector` cannot be changed.** Design labels carefully at creation time.
10. **Init containers run on every Pod restart**, not once per Deployment. Migrations in an init container will run many times — they must be safe to repeat.
11. **`kubectl edit` changes disappear** on the next apply from your manifests. Change the source of truth.

## Interview Preparation

### Level 1 — Fundamentals

**Q: What is a Pod?**

Answer: The smallest unit Kubernetes runs. It is one or more containers that share a network address and can share storage, always scheduled together on the same node. Usually one container, with extra containers only for helpers like a log shipper or proxy.

**Q: What is the difference between a Deployment and a ReplicaSet?**

Answer: A ReplicaSet keeps a fixed number of identical Pods running. A Deployment manages ReplicaSets so you can update versions — it creates a new ReplicaSet for the new version and shifts Pods over gradually. The old ReplicaSet is kept, which is how rollback works.

**Q: ConfigMap vs Secret?**

Answer: Both hold configuration. Secrets are for sensitive values and are handled a bit more carefully — but they are only base64-encoded, so the real protection is RBAC and encryption at rest.

### Level 2 — Practical

**Q: What is the difference between a readiness and a liveness probe?**

How to think: state the *action*, not just the meaning.

Answer: Readiness decides whether the Pod receives traffic — if it fails, the Pod is removed from the Service endpoints but keeps running. Liveness decides whether the container is broken — if it fails, the container is killed and restarted. Readiness is for temporary problems, liveness is for permanent ones.

**Q: How do you perform a zero-downtime deployment?**

Answer: Use a Deployment with a rolling update, `maxUnavailable: 0` so capacity never drops, and a genuine readiness probe so a new Pod only receives traffic when it can serve. The application also needs to handle SIGTERM and finish in-flight requests during the grace period.

**Q: You changed a ConfigMap but the app behaviour did not change. Why?**

Answer: If the values are injected as environment variables, they are only read at container start — the Pods need to be recreated, usually with `kubectl rollout restart`. If it is mounted as a volume, the files do update, but the application has to reload them.

### Level 3 — Scenario

**Q: A Pod is in `CrashLoopBackOff`. Walk me through your investigation.**

How to think: describe evidence gathering, not a fix.

Answer: First `kubectl describe pod` to see the restart count, exit code and events. Then `kubectl logs --previous`, because the current container may have just started and the useful output is from the failed attempt. Exit code 137 with `OOMKilled` points to memory limits. Exit 127 means the command was not found. A clean application stack trace usually means missing configuration or an unreachable dependency. I would also check whether it is actually a failing liveness probe restarting a healthy app rather than a real crash.

**Q: Your rollout is stuck at 2 of 5 Pods updated. What is happening?**

Answer: New Pods are not becoming ready, so the Deployment will not remove old ones — which is the safety behaviour working correctly. I would `kubectl describe` a new Pod and look at events and probe failures. Common causes are a bad image, a failing readiness probe, or insufficient cluster capacity for the surge Pods. The old Pods are still serving, so there is no outage; I would fix or `rollout undo`.

**Q: A team reports that every deployment causes a spike of 502 errors.**

Answer: Most likely the application does not handle SIGTERM, so it is killed mid-request, or it stops accepting connections before Kubernetes removes it from endpoints. I would check the shutdown handling, consider a `preStop` hook with a short sleep so endpoint removal propagates first, and confirm `maxUnavailable` is not letting capacity drop too far.

### Level 4 — Senior Thinking

**Q: When would you use a StatefulSet instead of a Deployment?**

Answer: Only when Pods need individual identity — a stable network name, their own persistent volume, and ordered startup or shutdown. Databases and clustered systems like Kafka need this. For anything stateless, a Deployment is simpler, faster to roll out, and easier to operate. Using a StatefulSet unnecessarily adds ordering constraints that slow every deployment down.

**Q: How would you design health checks for a service with a slow start and an unreliable downstream dependency?**

Answer: A startup probe with a generous failure budget so slow starts are not mistaken for failures. A liveness probe that only checks the process itself — never the dependency — so a downstream outage does not restart every Pod. A readiness probe that *can* consider the dependency, so the Pod stops taking traffic while it cannot serve, but is not killed and can recover when the dependency returns.

## Summary

| Concept | One line |
|---|---|
| Pod | Smallest unit; containers sharing one IP, scheduled together |
| ReplicaSet | Keeps N Pods matching a label selector |
| Deployment | Manages ReplicaSets to give safe updates and rollbacks |
| Rolling update | New Pod must be Ready before an old one is removed |
| Rollback | Instant, because the old ReplicaSet still exists |
| ConfigMap | Non-secret config; env vars never update, mounted files do |
| Secret | Same idea for sensitive data; base64 only — RBAC is the real protection |
| Readiness | Controls traffic |
| Liveness | Controls restarts |
| Startup | Protects slow starters from liveness |

## What You Learned

You can now deploy a real application, update it without downtime, roll back a bad release in one command, separate configuration and secrets from your image, and tell Kubernetes how to judge health. You can also debug the three failures you will meet most often.

Practical skills gained: writing a production-shaped Deployment from scratch, reading Pod status correctly, and investigating a crash with `describe` and `logs --previous`.

## Next Volume

**Volume 3 — Networking and Service Discovery** answers the question your application now raises: how does anyone actually reach it? Pod IPs and why you cannot use them, Services and how they find Pods through EndpointSlices, cluster DNS with CoreDNS, Ingress and where the Gateway API fits in 2026, and NetworkPolicy for isolation. Plus the debugging path for the classic "the Pod is running but nobody can reach it".

Say **continue** when you are ready.
