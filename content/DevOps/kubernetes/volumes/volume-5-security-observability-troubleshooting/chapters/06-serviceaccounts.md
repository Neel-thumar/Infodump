## ServiceAccounts

Humans authenticate with certificates or SSO tokens. **Applications running inside the cluster** authenticate with **ServiceAccounts**.

Every Pod runs as a ServiceAccount — if you do not specify one, it gets the `default` ServiceAccount for its namespace, automatically.

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: app-reader
  namespace: apps
---
apiVersion: v1
kind: Pod
metadata:
  name: my-app
  namespace: apps
spec:
  serviceAccountName: app-reader
  containers:
    - name: app
      image: myapp:1.0
```

Kubernetes automatically mounts a **projected token** for that ServiceAccount into the Pod, at `/var/run/secrets/kubernetes.io/serviceaccount/token`. Any code inside that Pod calling the Kubernetes API — a controller, an operator, an application checking its own Pod status — authenticates using that token, and RBAC then decides what it can actually do.

### The mistake almost every cluster makes

The `default` ServiceAccount, in every namespace, exists automatically and gets mounted into every Pod that does not specify otherwise. If RBAC bound to `default` is too generous — or the cluster has no meaningful RBAC restrictions at all — **every single Pod in that namespace inherits those permissions**, whether or not the application inside it was ever meant to talk to the Kubernetes API.

The fix is simple and often skipped:

```yaml
spec:
  automountServiceAccountToken: false
```

Set this on any Pod that has no legitimate reason to call the Kubernetes API — which, in most clusters, is most Pods. A web server serving HTTP traffic almost never needs to talk to the API server at all.

