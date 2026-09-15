## Services

A Service is a stable virtual IP and DNS name that sends traffic to a changing set of Pods, chosen by a label selector — the same selector mechanism from Volume 1.

```yaml
apiVersion: v1
kind: Service
metadata:
  name: web
spec:
  selector:
    app: web            # sends traffic to any Pod with this label
  ports:
    - port: 80           # the Service's own port
      targetPort: 80     # the port on the Pod
```

Notice: **no Pod names anywhere.** The Service does not know or care which specific Pods exist. It only knows the label.

### The four Service types

| Type | Reachable from | Typical use |
|---|---|---|
| `ClusterIP` (default) | Inside the cluster only | Internal services — most common by far |
| `NodePort` | Any node's IP, on a fixed port (30000–32767) | Quick testing, rarely used directly in production |
| `LoadBalancer` | The internet, via a cloud load balancer | Public-facing services on a cloud cluster |
| `ExternalName` | Returns a CNAME to an external DNS name | Pointing at something outside the cluster |

```bash
kubectl expose deployment web --port=80 --type=ClusterIP
```

`LoadBalancer` is where the **cloud-controller-manager** from Volume 1 does its job — it asks the cloud provider to create a real load balancer and points it at the cluster. On a local `kind` cluster there is no cloud provider, so a `LoadBalancer` Service just stays `Pending` for its external IP forever, which is a common source of confusion in local labs.

### Headless Services

Set `clusterIP: None` and the Service gets no virtual IP at all. DNS returns the **Pod IPs directly** instead of one shared address.

```yaml
spec:
  clusterIP: None
  selector:
    app: db
```

Used mainly with StatefulSets, where clients need to reach a *specific* Pod (e.g. the primary database instance), not a random one behind a shared IP.

