## Things Senior Engineers Notice

1. **A `Pending` Pod's events almost always say exactly why**, filter by filter. Read them before guessing.
2. **CPU limits throttle; memory limits kill.** A slow service and a crashing service point to different resource problems.
3. **HPA percentages are relative to requests, not real machine capacity.** A wrong request value makes autoscaling meaningless.
4. **A single RWO PVC cannot back a scaled-out Deployment.** This is a very common early storage mistake.
5. **`emptyDir` is not persistence.** It survives a container restart inside the same Pod but not a Pod deletion.
6. **`BestEffort` Pods are evicted first under memory pressure**, silently, with no crash to investigate — just a Pod that is suddenly gone.
7. **Anti-affinity has a real scheduling cost at scale**; topology spread constraints usually achieve the same safety more cheaply.
8. **A PodDisruptionBudget set too strictly can block a node drain indefinitely**, which is its job — but it needs to be understood by whoever runs the upgrade, or it looks like a stuck maintenance window.
9. **Taints reserve nodes; tolerations don't request them.** A Pod that tolerates a taint might still land on an ordinary node too, unless affinity is also used to pull it toward the tainted one specifically.
10. **Reclaim policy decides whether deleting a PVC deletes real data.** Check it before any storage cleanup on a real cluster.

