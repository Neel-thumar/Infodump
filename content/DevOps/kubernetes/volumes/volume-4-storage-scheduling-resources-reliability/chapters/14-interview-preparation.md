## Interview Preparation

### Level 1 — Fundamentals

**Q: What is the difference between a PV and a PVC?**

Answer: A PVC is a request for storage — how much, and what access mode. A PV is the actual storage that satisfies it. In most environments, creating a PVC automatically triggers dynamic provisioning of a matching PV.

**Q: What is the difference between requests and limits?**

Answer: Requests are what the scheduler reserves and uses to decide if a node has room. Limits are the hard ceiling — exceeding the memory limit gets the container killed, exceeding the CPU limit just throttles it.

### Level 2 — Practical

**Q: How does the scheduler choose a node?**

Answer: In two stages. Filtering removes nodes that cannot satisfy hard requirements — insufficient resources, unmatched taints, failed affinity rules. Scoring then ranks the remaining nodes by softer preferences and picks the best one. If filtering removes every node, the Pod stays Pending.

**Q: What is a PodDisruptionBudget for?**

Answer: It protects against voluntary disruptions like node drains or cluster upgrades, by declaring the minimum Pods that must stay available. It does not protect against a node crashing unexpectedly — that is involuntary and cannot be scheduled around.

### Level 3 — Scenario

**Q: A Pod is stuck `Pending` and `kubectl describe` shows `Insufficient cpu`. What do you do?**

How to think: give options, not one guess.

Answer: Either the requests are set higher than the cluster actually has room for, in which case I'd check node capacity and either reduce requests or add capacity, or the cluster genuinely needs more nodes, in which case cluster autoscaling (if configured) should handle it — and if it isn't configured, that's the real gap. I'd also check whether affinity or taints are narrowing the eligible nodes more than intended.

**Q: An application scaled up under load through HPA, but latency got worse, not better. Why might that be?**

Answer: New replicas may be Pending due to insufficient node capacity, so the extra replicas HPA "added" aren't actually serving traffic — I'd check `kubectl get pods` for Pending Pods and whether cluster autoscaling is keeping up. Alternatively, if requests were set too low, HPA's utilization percentage might be misleading, or the bottleneck could be a shared dependency, like a database, that more Pods make worse rather than better.

### Level 4 — Senior Thinking

**Q: Why does Kubernetes separate the concept of a PVC from a PV instead of letting Pods reference storage directly?**

Answer: It decouples the application's request ("I need 10Gi, read-write") from the specific implementation of that storage, the same separation the API server enforces everywhere else. The same manifest then works across different environments — a cloud disk in production, a local path in a test cluster — because only the StorageClass changes, not the workload definition.

**Q: How would you design resource governance for a shared cluster with several teams?**

Answer: ResourceQuota per namespace to cap total consumption per team, LimitRange to set sane defaults so nobody deploys unbounded workloads by accident, Guaranteed QoS reserved deliberately for critical stateful workloads, and PodDisruptionBudgets on anything user-facing so cluster maintenance doesn't become an outage. I'd also make sure HPA targets are based on requests that reflect real measured usage, not guesses, since bad requests quietly undermine every other control.

