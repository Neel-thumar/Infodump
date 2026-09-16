---
id: volume-2-helm-kustomize-environments
title: "Volume 2 — Helm, Kustomize, and Multi-Environment Workflows"
order: 2
description: "Managing multiple environments using GitOps promotion, Helm, and Kustomize."
draft: false
---

# Mastering GitOps: Argo CD Engineering Guide

## Volume 2 — Helm, Kustomize, and Multi-Environment Workflows

## What Are We Learning?
In Volume 1, we deployed raw, static YAML files. This is fine for a single application, but it fails in the real world. You do not want to copy-paste the exact same YAML into a `staging` folder and a `production` folder just to change the number of replicas or the image tag. 

In this volume, we will learn how Argo CD handles dynamic templates using tools like Helm and Kustomize. We will restructure our Git repository to support multiple environments and use Argo CD to deploy a `staging` and a `production` version of our web application from a single source of truth.

## Why Should a DevOps Engineer Care?
Promotion between environments is a core DevOps responsibility. If you do not structure your GitOps repository correctly, you will end up with massive amounts of duplicated code. Furthermore, if you do not understand the difference between a "Source Manifest" and a "Rendered Manifest," you will struggle to debug why Argo CD is complaining about YAML syntax errors before it even touches the cluster.

## What You Will Be Able to Do
By the end of this volume, you will be able to:
* Explain the difference between source manifests and rendered manifests.
* Restructure a Git repository for multi-environment GitOps.
* Deploy applications using Kustomize through Argo CD.
* Promote a change from Staging to Production using Git.
* Troubleshoot manifest rendering failures.

---

## Source Manifests vs. Rendered Manifests

To use Argo CD effectively with templating tools, you must understand how the **Repository Server** works.

When Argo CD pulls your Git repository, it does not send your Helm charts or Kustomize files directly to Kubernetes. Kubernetes does not understand Helm or Kustomize. Kubernetes only understands raw YAML.

**The Rendering Pipeline:**
1. **Source Manifests:** The files in your Git repository (Helm `values.yaml`, charts, Kustomize `kustomization.yaml`, patches). 
2. **Rendering:** The Argo CD Repository Server executes `helm template` or `kustomize build` in memory.
3. **Rendered Manifests:** The final, raw Kubernetes YAML output.
4. **Reconciliation:** The Application Controller compares the Rendered Manifests against the Actual State in the cluster.

If your Helm chart has a syntax error, the pipeline breaks at step 2. The Application Controller will report a `Manifest rendering error` and the sync will fail.

---

## Environment Separation Strategies

How do we separate Staging and Production in GitOps? There are two common patterns:

1. **Branch-based (Legacy/Discouraged):** `main` branch is production, `staging` branch is staging. You promote by merging branches. *Problem: Branches drift permanently, and resolving merge conflicts on YAML is painful.*
2. **Directory-based (Modern/Recommended):** A single branch (`main`) contains different folders for different environments (e.g., `overlays/staging` and `overlays/production`). You promote by updating the image tag or values in the production folder and committing. 

We will use the **Directory-based** approach with **Kustomize**, as it is built directly into `kubectl` and Argo CD natively understands it.

---

## Practical Lab: Multi-Environment GitOps

We will upgrade our continuous project. We will convert our static YAML into a Kustomize base, create staging and production overlays, and deploy two separate Applications.

#### Goal
Restructure the Git repository using Kustomize. Deploy a staging environment (1 replica) and a production environment (3 replicas).

#### Setup Requirements
Your `kind` cluster and Argo CD from Volume 1 must be running.

#### Step 1: Restructure the Git Repository (The Blueprint)
On your laptop, open your `gitops-webapp` repository. Delete the old `argo-application.yaml` (if it is inside the repo) and restructure your folders to look exactly like this:

```text
gitops-webapp/
├── base/
│   ├── deployment.yaml
│   ├── service.yaml
│   └── kustomization.yaml
└── overlays/
    ├── staging/
    │   └── kustomization.yaml
    └── production/
        ├── kustomization.yaml
        └── replica-patch.yaml

```

**1. Move your Volume 0 YAMLs into `base/**`
Move `deployment.yaml` and `service.yaml` into the `base/` folder.
Create `base/kustomization.yaml`:

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - deployment.yaml
  - service.yaml

```

**2. Create the Staging Overlay**
Create `overlays/staging/kustomization.yaml`:

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - ../../base
namespace: staging
namePrefix: staging-

```

**3. Create the Production Overlay**
Create `overlays/production/replica-patch.yaml` (this overrides the base to have 3 replicas):

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: webapp-deployment
spec:
  replicas: 3

```

Create `overlays/production/kustomization.yaml`:

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - ../../base
namespace: production
namePrefix: prod-
patches:
  - path: replica-patch.yaml

```

Commit and push these changes to GitHub:

```bash
git add .
git commit -m "Convert to Kustomize for Staging and Production"
git push origin main

```

#### Step 2: Create the Staging and Production Namespaces

Create the namespaces in your local cluster:

```bash
kubectl create namespace staging
kubectl create namespace production

```

#### Step 3: Define the Argo CD Applications

Create a file on your laptop called `multi-env-apps.yaml` (keep it outside the Git repo).

*Replace `<YOUR_GITHUB_USERNAME>` with your actual username.*

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: webapp-staging
  namespace: argocd
spec:
  project: default
  source:
    repoURL: [https://github.com/](https://github.com/)<YOUR_GITHUB_USERNAME>/gitops-webapp.git
    targetRevision: main
    path: overlays/staging
  destination:
    server: [https://kubernetes.default.svc](https://kubernetes.default.svc)
    namespace: staging
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
---
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: webapp-production
  namespace: argocd
spec:
  project: default
  source:
    repoURL: [https://github.com/](https://github.com/)<YOUR_GITHUB_USERNAME>/gitops-webapp.git
    targetRevision: main
    path: overlays/production
  destination:
    server: [https://kubernetes.default.svc](https://kubernetes.default.svc)
    namespace: production
  syncPolicy:
    automated:
      prune: true
      selfHeal: true

```

Apply it:

```bash
kubectl apply -f multi-env-apps.yaml

```

*Note: You may want to delete the old `simple-webapp` Application from Volume 1 using the UI or CLI to avoid confusion.*

#### Expected Result

Check your Argo CD UI. You will see two new Applications: `webapp-staging` and `webapp-production`. Both will automatically sync.

Verify in your terminal:

```bash
kubectl get pods -n staging
kubectl get pods -n production

```

You should see 1 pod in staging (with the prefix `staging-`) and 3 pods in production (with the prefix `prod-`).

#### What to Observe

Notice the `path` field in the Application manifests. Argo CD knows exactly which folder to look at. Because Argo CD sees a `kustomization.yaml` file in that folder, it automatically runs `kustomize build` behind the scenes, generates the raw YAML, and applies it to the target namespace.

#### Break It & Troubleshoot It (Manifest Rendering Failure)

Let's simulate a common developer mistake.
Open `overlays/production/kustomization.yaml` on your laptop and intentionally misspell the patch file name:

```yaml
patches:
  - path: replica-patch-TYPO.yaml

```

Commit and push this broken change:

```bash
git commit -am "Introduce Kustomize typo"
git push origin main

```

**Troubleshoot It:**
Go to the Argo CD UI. The `webapp-production` application will show a status of **Unknown** or **Sync Failed**.
Click on the Application, and look for the error message at the top. It will say something like: `rpc error: code = Unknown desc = Manifest generation error: kustomize build failed`.

**Investigation:**
Ask yourself: "Is this a sync problem or a rendering problem?"
Because the error says `Manifest generation error`, the Kubernetes API was never touched. The **Repository Server** failed to build the template because the file does not exist.

Fix the typo in Git, push the commit, and watch Argo CD automatically recover and sync.

#### Cleanup

Keep the Git repository and cluster running. We will use this multi-environment setup in Volume 3 when we lock down security and add RBAC.

---

## Things Senior DevOps Engineers Notice

1. **Helm vs. Kustomize in GitOps:** Helm was built as a package manager (like `apt` or `yum`). Kustomize was built as a configuration overlay tool. GitOps teams often combine them: they use a third-party Helm chart (like Prometheus) as a `base`, and use Kustomize to patch the Helm output for different environments. Argo CD supports this natively.
2. **Promoting Code vs. Configuration:** In GitOps, you build your Docker image *once* in CI. To promote from Staging to Production, you do not rebuild the image. You simply update the `imageTag` in the `overlays/production` folder and commit. The Git commit *is* the promotion.
3. **The Danger of Non-Deterministic Templates:** If your Helm chart uses random string generators (like generating a random password on the fly inside the template), Argo CD will break. Every time Argo CD polls Git and renders the template, the password will change. Argo CD will see this as Drift and constantly sync in an infinite loop. Templates must be 100% deterministic (reproducible).

---

## Interview Preparation

#### Level 1 — Fundamentals

**Q: What is the difference between a Source Manifest and a Rendered Manifest?**
A: A source manifest is the templated file stored in Git (like a Helm chart or Kustomize overlay). A rendered manifest is the final, raw Kubernetes YAML generated by a tool like Argo CD after processing the templates.

#### Level 2 — Practical

**Q: How do you promote an application from Staging to Production using GitOps?**
A: Using a directory-based approach, I would update the environment-specific values (such as the image tag) in the production directory (e.g., `overlays/production/kustomization.yaml` or `values-prod.yaml`), and merge that change into the main branch. Argo CD will detect the change in the production directory and sync the cluster.

#### Level 3 — Scenario Based

**Q: "An engineer pushed a new Helm chart update to Git. Argo CD shows a 'Manifest generation error' and the sync failed. Is the cluster broken?"**
**How I should think:** Understand the separation between the Repository Server (rendering) and the Application Controller (applying).
**Answer:** No, the cluster is not broken. The failure happened during the rendering phase in the Argo CD Repository Server before any changes were applied to Kubernetes. The cluster is still safely running the previous healthy state. The engineer needs to fix the syntax error in the Helm chart in Git.

#### Level 4 — Senior Thinking

**Q: "Why is the branch-based environment strategy (e.g., a 'staging' branch and a 'production' branch) considered an anti-pattern in modern GitOps?"**
**How I should think:** Think about long-term maintenance, Git history, and merge conflicts.
**Answer:** Branch-based environments lead to permanent branch drift. Staging and production branches will diverge over time because hotfixes might go directly to production, or environment-specific configurations (like replica counts) will conflict during pull requests. It forces engineers to resolve YAML merge conflicts constantly. A directory-based approach on a single `main` branch keeps the Git history linear, makes environment differences explicit, and allows you to see the entire system's state in a single commit.

---

*This concludes Volume 2. You now understand how to template and promote applications across environments using GitOps. In Volume 3, we will tackle the most critical part of production GitOps: Security, AppProjects, RBAC, and how to safely handle secrets.*