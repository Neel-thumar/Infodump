---
id: big-picture
title: "Volume 0 — Kubernetes: The Big Picture"
order: 0
description: What problem Kubernetes actually solves, what it is and is not, the mental model we will use throughout, and your first working cluster.
draft: false
---

# Mastering Kubernetes: DevOps Engineering Guide

## Volume 0 — Kubernetes: The Big Picture

## What Are We Learning?

In this volume we are not learning YAML, commands, or architecture diagrams.

We are answering one question: **why does Kubernetes exist at all?**

If you understand that clearly, everything in the next six volumes will make sense. If you skip it, Kubernetes will feel like a pile of random rules you have to memorise.

## Why Should a DevOps Engineer Care?

Because in an interview, and in real work, the first thing people notice is whether you understand the *system* or only the *commands*.

Many engineers can run `kubectl apply`. Far fewer can explain why the application came back after they deleted it, or why their Pod is stuck in `Pending`. That gap is the difference between a junior and a senior engineer, and it starts here.

## What You Will Be Able to Do

* Explain Kubernetes in simple words to a manager or an interviewer
* Explain the problems it solves, and the problems it does not solve
* Describe what Kubernetes is *not* (this matters more than you expect)
* Use the mental model we will keep using for the whole guide
* Run a real Kubernetes cluster on your own laptop

## Life Before Kubernetes

Imagine you are running an application in 2012. You have servers — real or virtual — with names like `web-01`, `web-02`, `db-01`.

Your work looks like this:

```text
Build the application
      ↓
Copy it to the correct servers
      ↓
Install dependencies on those servers
      ↓
Restart the service, one server at a time
      ↓
Update the load balancer if needed
      ↓
Watch the graphs and hope
```

Now the problems start.

| Problem | What it looks like in real life |
|---|---|
| Wasted capacity | Servers sized for peak traffic, idle 80% of the day |
| Manual placement | A human decides which app runs on which server, in a spreadsheet |
| Failure = a phone call | A server dies at 3 AM and someone has to move things by hand |
| Configuration drift | After two years no two servers are the same, and nobody knows why |
| Scaling is slow | "Add two more servers" takes days, not seconds |

Look at what all five have in common. **The server is important.** Humans care about it, applications are tied to it, and every problem comes from that.

## The Core Idea of Kubernetes

Kubernetes changes one thing:

> Stop telling the system *where* to run your application. Tell it *what you want*, and let the system decide where.

Instead of "install this on `web-02`", you say:

> "Run 3 copies of this application. Each needs 1 CPU and 512 MB of memory. Keep 3 running, always."

Kubernetes takes that statement, picks the machines, starts the containers, notices when one dies, and starts a replacement somewhere else. You never care which machine.

This is called **desired state**. You describe the destination, not the route.

```text
OLD WAY                              KUBERNETES WAY

You → server → process               You → "I want 3 copies"
(you choose everything)                        ↓
                                     Kubernetes chooses the server
                                               ↓
                                            Pod runs
```

And Kubernetes does not check this once. It keeps checking, forever. If a Pod dies, the count is wrong, so it creates another one. This continuous checking is called **reconciliation**, and it is the single most important idea in the whole system.

## Our Mental Model: The Apartment Complex

We will use one analogy for the whole guide. It is not perfect, but it is useful.

| Kubernetes thing | Apartment analogy |
|---|---|
| Cluster | The whole apartment complex |
| Node | One building in the complex |
| Namespace | One apartment (a separate area for one team or project) |
| Pod | One room |
| Container | The person or application living in that room |
| Deployment | The manager who makes sure 3 rooms are always occupied |
| Service | The reception desk / intercom people use to reach a room |
| ConfigMap | The notice board with general information |
| Secret | A locked document cabinet |
| Ingress | The main gate of the complex |
| Scheduler | The person who decides which building a new room goes into |
| Control plane | The management office |

The key insight from the analogy: **you do not book a specific room.** You tell the management office "I need 3 rooms for my team", and the office decides which building and which rooms. If a room becomes unusable, the office gives you another one. Visitors always go through reception, so they never need to know which room you are in today.

We will return to this whenever a concept is confusing. But remember — the analogy is only a bridge. The real explanation always follows.

## What Kubernetes Actually Is

Three things, and nothing more:

**1. A database of what you want.** You write down your intent. Kubernetes stores it, checks it, and remembers it. Technically this is a REST API in front of a key-value store called etcd.

**2. A set of loops that fix things.** Small programs called *controllers* constantly compare "what you asked for" with "what actually exists", and take action to close the gap.

**3. An agent on every machine.** A program called the *kubelet* runs on each node, reads the part of the database that concerns it, and makes its machine match — pulls images, starts containers, reports status back.

That is genuinely the whole system. Everything else is detail on top of these three.

## What Kubernetes Is NOT

This list saves you from a lot of confusion later.

| Kubernetes is NOT | Reality |
|---|---|
| A container runtime | It does not run containers itself. It tells containerd or CRI-O to do it. |
| A replacement for Docker | Docker builds images. Kubernetes runs them. Different jobs. |
| A PaaS like Heroku | It will not build your code or guess what your app needs. |
| A networking solution | It defines networking *rules*, then requires you to install a plugin that implements them. |
| Automatic reliability | Kubernetes will happily keep a broken application running forever if that is what you asked for. |
| A way to avoid learning Linux | It is a way to describe Linux infrastructure precisely. When it breaks, you are debugging Linux. |

Write that last one on a sticky note. Most production Kubernetes problems end with a Linux answer.

## When You Should NOT Use Kubernetes

A senior engineer knows this. A junior engineer assumes Kubernetes is always correct.

Kubernetes is probably the wrong choice when:

* You have one or two small applications and one server
* Your team has nobody who can operate it
* Your workload is a simple static website
* A managed service (App Runner, Cloud Run, App Service) already does the job
* You are adopting it because it is popular, not because you have the problem it solves

Kubernetes solves the problems of running **many** services across **many** machines with **changing** demand. If you do not have that problem, you are buying complexity for nothing.

Being able to say this in an interview makes you sound experienced, not negative.

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

## Common Beginner Mistakes (Even at This Stage)

* Thinking Kubernetes "runs containers". It manages them; something else runs them.
* Thinking `kubectl` is Kubernetes. It is just a client program on your laptop.
* Thinking a Pod is permanent. Pods are disposable by design. Never depend on a specific Pod.
* Learning Kubernetes only through YAML copied from blogs.

## Things Senior Engineers Notice

1. **Kubernetes never stops.** Your intent is permanent until you change it. A bad manifest is not an error, it is a policy being enforced.
2. **Success from `kubectl` means the request was accepted, not that anything is running.** These are two different moments in time.
3. **Pod names are random on purpose.** If your process depends on a Pod name, your design is wrong.
4. **Kubernetes is only as good as your resource declarations.** It cannot pack what you did not measure.
5. **Most "Kubernetes problems" are application problems** that Kubernetes has made visible for the first time.
6. **Adding Kubernetes adds a team requirement, not just a tool.** Somebody now has to operate it.

## Interview Preparation

### Level 1 — Fundamentals

**Q: What is Kubernetes in simple words?**

How to think: do not recite a definition. Describe the problem first.

Answer: It is a system that runs applications across a group of machines. You tell it what you want running, and it decides where to run it and keeps it running. If something dies, it replaces it automatically.

**Q: What is a container orchestrator?**

Answer: Software that decides where containers run, starts and stops them, replaces failed ones, and connects them to the network — instead of a human doing all of that.

### Level 2 — Practical

**Q: You deleted a Pod and it came back. Why?**

Answer: The Pod was managed by a Deployment. A controller compares desired replicas with actual replicas and creates a new Pod when the number is short. Nothing restarted the old Pod — a new one was created.

### Level 3 — Scenario

**Q: A team wants to move a single small internal website to Kubernetes. What do you say?**

How to think: show judgement, not enthusiasm.

Answer: I would ask what problem they are solving. For one small site, Kubernetes adds cluster upgrades, networking, and security work that somebody has to own. A managed app service is usually cheaper and safer. Kubernetes makes sense when they have many services, variable load, or a real need for standard deployment across teams.

### Level 4 — Senior Thinking

**Q: What is the biggest risk when a company adopts Kubernetes?**

Answer: Underestimating operations. The cluster itself becomes a production system that needs upgrades, monitoring, security and on-call. Teams often plan for migration and forget that they now run a distributed platform.

## Summary

| Concept | One line |
|---|---|
| Problem | Servers were the unit of everything, which wasted capacity and needed humans |
| Solution | Describe desired state, let the system place and maintain workloads |
| Reconciliation | Controllers continuously fix the difference between wanted and actual |
| Kubernetes is | An API + controllers + an agent on every node |
| Kubernetes is not | A runtime, a PaaS, a network, or a guarantee of reliability |

## What You Learned

You can now explain why Kubernetes exists, what it really is, what it is not, and when it is the wrong tool. You have a working cluster, and you have seen reconciliation with your own eyes.

## Next Volume

**Volume 1 — Architecture, the API, and Talking to the Cluster** opens the box. We will look at the control plane and the node components, follow a request step by step from `kubectl apply` to a running container, learn to read any YAML manifest properly, and use namespaces, labels and selectors to organise real work.

Say **continue** when you are ready.
