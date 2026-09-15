## Things Senior Engineers Notice

1. **The API server is the single point everything depends on.** When it is slow, controllers stop receiving updates and the cluster quietly stops correcting itself while looking healthy.
2. **`kubectl apply` succeeding means nothing about your application.** Always follow with `kubectl get pods` or `kubectl rollout status`.
3. **Events expire.** They are kept for about an hour by default, so `describe` on an old problem may show nothing. Investigate while it is fresh.
4. **Mismatched selector and template labels** create an infinite Pod loop. It is a five-second mistake and a confusing outage.
5. **Namespaces are not a security boundary.** Network traffic crosses them freely unless you add NetworkPolicy.
6. **`kubectl edit` is a trap.** Your change lives only in the cluster and disappears on the next `apply`. Change the file, not the cluster.
7. **Never store important data only in etcd's default setup.** Secrets are only base64-encoded unless encryption at rest is configured.
8. **Check `current-context` before every destructive command.** People have deleted production namespaces this way.
9. **Cluster-scoped objects exist.** Deleting a namespace does not clean up the PersistentVolumes or ClusterRoles it was using.
10. **Random Pod names are a design signal.** If any part of your system depends on a Pod name or IP, that design will break.

