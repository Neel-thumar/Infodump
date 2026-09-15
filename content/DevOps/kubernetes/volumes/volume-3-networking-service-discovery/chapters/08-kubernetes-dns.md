## Kubernetes DNS

Every cluster runs **CoreDNS**, a Kubernetes project component, as Pods in `kube-system`. It gives every Service a predictable DNS name.

```text
<service-name>.<namespace>.svc.cluster.local
```

```bash
kubectl run tester --image=busybox:1.36 -it --rm -- sh
# inside the Pod:
nslookup web.net.svc.cluster.local
nslookup web          # short name works from inside the same namespace
```

Resolution path:

```text
Pod's /etc/resolv.conf points to CoreDNS's cluster IP
        ↓
CoreDNS receives the query
        ↓
It is a Service record → CoreDNS returns the Service's ClusterIP
   (or, for a headless Service, the Pod IPs directly)
        ↓
Not a cluster name → CoreDNS forwards upstream to real DNS
```

`search` domains in `/etc/resolv.conf` are why the short name `web` resolves from inside the same namespace — Kubernetes appends `net.svc.cluster.local` and the rest automatically for you. From a different namespace you need at least `web.net`.

### DNS troubleshooting

```bash
kubectl exec -it tester -- nslookup web.net.svc.cluster.local
kubectl get pods -n kube-system -l k8s-app=kube-dns
kubectl logs -n kube-system -l k8s-app=kube-dns
```

Common causes of DNS failure: CoreDNS Pods not running or not ready, a custom `dnsPolicy` on the Pod overriding the default resolver, or a NetworkPolicy (see below) accidentally blocking port 53 to CoreDNS.

