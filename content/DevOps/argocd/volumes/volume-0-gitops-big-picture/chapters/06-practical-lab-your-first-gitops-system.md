## Practical Lab: Your First GitOps System

We are going to build our continuous practical project: a Simple Web Application. We will use a public GitHub repository as our blueprint and a local cluster as our building.

#### Goal
Set up a local Kubernetes cluster, install Argo CD, and deploy an Nginx web application purely through Git.

#### Setup Requirements
You need a basic computer with terminal access and the following installed:
* Docker
* `kind` (Kubernetes in Docker)
* `kubectl`
* A GitHub account

#### Step 1: Create the Building (The Cluster)
We will create a fresh, empty Kubernetes cluster.

```bash
kind create cluster --name gitops-learning

```

Verify it is running:

```bash
kubectl get nodes

```

#### Step 2: Create the Blueprint (The Git Repository)

Create a new, **Public** repository on GitHub. Let's call it `gitops-webapp`.
Clone it to your laptop, and create a folder called `manifests`.

Inside the `manifests` folder, create a simple Kubernetes Deployment and Service.

Create `manifests/deployment.yaml`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: webapp-deployment
spec:
  replicas: 2
  selector:
    matchLabels:
      app: webapp
  template:
    metadata:
      labels:
        app: webapp
    spec:
      containers:
      - name: nginx
        image: nginx:1.24
        ports:
        - containerPort: 80

```

Create `manifests/service.yaml`:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: webapp-service
spec:
  selector:
    app: webapp
  ports:
    - protocol: TCP
      port: 80
      targetPort: 80

```

Commit and push these files to your `main` branch on GitHub:

```bash
git add .
git commit -m "Initial commit: Add webapp manifests"
git push origin main

```

*Note: Your repository must be public so our local Argo CD can read it without us setting up SSH keys just yet.*

#### Step 3: Install the Inspector (Argo CD)

We will install Argo CD directly into our cluster. Argo CD provides a standard manifest for this.

```bash
kubectl create namespace argocd
kubectl apply -n argocd -f [https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml](https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml)

```

Wait a minute for the pods to start:

```bash
kubectl get pods -n argocd

```

*(Wait until all pods show `Running`)*

#### Step 4: Access the Argo CD UI

To look at Argo CD, we need to forward its web interface to our laptop.

```bash
kubectl port-forward svc/argocd-server -n argocd 8080:443

```

Open a browser and go to `https://localhost:8080` (accept the security warning, it is a local self-signed certificate).
Argo CD creates a default `admin` password. Open a new terminal tab and get it:

```bash
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d; echo

```

Log in using username: `admin` and the password you just retrieved.

#### Step 5: Define the Application

Argo CD does not magically know about your GitHub repo. We must tell it by creating an Argo CD Custom Resource called an **Application**.

Create a file on your laptop called `argo-application.yaml`. (Do not put this inside your `gitops-webapp` repo, keep it separate on your laptop for now).

Replace `<YOUR_GITHUB_USERNAME>` with your actual username.

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
    syncOptions:
    - CreateNamespace=true

```

Let's read this manifest like an engineer:

* **source**: This is the blueprint. We are telling Argo CD to look at the `main` branch of our GitHub repo, specifically inside the `manifests` folder.
* **destination**: This is the building. We are telling Argo CD to deploy these resources into the `default` namespace of the cluster it is currently running in (`kubernetes.default.svc`).

#### Step 6: Trigger the First Sync

Apply the Argo CD Application manifest to the cluster:

```bash
kubectl apply -f argo-application.yaml

```

Go to your Argo CD UI in the browser. You will see a new tile called `simple-webapp`.
Notice its status is **OutOfSync**.

Why? Because Argo CD looked at Git, saw two YAML files, looked at the cluster's `default` namespace, and found nothing. The building does not match the blueprint.

Because we have not enabled Automated Sync yet, Argo CD is waiting for your permission.
Click the application, click the **SYNC** button at the top, and click **Synchronize**.

#### Expected Result

You will see Argo CD instantly create the Deployment and Service. The status will turn to a green **Synced** and a green **Healthy**.

Verify in your terminal:

```bash
kubectl get pods -n default

```

You should see two Nginx pods running.

#### What to Observe

Notice that you never ran `kubectl apply` on your Deployment or Service YAMLs. You only applied the Argo CD Application configuration. Argo CD read your Git repository and did the Kubernetes deployment for you.

#### Why This Matters

You have just built the foundation of a modern platform. If you want to change the image version of Nginx, you will not touch the cluster. You will change the file in GitHub, and Argo CD will pull it down. Git is now your delivery mechanism.

#### Cleanup

We will leave this running. We will use this exact cluster, Argo CD installation, and GitHub repository in Volume 1.

---

