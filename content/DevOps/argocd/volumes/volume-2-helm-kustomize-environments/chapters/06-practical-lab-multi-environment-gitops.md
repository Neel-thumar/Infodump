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

