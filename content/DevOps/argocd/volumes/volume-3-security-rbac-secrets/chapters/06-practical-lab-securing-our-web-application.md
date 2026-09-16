## Practical Lab: Securing Our Web Application

We are going to lock down our continuous project. We will create an AppProject for the `webapp` team.

#### Goal
Create a restricted AppProject. Move our Staging and Production applications into this project. Test the restrictions by intentionally trying to break the rules.

#### Setup Requirements
Your `kind` cluster, Argo CD, and the two applications (`webapp-staging` and `webapp-production`) from Volume 2 must be running.

#### Step 1: Create the AppProject (The Security Boundary)
Create a file on your laptop called `webapp-project.yaml`.

*Replace `<YOUR_GITHUB_USERNAME>` with your actual username.*

```yaml
apiVersion: argoproj.io/v1alpha1
kind: AppProject
metadata:
  name: webapp-project
  namespace: argocd
spec:
  description: "Project for the WebApp Team"
  
  # 1. Allowed Git Repositories
  sourceRepos:
  - "[https://github.com/](https://github.com/)<YOUR_GITHUB_USERNAME>/gitops-webapp.git"
  
  # 2. Allowed Destinations (Clusters and Namespaces)
  destinations:
  - server: "[https://kubernetes.default.svc](https://kubernetes.default.svc)"
    namespace: "staging"
  - server: "[https://kubernetes.default.svc](https://kubernetes.default.svc)"
    namespace: "production"
    
  # 3. Deny Cluster-scoped resources (like ClusterRole)
  clusterResourceWhitelist: []

```

Apply the project to the cluster:

```bash
kubectl apply -f webapp-project.yaml

```

#### Step 2: Move the Applications to the New Project

Open the `multi-env-apps.yaml` file on your laptop (from Volume 2). Update the `project` field for both applications from `default` to `webapp-project`.

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: webapp-staging
  namespace: argocd
spec:
  project: webapp-project
  # ... rest of the file remains exactly the same ...

```

Do the same for `webapp-production`.

Apply the updated applications:

```bash
kubectl apply -f multi-env-apps.yaml

```

#### Expected Result

Check the Argo CD UI. The applications will look exactly the same and remain `Synced` and `Healthy`. However, they are now operating inside a strict security sandbox.

#### Break It & Troubleshoot It (Destination Restriction)

Let's see the AppProject in action. Pretend a malicious developer modifies the Application manifest to deploy the web application into the highly privileged `kube-system` namespace.

Edit `multi-env-apps.yaml` and change the staging destination:

```yaml
  destination:
    server: [https://kubernetes.default.svc](https://kubernetes.default.svc)
    namespace: kube-system

```

Apply it:

```bash
kubectl apply -f multi-env-apps.yaml

```

**Troubleshoot It:**
Go to the Argo CD UI. The `webapp-staging` Application will immediately show a **Sync Failed** or **Unknown** status.
Read the error message:
`application destination {https://kubernetes.default.svc kube-system} is not permitted in project 'webapp-project'`

**Investigation:**
The Application Controller rejected the desired state before even trying to talk to the Kubernetes API. The AppProject successfully prevented a cross-namespace deployment.
Change the namespace back to `staging`, apply it, and the application will turn green again.

---

