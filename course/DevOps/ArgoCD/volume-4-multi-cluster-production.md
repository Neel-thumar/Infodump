---
id: volume-4-multi-cluster-production
title: "Volume 4 — Multi-Cluster GitOps & Production Architecture"
order: 4
description: "Scaling GitOps across multiple Kubernetes clusters and designing for high availability."
draft: false
---

# Mastering GitOps: Argo CD Engineering Guide

## Volume 4 — Multi-Cluster GitOps & Production Architecture

## What Are We Learning?
Until now, our GitOps system has been operating in a single Kubernetes cluster. Argo CD lives in the cluster, reads Git, and deploys to the same cluster. 

In the real world, you do not install a separate Argo CD instance in every single cluster. You usually have one "Control Plane" cluster running Argo CD, which manages 10, 20, or 50 external "Workload" clusters across different regions. In this volume, we will spin up a second cluster, securely register it with Argo CD, and move our production web application to it. We will also discuss how Argo CD is scaled for high availability (HA) in true enterprise environments.

## Why Should a DevOps Engineer Care?
Multi-cluster management is where GitOps becomes incredibly powerful—and incredibly dangerous. A single bad Git commit can now take down 50 clusters worldwide in seconds. Understanding how Argo CD authenticates to external clusters, how to restrict multi-cluster access using AppProjects, and how to keep Argo CD itself highly available is required knowledge for any senior platform engineer.

## What You Will Be Able to Do
By the end of this volume, you will be able to:
* Explain the Hub and Spoke (Control Plane vs Data Plane) architecture.
* Register an external Kubernetes cluster with Argo CD.
* Understand exactly how Argo CD authenticates to a remote cluster.
* Deploy an application to a remote cluster using an Application manifest.
* Explain how Argo CD High Availability (HA) works.

---

## The Mental Model: One Inspector, Many Buildings

Let's return to our analogy. 
You still have one **Blueprint** (Git repository). 
You still have one **Inspector** (Argo CD). 
But now, you have **Multiple Buildings** (Kubernetes clusters).

The inspector sits in their office (the Control Plane cluster). When the blueprint updates, the inspector drives out to Building 1 (Staging Cluster) and updates it. Then, they drive out to Building 2 (Production Cluster) and update it. 

To enter Building 2, the inspector needs a key. In Kubernetes, this key is a **ServiceAccount Bearer Token**. Argo CD must be given a key to every external cluster it manages.

---

## How Argo CD Accesses External Clusters

This is a common interview question: *"How does Argo CD talk to a cluster it is not running in?"*

1. When you register a new cluster, Argo CD creates a `ServiceAccount` (usually named `argocd-manager`) inside the **remote** cluster.
2. It binds a `ClusterRole` to this ServiceAccount, giving it admin permissions over that remote cluster.
3. It generates a long-lived authentication token for that ServiceAccount.
4. It brings that token back to the **Control Plane** cluster and saves it in a Kubernetes `Secret` inside the `argocd` namespace.
5. When the Application Controller needs to sync the remote cluster, it reads the Secret, extracts the token, and makes a secure HTTPS call to the remote cluster's API server.

---

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

## Production Architecture: High Availability (HA)

When Argo CD manages 50 clusters, it becomes critical infrastructure. If Argo CD goes down, you cannot deploy. To make Argo CD Highly Available (HA), platform engineers deploy the `argocd-ha` installation manifests.

Here is what changes in a production HA setup:

1. **API Server & UI:** Scaled to multiple replicas behind an Ingress controller.
2. **Repository Server:** Scaled to multiple replicas. This is usually the bottleneck because cloning Git and running `helm template` is CPU and memory-intensive.
3. **Application Controller:** This cannot just be scaled randomly, because two controllers might try to sync the same Application at the same time (a race condition). In HA, we enable **Sharding**. Controller 1 handles clusters A-M, and Controller 2 handles clusters N-Z.
4. **Redis:** Replaced with Redis HA (Redis Sentinel) so the cache survives a node failure.

---

## Things Senior DevOps Engineers Notice

1. **Network Latency:** In a multi-cluster setup, the Application Controller is constantly making API calls to remote clusters over the internet or VPN. If the network drops, Argo CD marks the cluster as `Unknown`. Senior engineers tweak the controller's timeout settings to handle flaky networks.
2. **Blast Radius of a Bad Commit:** If you push a bad Helm chart update that applies to all clusters, Argo CD will immediately break 50 clusters simultaneously. To prevent this, senior engineers use **Progressive Syncs** or **ApplicationSets** with rolling updates, ensuring Staging syncs first, waits for health checks, and only then syncs Production.
3. **Disaster Recovery (DR) for Argo CD:** Where do you store the Secrets that hold the remote cluster tokens? If your Argo CD cluster burns down, you lose the connections to your 50 clusters. Senior engineers back up the Argo CD cluster state, or use a tool like External Secrets to store the cluster connection credentials in an AWS/Azure vault, and use an "App of Apps" to bootstrap Argo CD itself.

---

## Interview Preparation

#### Level 1 — Fundamentals

**Q: Can one instance of Argo CD manage multiple Kubernetes clusters?**
A: Yes. Argo CD is designed with a Hub and Spoke architecture where one control plane can manage deployments across dozens of remote clusters.

**Q: How does Argo CD know how to connect to an external cluster?**
A: When a cluster is registered, Argo CD creates a Kubernetes Secret in its own namespace. This Secret contains the external cluster's API endpoint URL and a Bearer Token for a ServiceAccount that has permissions on the external cluster.

#### Level 2 — Practical

**Q: You need to migrate an application from Cluster A to Cluster B using Argo CD. How do you do it?**
A: I would update the `destination.server` field in the Argo CD Application manifest to point to the URL of Cluster B. Assuming the AppProject allows it, Argo CD will prune the resources in Cluster A (if prune is enabled) and deploy them to Cluster B on the next sync.

#### Level 3 — Scenario Based

**Q: "We have 100 Applications deploying to 20 different clusters. The Argo CD Application Controller is constantly crashing due to OOM (Out of Memory), and syncs are severely delayed. How would you fix this?"**
**How I should think:** How do we scale a single controller managing too many remote clusters?
**Answer:** A single Application Controller cannot handle 20 clusters efficiently. I would enable Controller Sharding in the Argo CD HA configuration. Sharding distributes the workload across multiple controller replicas, assigning specific remote clusters to specific controller pods, which balances the memory and CPU load.

#### Level 4 — Senior Thinking

**Q: "What are the security implications of managing production and non-production clusters from a single Argo CD instance, and how would you mitigate them?"**
**How I should think:** One Argo CD holds the keys to everything. Compromising it means compromising production.
**Answer:** The primary risk is that the single Argo CD instance holds the high-privileged ServiceAccount tokens for both staging and production clusters. If Argo CD is compromised, the attacker has access to everything.
To mitigate this:

1. We enforce strict AppProjects to ensure non-prod teams cannot accidentally or maliciously target production clusters.
2. We restrict SSO RBAC so junior developers only have sync access to non-prod projects.
3. In highly regulated environments (like finance), we actually abandon the single control plane and deploy completely isolated Argo CD instances (one for non-prod, one for prod) to ensure a physical network and credential air-gap.

---

*This concludes Volume 4. You are now operating a true multi-cluster GitOps architecture. In Volume 5, we will focus entirely on when things go wrong: investigating failures, debugging sync issues, and executing GitOps rollbacks under pressure.*