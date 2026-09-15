## Working with kubectl

`kubectl` is a program on your laptop that turns your command into an HTTP request. Nothing more.

It reads `~/.kube/config` to know which cluster to talk to and as whom.

```bash
kubectl config get-contexts        # which clusters do I have?
kubectl config current-context     # which am I using right now?
kubectl config use-context kind-devops
```

⚠️ Check `current-context` before running anything destructive. Running a command against the wrong cluster is one of the most common serious mistakes in this job.

### The commands you will use every day

| Command | What it does |
|---|---|
| `kubectl get <kind>` | List objects |
| `kubectl describe <kind> <name>` | Full detail **plus events** — your first debugging tool |
| `kubectl logs <pod>` | Application output |
| `kubectl apply -f file.yaml` | Create or update from a file |
| `kubectl delete -f file.yaml` | Remove what that file created |
| `kubectl exec -it <pod> -- sh` | Shell inside a container |
| `kubectl explain <path>` | Built-in documentation for any field |

### Two commands people underuse

**`kubectl describe`** — the Events section at the bottom tells you what Kubernetes actually tried to do and why it failed. Most beginners jump straight to `logs`, but if the container never started there are no logs. `describe` first.

**`kubectl explain`** — the API documentation, live from your cluster:

```bash
kubectl explain deployment.spec.strategy
kubectl explain pod.spec.containers.resources
```

This is more reliable than blog posts, because it comes from the version you are actually running.

### Useful flags

```bash
kubectl get pods -o wide              # adds node name and Pod IP
kubectl get pods -A                   # every namespace
kubectl get pods -w                   # watch live changes
kubectl get pods -l app=web           # filter by label
kubectl get pod web-xyz -o yaml       # the full object
```

