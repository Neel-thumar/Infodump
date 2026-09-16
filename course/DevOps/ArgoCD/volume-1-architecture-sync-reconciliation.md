---
id: volume-1-architecture-sync-reconciliation
title: "Volume 1 — Argo CD Architecture, Sync, and Reconciliation"
order: 1
description: "Understanding Argo CD's internal architecture, drift detection, and automated self-healing."
draft: false
---

# Mastering GitOps: Argo CD Engineering Guide

## Volume 1 — Argo CD Architecture, Sync, and Reconciliation

## What Are We Learning?
In Volume 0, we deployed an application manually by clicking "Sync" in the UI. While this is great for learning, it is not continuous delivery. 

In this volume, we will look under the hood. You will learn the internal architecture of Argo CD so you understand exactly how it talks to Git and Kubernetes. Then, we will configure full automation: Automated Sync, Self-Heal, and Prune. We will intentionally break our cluster using `kubectl` and watch Argo CD automatically fix the drift.

## Why Should a DevOps Engineer Care?
If you do not understand Argo CD's architecture, you cannot troubleshoot it when it breaks. If an application is stuck in an "OutOfSync" state, you need to know if the problem is Argo CD failing to read Git, or failing to talk to Kubernetes. Furthermore, turning on full automation without understanding "Prune" and "Self-Heal" is dangerous. You might accidentally delete a production database or fight against a teammate trying to apply an emergency hotfix.

## What You Will Be Able to Do
By the end of this volume, you will be able to:
* Explain the roles of the Repository Server and Application Controller.
* Understand the difference between Automated Sync, Self-Heal, and Prune.
* Enable automated GitOps reconciliation.
* Detect and investigate drift.
* Explain what happens during a reconciliation loop.

---

## Argo CD Architecture: The Mental Model

Argo CD is not a single magic binary. It is a collection of microservices running inside your Kubernetes cluster. As a DevOps engineer, you must understand the three most important components:

**1. The Repository Server (The Reader)**
This component's only job is to talk to Git. It clones your Git repository, caches the files, and generates the final Kubernetes manifests. If GitHub goes down, or your repository credentials expire, the Repository Server is the component that will log the error.

**2. The Application Controller (The Inspector)**
This is the brain. It constantly compares two things:
* The **Desired State** (provided by the Repository Server).
* The **Actual State** (which it reads directly from the Kubernetes API).
When it detects a difference (drift), it marks the Application as `OutOfSync`. If auto-sync is enabled, it pushes the correct manifests to the Kubernetes API.

**3. The Redis Cache**
Argo CD uses Redis to cache Git repositories and Kubernetes resources. This is why Argo CD is so fast. It does not clone your entire Git repository every second. 

**The Flow:**
Git Repository -> Repository Server -> Application Controller -> Kubernetes API

---

## Sync Concepts: Manual vs Automated

In GitOps, there are strict definitions for how the building is updated to match the blueprint.

**Manual Sync**
Argo CD detects drift but does nothing. It waits for a human to click "Sync" or run an Argo CD CLI command. We used this in Volume 0.

**Automated Sync**
When a developer pushes a new commit to Git, Argo CD automatically applies the new YAML to the cluster. 

**Self-Heal**
What if nobody touched Git, but someone manually deleted a Pod or changed a Service port using `kubectl`? Automated Sync only triggers on Git changes. **Self-Heal** tells Argo CD to also trigger a sync if the *cluster* changes and drifts away from Git. It reverts manual changes.

**Prune**
If you delete `service.yaml` from your Git repository, what should Argo CD do? By default, Argo CD will leave the Service running in the cluster (to prevent accidental deletions). If you enable **Prune**, Argo CD will actively delete resources in the cluster that no longer exist in Git.

---

## Practical Lab: Full Automation and Drift Recovery

We are going to upgrade our web application from Volume 0. We will turn on full automation, intentionally break the application, and watch Argo CD recover it.

#### Goal
Enable Automated Sync, Prune, and Self-Heal. Introduce manual cluster drift and observe self-healing in action.

#### Setup Requirements
This continues directly from Volume 0. Ensure your `kind` cluster is running, Argo CD is installed, and your GitHub repository (`gitops-webapp`) is available.

#### Step 1: Update the Argo CD Application Manifest
Open the `argo-application.yaml` file on your laptop (the one we created in Volume 0). We are going to add the `syncPolicy` block.

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: simple-webapp
  namespace: argocd
spec:
  project: default
  source:
    repoURL: [https://github.com/](https://github.com/)<YOUR_GITHUB_USERNAME>/gitops-webapp.git
    targetRevision: main
    path: manifests
  destination:
    server: [https://kubernetes.default.svc](https://kubernetes.default.svc)
    namespace: default
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
    - CreateNamespace=true

```

Apply this updated Application definition to the cluster:

```bash
kubectl apply -f argo-application.yaml

```

#### Step 2: Trigger a Git Deployment

Let's see Automated Sync in action. On your laptop, open your Git repository folder (`gitops-webapp`).
Edit `manifests/deployment.yaml` and change the Nginx image from `1.24` to `1.25`:

```yaml
      containers:
      - name: nginx
        image: nginx:1.25
        ports:
        - containerPort: 80

```

Commit and push the change:

```bash
git add manifests/deployment.yaml
git commit -m "Update nginx image to 1.25"
git push origin main

```

#### Expected Result (Automated Sync)

Go to your Argo CD UI. Within about 3 minutes (Argo CD polls Git every 3 minutes by default), you will see the Application sync automatically.

Verify the cluster has the new image:

```bash
kubectl get deployment webapp-deployment -n default -o=jsonpath='{.spec.template.spec.containers[0].image}'

```

It should return `nginx:1.25`. You just deployed via Git push without CI server scripts!

#### Step 3: Break the Cluster (Create Drift)

Now, pretend a junior engineer logs into the cluster and tries to scale the application manually to handle traffic, completely ignoring GitOps.

Run this command to simulate the manual intervention:

```bash
kubectl scale deployment webapp-deployment --replicas=5 -n default

```

Quickly check the pods:

```bash
kubectl get pods -n default

```

You will see 5 pods spinning up.

#### Expected Result (Self-Heal)

Keep watching the Argo CD UI, or run `kubectl get pods -n default -w`.
Almost instantly, Argo CD will detect that the Actual State (5 replicas) does not match the Desired State in Git (2 replicas).
Because we enabled `selfHeal: true`, Argo CD will aggressively scale the deployment back down to 2 replicas.

#### What to Observe

The Application Controller detected the drift and instantly reverted the manual change. The cluster is now self-healing. Git is truly the single source of truth. If the engineer genuinely needs 5 replicas, they *must* make a Git commit.

#### Step 4: Prune a Resource

In your Git repository, delete the `service.yaml` file.

```bash
git rm manifests/service.yaml
git commit -m "Remove service"
git push origin main

```

Watch the Argo CD UI. Because we enabled `prune: true`, Argo CD will see the file is gone and will execute `kubectl delete service webapp-service` on your behalf. The resource is safely cleaned up.

#### Cleanup

You can leave this running. We will use it in Volume 2 when we introduce Helm and Kustomize.

---

## Things Senior DevOps Engineers Notice

1. **Self-Heal fights emergency fixes:** During a massive production outage, you might need to apply a hotfix using `kubectl` immediately to stop customer impact, while you write the Git commit. If Self-Heal is on, Argo CD will instantly undo your emergency fix. Senior engineers often temporarily disable auto-sync during P1 incidents, fix the issue, update Git, and then turn auto-sync back on.
2. **Prune is dangerous:** If someone accidentally deletes a folder in Git, Prune will immediately delete those resources in production. For critical stateful resources (like databases or PVCs), senior engineers use Kubernetes annotations (like `helm.sh/resource-policy: keep`) to protect them from Prune operations.
3. **The 3-Minute Polling Delay:** Argo CD polls Git every 3 minutes. In a fast-paced environment, waiting 3 minutes is annoying. In production, we configure GitHub Webhooks. When a developer pushes code, GitHub pings Argo CD, and the sync happens in 1 second.
4. **Controller CPU Spikes:** The Application Controller is doing a lot of work. If you have 500 Applications, comparing Git to the cluster every few seconds consumes heavy CPU. Platform teams monitor the Application Controller's performance strictly.

---

## Interview Preparation

#### Level 1 — Fundamentals

**Q: What is the difference between the Repository Server and the Application Controller in Argo CD?**
A: The Repository Server is responsible for communicating with Git, cloning repositories, and rendering manifests. The Application Controller is responsible for communicating with the Kubernetes API, comparing the rendered manifests against the live cluster state, and executing the sync.

**Q: What does Prune do in Argo CD?**
A: Prune allows Argo CD to delete resources in the Kubernetes cluster if their corresponding definitions are removed from the Git repository.

#### Level 2 — Practical

**Q: How does Automated Sync differ from Self-Heal?**
A: Automated Sync triggers a deployment when it detects a new commit in the Git repository. Self-Heal triggers a sync when it detects that the actual state in the Kubernetes cluster has drifted away from the desired state, even if Git has not changed.

**Q: If I want Argo CD to automatically apply Git changes but NOT delete resources if they are removed from Git, what should my configuration look like?**
A: You would enable Automated Sync but ensure `prune` is set to `false` (which is the default behavior if not explicitly enabled).

#### Level 3 — Scenario Based

**Q: "An engineer reports that they are trying to apply a temporary network policy using `kubectl apply` to block a malicious IP, but the policy keeps disappearing after a few seconds. What is happening?"**
**How I should think:** What mechanism undoes manual changes?
**Answer:** The namespace is likely managed by an Argo CD Application with `selfHeal: true` enabled. Argo CD sees a new network policy in the cluster that does not exist in Git, identifies it as drift, and prunes it to match the Git repository. The engineer must either commit the policy to Git or temporarily disable self-heal.

#### Level 4 — Senior Thinking

**Q: "We have 10,000 developers and 50 Kubernetes clusters. Our Argo CD Repository Server is constantly running out of memory. How would you investigate and fix this?"**
**How I should think:** The Repo Server caches Git. High memory means too much Git parsing or huge repos.
**Answer:** The Repository Server caches Git repositories and renders manifests. If memory is exhausted, we likely have monolithic repositories (mono-repos) that are too large, or we are running heavy Kustomize/Helm builds without enough caching. I would first scale the Repository Server replicas horizontally. Then, I would investigate splitting massive Git repositories into smaller, application-specific repositories to reduce the clone size, and ensure Redis is properly sized to handle the manifest caching.

---

*This concludes Volume 1. You now have a fully automated, self-healing GitOps pipeline. In Volume 2, we will move away from raw YAML and learn how to use Helm and Kustomize to manage multiple environments (Staging and Production) from the same Git repository.*