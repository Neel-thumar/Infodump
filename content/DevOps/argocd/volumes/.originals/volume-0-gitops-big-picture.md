---
id: volume-0-gitops-big-picture
title: "Volume 0 — GitOps: The Big Picture & Your First Sync"
order: 0
description: "Understanding the core GitOps mental model and deploying your first application with Argo CD."
draft: false
---

# Mastering GitOps: Argo CD Engineering Guide

## Volume 0 — GitOps: The Big Picture & Your First Sync

## What Are We Learning?
In this volume, we are setting up our foundation. Before we can use Argo CD to manage hundreds of microservices, we must understand the core idea of GitOps. We will define what GitOps actually is, why the industry moved away from traditional CI/CD pipelines, and what problem we are actually trying to solve.

Then, we will build our first real GitOps system. We will create a local Kubernetes cluster, install Argo CD, and deploy our continuous project—a simple web application—using an Argo CD Application manifest. 

## Why Should a DevOps Engineer Care?
In traditional setups, engineers deploy applications by running `kubectl apply` from their laptops or writing Jenkins scripts that push YAML to a cluster. Over time, people make manual changes directly in the cluster to fix urgent issues. Soon, nobody knows what is actually running in production. The cluster becomes a mystery. GitOps solves this by making Git the absolute, undisputed source of truth. If it is not in Git, it does not exist in the cluster. Understanding this changes how you manage infrastructure.

## What You Will Be Able to Do
By the end of this volume, you will be able to:
* Explain GitOps simply, using the Blueprint vs Building analogy.
* Understand desired state versus actual state.
* Install Argo CD into a Kubernetes cluster.
* Write a basic Argo CD Application manifest.
* Perform a manual sync to deploy an application from Git.

---

## The Mental Model: Blueprint vs Building

To understand GitOps, you only need one simple analogy: **The Blueprint and the Building.**

Imagine you are constructing a building. You have a **Blueprint** (the plan) and the **Building** itself (the physical reality). 

* **The Blueprint (Git Repository):** This is the plan. It describes exactly how the building *should* look. We call this the **Desired State**.
* **The Building (Kubernetes Cluster):** This is the physical reality. It is what actually exists right now. We call this the **Actual State**.
* **The Inspector (Argo CD):** This is a tireless worker who stands between the blueprint and the building. The inspector holds the blueprint in one hand, looks at the building, and asks: *"Does the building match the blueprint?"*

If someone sneaks into the building at night and paints a wall red, but the blueprint says the wall should be white, we have a problem. The building no longer matches the plan. In GitOps, we call this **Drift**.

When the inspector notices drift, they can take action to repaint the wall white, bringing the building back in line with the blueprint. We call this **Reconciliation** or a **Sync**.

**The Golden Rule of GitOps:**
You never paint the building directly. If you want the wall to be red, you must update the blueprint (make a Git commit). The inspector will see the updated blueprint and paint the building for you.

## Why GitOps Exists (The Problem We Are Solving)

Before GitOps, we used a **Push-based** model. 
A developer merged code, a CI server (like Jenkins or GitHub Actions) built a container image, and then that same CI server ran `kubectl apply` to push the changes into Kubernetes.

This caused major problems:
1. **Security:** The CI server needed admin credentials to production Kubernetes. If Jenkins was hacked, production was hacked.
2. **Drift:** If a senior engineer manually edited a deployment using `kubectl edit` to fix a fire, Jenkins had no idea. The cluster and Git were now out of sync.
3. **No Continuous Checking:** Jenkins only ran when code was pushed. It fired a deployment and went to sleep. If something broke in the cluster the next day, Jenkins didn't care.

GitOps introduces a **Pull-based** model. 
The CI server only builds the image and updates Git. Inside the Kubernetes cluster, a tool like Argo CD is running. It reaches *out* to Git, pulls the configuration, and applies it. It checks continuously, forever.

---

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

## Things Senior DevOps Engineers Notice

1. **Git is not a backup, it is the driver:** Beginners think GitOps is just storing YAML in Git as a backup. Senior engineers know GitOps is an active control loop. The repo *drives* the cluster state.
2. **Kubernetes becomes ephemeral compute:** Because everything about the cluster is defined in Git, if a node crashes or a cluster dies, you don't panic. You spin up a new cluster, point Argo CD at the same Git repo, and within minutes, the exact same environment is recreated.
3. **CI and CD are separated:** The build tool (GitHub Actions) only tests code and pushes a new image tag to Git. The delivery tool (Argo CD) only watches Git and updates Kubernetes. Separation of concerns prevents a compromised CI server from destroying production.
4. **The App of Apps pattern:** You noticed we ran `kubectl apply` to create the Argo CD Application itself. In advanced setups, even the Argo CD Application manifests are managed by Argo CD (an Application that syncs other Applications). We will get there later.
5. **No direct cluster access:** In a mature GitOps team, developers do not have `kubectl write` access to production. They only have Git access. This drastically simplifies security audits.

---

## Interview Preparation

#### Level 1 — Fundamentals

**Q: What is GitOps?**
A: GitOps is a methodology where a Git repository is the single source of truth for declarative infrastructure and applications. A software agent continuously ensures the actual state of the cluster matches the desired state stored in Git.

**Q: What is the difference between Desired State and Actual State?**
A: Desired state is the configuration written in Git (how the system *should* be). Actual state is what is currently running in the Kubernetes cluster (how the system *is*).

**Q: What is Reconciliation?**
A: Reconciliation is the continuous loop where a tool like Argo CD checks the desired state against the actual state, and applies changes to the cluster to eliminate any differences.

#### Level 2 — Practical

**Q: What is an Argo CD Application?**
A: It is a Kubernetes Custom Resource defined by Argo CD. It acts as the mapping between a Git repository (the source) and a Kubernetes namespace (the destination).

**Q: How does Argo CD differ from a Jenkins deployment pipeline?**
A: Jenkins uses a push-based model. It runs a script when triggered, pushes YAML to the cluster, and stops. Argo CD uses a pull-based model. It lives inside the cluster, continuously monitors Git, pulls the configuration, and constantly guards against manual drift.

#### Level 3 — Scenario Based

**Q: "An engineer says they updated the image version in a Deployment, but Argo CD says it is OutOfSync. What likely happened?"**
**How I should think:** How was the change made? If it's OutOfSync, the cluster doesn't match Git.
**Answer:** The engineer likely used `kubectl set image` or `kubectl edit` directly on the cluster instead of updating the Git repository. Argo CD detected that the actual cluster state has drifted away from the approved desired state in Git, causing the OutOfSync warning.
**Why:** GitOps mandates that all changes go through Git. Manual cluster changes cause drift.

#### Level 4 — Senior Thinking

**Q: "Why is a pull-based GitOps model considered more secure than traditional CI/CD?"**
**How I should think:** Focus on network boundaries, credential storage, and blast radius.
**Answer:** In a traditional CI/CD push model, the external CI server needs high-privilege credentials to access the production Kubernetes API. If the CI server is compromised, the attacker has cluster admin access. In a pull-based GitOps model, the cluster reaches out to fetch changes. The CI server does not need cluster credentials, and the cluster's ingress API doesn't need to be exposed to external build tools. The trust boundary is contained within the cluster itself.