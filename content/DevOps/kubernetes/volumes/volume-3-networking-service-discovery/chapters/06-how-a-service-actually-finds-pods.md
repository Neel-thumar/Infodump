## How a Service Actually Finds Pods

This is the mechanism question every serious interview asks. Learn the chain precisely.

```text
Service (selector: app=web)
        ↓
EndpointSlice controller watches Pods matching that selector
        ↓
EndpointSlice object is created/updated
   — a list of ready Pod IPs
        ↓
kube-proxy on every node watches EndpointSlices
        ↓
kube-proxy writes packet-forwarding rules into the node's kernel
   (iptables, IPVS, or nftables depending on mode/version)
        ↓
A packet sent to the Service IP is rewritten to a real Pod IP
```

Two things to hold onto:

**There is no live lookup at request time.** The rules are pre-written into the kernel before any traffic arrives. This is why Services are fast — no proxy process sits in the request path for most modes.

**"Ready" is the operative word.** Only Pods passing their **readiness probe** (Volume 2) appear in the EndpointSlice. A Pod that is `Running` but not `Ready` receives zero Service traffic. This is the single most common reason for "the Pod is up but gets no traffic".

```bash
kubectl get endpointslices -l kubernetes.io/service-name=web
kubectl get endpointslices -l kubernetes.io/service-name=web -o yaml
```

EndpointSlices replaced the older single `Endpoints` object because one giant list did not scale well to clusters with thousands of Pods behind one Service — the API server had to rewrite and resend the entire list on every change. EndpointSlices split the list into pages of roughly 100 addresses each, so a change only touches one slice.

### kube-proxy modes, briefly

| Mode | How it works | Notes |
|---|---|---|
| `iptables` | Kernel rule chains | The long-standing default |
| `IPVS` | A kernel load-balancing table | Built for very large numbers of Services |
| `nftables` | Newer kernel rule engine | Becoming the default direction of the project; check `kubectl -n kube-system logs -l k8s-app=kube-proxy` to see which mode your cluster actually runs |

Do not memorise these deeply — know that they exist, and know that `kube-proxy` is the component responsible, so if Service traffic is broken cluster-wide, `kube-proxy` is a prime suspect.

