## LAB 0 — Your First Cluster

### Goal

Get a real Kubernetes cluster running locally and see reconciliation with your own eyes.

### Setup

Install these (all free, all local):

* **Docker Desktop** or **Podman** — needed to run the cluster
* **kind** — creates a Kubernetes cluster inside containers
* **kubectl** — the command line tool for talking to Kubernetes

Check they exist:

```bash
docker version
kind version
kubectl version --client
```

⚠️ SYSTEM CHANGE: this lab creates containers on your machine and uses roughly 2 GB of RAM and 2 GB of disk. It costs nothing and touches nothing outside Docker.

### Commands

Create the cluster:

```bash
kind create cluster --name devops
```

Check it worked:

```bash
kubectl get nodes
```

Now run an application:

```bash
kubectl create deployment web --image=nginx --replicas=3
kubectl get pods
```

Now the important part. Pick one Pod name from that list and delete it:

```bash
kubectl delete pod <paste-a-pod-name-here>
kubectl get pods
```

### Expected result

`kubectl get nodes` shows one node with status `Ready`.

`kubectl get pods` shows 3 Pods with random-looking names like `web-5d7b9c4f8-k2xvp`.

After you delete one Pod, you still have 3 Pods. One of them has a new name and a very young `AGE`.

### What to observe

You deleted a Pod. Nobody restarted it. No script ran. No alert fired.

A controller inside Kubernetes noticed that you asked for 3 and only 2 existed, so it created another one. It did not "handle a delete event" — it simply compared the numbers and fixed the difference.

That is reconciliation. Everything in Kubernetes works this way.

### Why this matters

In production this is what keeps your application alive when a node dies at 3 AM. Nobody gets paged. The count is wrong, so Kubernetes fixes it.

It is also why a **wrong** configuration is worse in Kubernetes than in a script. A script that does the wrong thing fails once. Kubernetes will enforce your mistake tirelessly, forever.

### Cleanup

Keep the cluster — we use it in Volume 1. If you want to remove it now:

```bash
kind delete cluster --name devops
```

