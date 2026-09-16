## Practical Lab: Multi-Cluster GitOps

We will add a second Kubernetes cluster. We will leave `webapp-staging` in our first cluster, but we will move `webapp-production` to the second cluster.

#### Goal
Create a second `kind` cluster, register it with our existing Argo CD, and update our GitOps system to deploy across both clusters simultaneously.

#### Setup Requirements
You need your existing `gitops-learning` cluster running Argo CD, and the Argo CD CLI installed on your laptop. (If you don't have the CLI, you can download it via `brew install argocd` on Mac or standard package managers on Linux/Windows).

#### Step 1: Create the Second Cluster (The Production Building)
Open a new terminal tab and create a second cluster:

```bash
kind create cluster --name production-cluster

```

Verify you now have two contexts:

```bash
kubectl config get-contexts

```

You should see `kind-gitops-learning` (our original cluster with Argo CD) and `kind-production-cluster` (our new, empty cluster).

#### Step 2: Login to Argo CD CLI

To register a cluster easily, we use the Argo CD CLI. First, port-forward the Argo CD server (if it is not already running):

```bash
kubectl port-forward svc/argocd-server -n argocd 8080:443 --context kind-gitops-learning

```

In another terminal, log in using the CLI (username `admin` and the password from Volume 0):

```bash
argocd login localhost:8080 --insecure

```

#### Step 3: Register the Second Cluster

We will tell Argo CD to add the `production-cluster` context.

```bash
argocd cluster add kind-production-cluster

```

*Note: Because both clusters are running locally in Docker via `kind`, this command automatically handles setting up the ServiceAccount and pulling the token.*

Verify the cluster is registered:

```bash
argocd cluster list

```

You will see two clusters: `https://kubernetes.default.svc` (the local control plane) and a new URL for the production cluster (e.g., `https://127.0.0.1:32768`). Note down this new URL.

#### Step 4: Update the AppProject

In Volume 3, we restricted `webapp-project` to only allow deployments to the local cluster. We must update the security boundary to allow deployments to the new production cluster.

Edit `webapp-project.yaml` on your laptop. Replace `<YOUR_PRODUCTION_CLUSTER_URL>` with the URL you got from the `argocd cluster list` command.

```yaml
apiVersion: argoproj.io/v1alpha1
kind: AppProject
metadata:
  name: webapp-project
  namespace: argocd
spec:
  description: "Project for the WebApp Team"
  sourceRepos:
  - "[https://github.com/](https://github.com/)<YOUR_GITHUB_USERNAME>/gitops-webapp.git"
  destinations:
  # Allow staging in the local control plane cluster
  - server: "[https://kubernetes.default.svc](https://kubernetes.default.svc)"
    namespace: "staging"
  # Allow production in the new external cluster
  - server: "<YOUR_PRODUCTION_CLUSTER_URL>"
    namespace: "production"
  clusterResourceWhitelist: []

```

Apply the updated project to the **control plane** cluster:

```bash
kubectl apply -f webapp-project.yaml --context kind-gitops-learning

```

#### Step 5: Update the Production Application

Now, we point the `webapp-production` Application to the new cluster.

Edit `multi-env-apps.yaml` on your laptop. Update the `destination` block for the production application:

```yaml
  destination:
    server: "<YOUR_PRODUCTION_CLUSTER_URL>"
    namespace: production

```

Apply the updated Applications to the control plane cluster:

```bash
kubectl apply -f multi-env-apps.yaml --context kind-gitops-learning

```

#### Expected Result

Look at the Argo CD UI. The `webapp-production` application will sync.

Verify the deployment happened in the new remote cluster, not the old one:

```bash
# Check the old cluster (should be empty/deleted if Prune is on)
kubectl get pods -n production --context kind-gitops-learning

# Check the new remote cluster (should have 3 pods)
kubectl get pods -n production --context kind-production-cluster

```

You have successfully deployed across two separate Kubernetes clusters from a single Git commit!

#### Cleanup

Keep both clusters running. We will use them in Volume 5 when we practice troubleshooting and rollback.

---

