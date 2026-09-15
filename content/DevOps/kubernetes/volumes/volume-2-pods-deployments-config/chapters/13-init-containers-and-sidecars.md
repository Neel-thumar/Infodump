## Init Containers and Sidecars

**Init containers** run **before** your main containers, one at a time, each to completion.

```yaml
spec:
  initContainers:
    - name: wait-for-db
      image: busybox:1.36
      command: ['sh', '-c', 'until nc -z db 5432; do sleep 2; done']
  containers:
    - name: app
      image: myapp:1.0
```

Use them for: waiting on a dependency, running database migrations, fetching a file the app needs, setting permissions on a volume. If an init container fails, the Pod restarts it according to the restart policy and the main containers never start.

**Sidecar containers** run *alongside* your app for the Pod's whole life. Kubernetes has native sidecar support — an init container with `restartPolicy: Always` starts before the main containers, keeps running, and shuts down after them. This feature moved through alpha and beta in the 1.28–1.29 releases and reached stable in 1.33; on any currently supported release it is available. Check `kubectl explain pod.spec.initContainers.restartPolicy` on your own cluster to confirm.

