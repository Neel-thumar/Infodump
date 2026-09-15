## Interview Revision — Concise Answers

**What is Kubernetes?** A system that runs applications across machines, based on desired state you declare, continuously reconciled by controllers.

**Why does a Pod exist instead of running containers directly?** Some containers must share a network and storage and be scheduled together; the Pod is that unit.

**What's the difference between a Deployment and a ReplicaSet?** ReplicaSet keeps N Pods running; Deployment manages ReplicaSets to allow safe, reversible updates.

**How does a Service find its Pods?** Via label selector, materialised into EndpointSlices, turned into kernel packet rules by kube-proxy.

**Readiness vs liveness?** Readiness controls traffic; liveness controls restarts.

**Requests vs limits?** Requests are reserved and used for scheduling; limits are the ceiling — memory kills on breach, CPU throttles.

**What actually protects a Secret?** RBAC and encryption at rest — not base64.

**What's the real difference between Ingress and the Gateway API?** Same general purpose — routing external traffic — but Gateway API is role-oriented, standardised across vendors instead of leaning on custom annotations, and also models east-west (mesh) traffic in the same system.

**How do you upgrade a cluster safely?** Control plane before nodes, one minor version at a time, checking for deprecated API usage and CRD/webhook compatibility first.

**Rolling vs blue/green vs canary?** Rolling for routine low-risk changes; blue/green for instant full rollback or incompatible schema changes; canary to validate against real traffic on a bounded blast radius.

