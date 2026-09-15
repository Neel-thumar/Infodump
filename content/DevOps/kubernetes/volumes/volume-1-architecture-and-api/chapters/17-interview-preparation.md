## Interview Preparation

### Level 1 — Fundamentals

**Q: What are the main Kubernetes components?**

How to think: split into control plane and node, then one line each.

Answer: Control plane — the API server (entry point and validation), etcd (stores all cluster state), the scheduler (chooses nodes for Pods), and the controller manager (runs the reconciliation loops). On each node — the kubelet (starts and supervises Pods), kube-proxy (Service networking), and a container runtime like containerd.

**Q: What is the difference between spec and status?**

Answer: `spec` is what I asked for. `status` is what actually exists, written by Kubernetes. Controllers work to make status match spec.

### Level 2 — Practical

**Q: What happens when you run `kubectl apply`?**

How to think: walk the path, do not list components randomly.

Answer: `kubectl` sends an HTTP request to the API server. The API server authenticates and authorizes me, runs admission controllers, validates the object, and stores it in etcd. Controllers watching that object react — the Deployment controller creates a ReplicaSet, the ReplicaSet controller creates Pods. The scheduler assigns each Pod to a node. The kubelet on that node sees the Pod, tells containerd to start the container, and the network plugin assigns an IP. Then the kubelet reports status back.

**Q: How does a Deployment know which Pods belong to it?**

Answer: through the label selector. It does not use names. Any Pod matching `spec.selector.matchLabels` is counted as its own.

### Level 3 — Scenario

**Q: A Pod has been `Pending` for ten minutes. How do you investigate?**

How to think: name the component first, then the evidence.

Answer: `Pending` means the scheduler has not placed it, so I start with `kubectl describe pod` and read the events — the scheduler usually states why. Typical reasons are insufficient CPU or memory on any node, a nodeSelector or affinity rule that nothing satisfies, taints without matching tolerations, or a PersistentVolumeClaim that is not bound. Then I check `kubectl get nodes` and node capacity to confirm.

**Q: Someone reports that a Deployment keeps creating Pods endlessly. What is your first guess?**

Answer: the labels in the Pod template do not match the Deployment's selector. The Deployment cannot see the Pods it created, so it keeps creating more. I would check with `kubectl get deployment -o yaml` and compare `spec.selector.matchLabels` with `spec.template.metadata.labels`.

### Level 4 — Senior Thinking

**Q: Why did Kubernetes put an API server in front of etcd instead of letting components read it directly?**

Answer: it gives one place for authentication, authorization, validation, admission policy and API versioning. It also means components never depend on each other or on the storage format, so the system can evolve — and it is the reason a custom resource you define behaves exactly like a built-in one. The cost is that the API server becomes a shared dependency for the whole control plane.

**Q: What breaks if etcd is unavailable?**

Answer: running Pods keep running, because the kubelet already knows what it should be doing. But nothing new can be created or changed, controllers cannot reconcile, and failed Pods will not be replaced. The cluster becomes frozen rather than dead — which is more dangerous, because it can look fine for a while.

