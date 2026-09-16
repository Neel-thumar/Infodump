## Isolating Teams with AppProjects

By default, every Argo CD Application belongs to a project called `default`. The `default` project has zero restrictions. 

In a real company, Team A should not be able to deploy into Team B's namespace. We solve this using the **AppProject** custom resource.

An AppProject acts as a security boundary. It restricts:
1. **Source Repositories:** Which Git URLs are allowed?
2. **Destinations:** Which Clusters and Namespaces are allowed?
3. **Resource Allow/Deny Lists:** Can they deploy Deployments? Can they deploy highly privileged ClusterRoles? (Usually, we deny Cluster-scoped resources to regular teams).

---

