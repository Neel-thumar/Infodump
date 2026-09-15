## Interview Preparation

### Level 1 — Fundamentals

**Q: What problem does a Service solve?**

Answer: Pod IPs are temporary and there can be many of them for one application. A Service gives a single stable address and DNS name that always points at the current set of healthy Pods, chosen by label selector.

**Q: What are the main Service types?**

Answer: `ClusterIP` for internal-only access, which is the default. `NodePort` exposes a fixed port on every node. `LoadBalancer` asks the cloud provider for a real external load balancer. `ExternalName` just returns a CNAME to something outside the cluster.

### Level 2 — Practical

**Q: How does a Service actually find its Pods?**

How to think: name the objects in order, not just "labels".

Answer: The Service has a label selector. An EndpointSlice controller watches for Pods matching that selector and are Ready, and writes their IPs into EndpointSlice objects. `kube-proxy` on every node watches those EndpointSlices and writes packet-forwarding rules into the kernel, so traffic to the Service's virtual IP gets rewritten to a real Pod IP. There's no live lookup per request — the rules are already in place.

**Q: What is the Service DNS name format?**

Answer: `service-name.namespace.svc.cluster.local`. From the same namespace, the short name alone usually works because of the pod's DNS search domains.

### Level 3 — Scenario

**Q: A Pod is `Running` and `1/1 Ready`, but a Service in front of it returns connection errors. What do you check?**

How to think: work outward from the Pod, do not jump straight to Ingress or DNS.

Answer: First I'd check the Service's selector against the Pod's actual labels with `kubectl describe svc` — a mismatch is extremely common. Then I'd check the EndpointSlice directly; if it's empty despite a Ready Pod, the selector is wrong. If it has the right IP, I'd try hitting the Service's ClusterIP from another Pod directly, bypassing DNS and Ingress, to isolate whether the problem is the Service layer or something further out.

**Q: You added a default-deny NetworkPolicy and now half the cluster is broken, including things unrelated to what you were restricting. Why?**

Answer: A default-deny with an empty `podSelector` blocks all ingress traffic to every Pod in that namespace, including DNS lookups to CoreDNS if egress isn't explicitly allowed. I'd check whether egress rules exist for port 53, and add allow rules for the traffic that should be permitted before assuming the deny rule itself is broken.

### Level 4 — Senior Thinking

**Q: Why doesn't Kubernetes enforce NetworkPolicy itself, the way it enforces RBAC?**

Answer: NetworkPolicy defines intent, but enforcing it means manipulating actual packet flow on the node, which is exactly the job Kubernetes already delegates to CNI plugins for all networking. Building enforcement into the core would mean picking one networking implementation for everyone, which conflicts with how Kubernetes deliberately stays neutral about the underlying network. The cost is that a policy can be applied and silently do nothing if the CNI plugin doesn't support it.

**Q: When would you choose the Gateway API over Ingress for a new platform in 2026?**

Answer: If the team needs advanced routing — traffic splitting, protocol-aware routing beyond plain HTTP, or a shared model across ingress and service-mesh traffic — Gateway API's role-oriented design fits better than stacking vendor annotations onto Ingress. For a simple platform with modest routing needs and an existing, well-understood Ingress controller, staying on Ingress is a reasonable, lower-risk choice. I'd check the specific controller's Gateway API conformance level before committing either way.

