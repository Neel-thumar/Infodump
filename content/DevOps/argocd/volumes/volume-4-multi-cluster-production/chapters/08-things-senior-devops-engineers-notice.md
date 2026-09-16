## Things Senior DevOps Engineers Notice

1. **Network Latency:** In a multi-cluster setup, the Application Controller is constantly making API calls to remote clusters over the internet or VPN. If the network drops, Argo CD marks the cluster as `Unknown`. Senior engineers tweak the controller's timeout settings to handle flaky networks.
2. **Blast Radius of a Bad Commit:** If you push a bad Helm chart update that applies to all clusters, Argo CD will immediately break 50 clusters simultaneously. To prevent this, senior engineers use **Progressive Syncs** or **ApplicationSets** with rolling updates, ensuring Staging syncs first, waits for health checks, and only then syncs Production.
3. **Disaster Recovery (DR) for Argo CD:** Where do you store the Secrets that hold the remote cluster tokens? If your Argo CD cluster burns down, you lose the connections to your 50 clusters. Senior engineers back up the Argo CD cluster state, or use a tool like External Secrets to store the cluster connection credentials in an AWS/Azure vault, and use an "App of Apps" to bootstrap Argo CD itself.

---

