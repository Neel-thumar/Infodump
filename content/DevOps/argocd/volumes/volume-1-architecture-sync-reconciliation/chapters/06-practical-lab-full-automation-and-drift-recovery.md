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

