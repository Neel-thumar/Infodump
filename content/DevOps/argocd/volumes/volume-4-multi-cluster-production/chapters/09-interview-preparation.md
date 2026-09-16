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