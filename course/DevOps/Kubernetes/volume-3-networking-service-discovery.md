---
id: networking-and-service-discovery
title: Volume 3 — Kubernetes Networking and Service Discovery
order: 3
description: Why Pod IPs cannot be used directly, how Services and EndpointSlices find Pods, cluster DNS, Ingress and the Gateway API, and NetworkPolicy for isolation.
draft: false
---

# Mastering Kubernetes: DevOps Engineering Guide

## Volume 3 — Kubernetes Networking and Service Discovery

## What Are We Learning?

How anyone — another Pod, another team, a user on the internet — actually reaches the application you built in Volume 2.

We go layer by layer: Pod-to-Pod, Service, DNS, Ingress/Gateway, and finally NetworkPolicy for isolation. This is the volume where most real production incidents live, so we go slowly.

## Why Should a DevOps Engineer Care?

"The Pod is running but nothing can reach it" is the single most common Kubernetes support ticket in the world. It can be the Pod, the Service, DNS, the Ingress, or a NetworkPolicy — five different layers, five different fixes. If you cannot tell them apart quickly, you will spend hours guessing.

## What You Will Be Able to Do

* Explain why Pod IPs alone are not enough
* Choose the right Service type for the job
* Trace exactly how a Service finds its Pods
* Explain the full DNS name of a Service and how it resolves
* Set up Ingress, and know where the Gateway API fits in 2026
* Restrict traffic between Pods with NetworkPolicy
* Debug "Pod is healthy but unreachable" methodically

## Why Pod IPs Are Not Enough

Recall from Volume 2: every Pod gets its own IP. Good — but three problems remain.

**1. Pod IPs are temporary.** Delete a Pod, get a new one, get a new IP. Anything that saved the old IP is now wrong.

**2. There is no single address for "the app".** A Deployment with 5 replicas has 5 different IPs. Which one does a client use?

**3. Pod IPs usually are not reachable from outside the cluster** without extra networking setup.

You need something stable in front of a changing set of Pods. That is a **Service**.

In the apartment analogy: Pods are rooms, and rooms get reassigned constantly. A **Service is the reception desk** — one fixed address. You call reception; reception knows which rooms currently have the right tenants.

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

## LAB 1 — Watch a Service Follow Its Pods

### Goal

See the EndpointSlice update live, and prove that readiness controls traffic.

### Setup

```bash
kubectl create namespace net
kubectl config set-context --current --namespace=net
```

### Commands

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
spec:
  replicas: 3
  selector:
    matchLabels:
      app: web
  template:
    metadata:
      labels:
        app: web
    spec:
      containers:
        - name: web
          image: nginx:1.27
          readinessProbe:
            httpGet:
              path: /
              port: 80
---
apiVersion: v1
kind: Service
metadata:
  name: web
spec:
  selector:
    app: web
  ports:
    - port: 80
      targetPort: 80
```

```bash
kubectl apply -f web.yaml
kubectl get endpointslices -l kubernetes.io/service-name=web
```

Now break readiness on one Pod by making it fail its probe — swap in a broken path:

```bash
POD=$(kubectl get pods -l app=web -o name | head -1)
kubectl exec $POD -- sh -c "rm -f /usr/share/nginx/html/index.html"
sleep 10
kubectl get endpointslices -l kubernetes.io/service-name=web -o jsonpath='{.items[0].endpoints[*].conditions.ready}{"\n"}'
kubectl get pods
```

### Expected result

Before: three addresses in the EndpointSlice. After breaking the file, `nginx` starts returning errors on `/`, the readiness probe fails, and that Pod's `ready` condition flips to `false` — it disappears from active endpoints, while `kubectl get pods` still shows it as `Running` (just `0/1` ready, not restarted).

### What to observe

Liveness did not fire — the container is not broken, just not serving correctly — so nothing restarted. Only readiness reacted, and only the traffic layer changed. This is the readiness/liveness split from Volume 2, now seen from the Service side.

### Why this matters

This is exactly the shape of a real incident: "the Pod is Running, but users get errors." The Pod status alone told you nothing. The EndpointSlice told you the truth.

### Cleanup

```bash
kubectl delete -f web.yaml
```

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

## Ingress

A Service only gives you internal or fairly raw external access. For real HTTP routing — multiple domains, paths, TLS — you use **Ingress**.

```text
User
  ↓ (DNS points at the Ingress controller's load balancer)
Ingress Controller  ← reads Ingress objects and configures itself
  ↓ (routes by host/path)
Service
  ↓
Pod
```

Important distinction: **Ingress the object is just a set of routing rules. Nothing acts on it without an Ingress Controller** — a separate piece of software (NGINX Ingress Controller, Traefik, and others) that you must install. This is a case where Kubernetes defines the API but does not ship the implementation, same pattern as CNI in Volume 1.

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: shop
  annotations:
    nginx.ingress.kubernetes.io/ssl-redirect: "false"
spec:
  ingressClassName: nginx
  rules:
    - host: shop.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: web
                port:
                  number: 80
```

`ingressClassName` matters once you have more than one controller installed — it says which one should handle this Ingress. Annotations are how you configure controller-specific behaviour (TLS redirect, rewrite rules, rate limits), and **annotations are ecosystem-specific** — the same annotation key means nothing to a different controller.

## Ingress vs the Gateway API

This is a genuinely current 2026 topic, so here is where things actually stand, checked against the project's own release notes.

Ingress has real limitations: one generic object trying to serve every use case, vendor behaviour hidden inside annotations, and no clean way to express things like traffic splitting or protocols beyond HTTP without non-standard extensions.

The **Gateway API** was built to replace this with a proper role-oriented model — `GatewayClass`, `Gateway`, and protocol-specific route objects like `HTTPRoute` and `GRPCRoute`. `GatewayClass`, `Gateway`, `HTTPRoute` and `GRPCRoute` reached GA (`v1`) status; more recently `TCPRoute` also graduated to GA, and the project's most recent major release moved a further batch of previously experimental features to stable. It is now the direction the ecosystem is actively moving, and it is designed to cover both external (north-south) traffic and service-mesh (east-west) traffic with the same model.

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: shop
spec:
  parentRefs:
    - name: my-gateway
  hostnames:
    - "shop.example.com"
  rules:
    - backendRefs:
        - name: web
          port: 80
```

**Practical guidance for 2026:** Ingress is not deprecated and still works everywhere; it remains extremely common in existing clusters. New clusters and new controllers increasingly default to the Gateway API, and it is worth learning if you are picking a design for a new platform. Because this area moves quickly and depends entirely on which controller you install, always check that specific controller's own documentation for its current conformance level rather than assuming — the Gateway API is a specification implemented separately by each vendor, exactly like CNI.

| | Kubernetes API defines | Who implements it |
|---|---|---|
| Ingress | The `Ingress` object shape | NGINX Ingress Controller, Traefik, cloud-native controllers, etc. |
| Gateway API | `GatewayClass`, `Gateway`, `HTTPRoute`, etc. | Same controllers, increasingly, plus service meshes |

## NetworkPolicy

By default, **every Pod can reach every other Pod**, across every namespace, with no restriction at all. Namespaces (Volume 1) do not block this. That default is convenient and, in production, often wrong.

**NetworkPolicy** restricts traffic using label selectors — the same selector idea, applied to security this time.

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny
spec:
  podSelector: {}        # applies to every Pod in this namespace
  policyTypes:
    - Ingress
```

An empty `podSelector` with no allow rules means: nothing may reach any Pod in this namespace. Then you add specific allow rules on top:

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-from-web
spec:
  podSelector:
    matchLabels:
      app: db
  policyTypes:
    - Ingress
  ingress:
    - from:
        - podSelector:
            matchLabels:
              app: web
      ports:
        - port: 5432
```

Reading this: Pods labelled `app: db` accept incoming traffic only from Pods labelled `app: web`, only on port 5432. Everything else to `db` is blocked.

### The rule everybody gets wrong

**NetworkPolicy is only enforced if your CNI plugin supports it.** NetworkPolicy is a Kubernetes API object, but *enforcing* it is done by the network plugin (Volume 1's CNI, covered properly as ecosystem tooling in Volume 4). Some basic CNI setups silently accept NetworkPolicy objects and do nothing with them. Always confirm your specific CNI plugin supports NetworkPolicy before relying on it for security.

Also remember from the default-deny example: **a default-deny policy blocks DNS too**, unless you explicitly allow egress to CoreDNS on port 53. This single detail causes a large share of "I added a NetworkPolicy and now nothing works" tickets.

## LAB 2 — Full Path: Ingress and a Deny Rule

### Goal

Build the complete path from a user to a Pod, then deliberately restrict it.

### Setup

For Ingress locally, install a controller (kind has a documented pattern for this):

```bash
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml
kubectl wait --namespace ingress-nginx \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/component=controller \
  --timeout=90s
```

⚠️ SYSTEM CHANGE: this installs a Deployment and Service into your `kind` cluster. It is contained entirely inside the cluster and removed when the cluster is deleted.

### Commands

Reuse the `web.yaml` Deployment and Service from Lab 1, then add:

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: web
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
spec:
  ingressClassName: nginx
  rules:
    - http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: web
                port:
                  number: 80
```

```bash
kubectl apply -f web.yaml -f ingress.yaml
kubectl port-forward -n ingress-nginx svc/ingress-nginx-controller 8080:80
```

In another terminal:

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8080/
```

### Expected result

`200`. You have gone all the way from a curl on your laptop, through the Ingress controller, through the Service, to a Pod.

Now add a default-deny NetworkPolicy in the `net` namespace and repeat the curl.

### What to observe

Once the policy is applied (and if your local CNI actually enforces NetworkPolicy — `kind`'s default CNI does), the request starts failing, because the Ingress controller's traffic to the Pod is now blocked too. This is the trap from above: a deny-all rule blocks *everything*, including the traffic path you actually want, unless you write an explicit allow rule for it.

### Why this matters

This exact mistake — deploying default-deny without the matching allow rules — has caused real production outages. Now you have seen it happen safely.

### Cleanup

```bash
kubectl delete -f web.yaml -f ingress.yaml
kubectl delete -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml
```

## Troubleshooting: "The Pod Is Running But Nobody Can Reach It"

This deserves a proper method, because it is the most common ticket in this entire job. Work outward from the Pod.

```text
1. Is the Pod actually Running and Ready?
   kubectl get pods -o wide
        ↓ yes
2. Does the Service select it correctly?
   kubectl describe svc <name>   → check Selector matches Pod labels
   kubectl get endpointslices -l kubernetes.io/service-name=<name>
        ↓ endpoints present
3. Can another Pod reach the Service directly (skip DNS)?
   kubectl exec <test-pod> -- curl <service-cluster-ip>:<port>
        ↓ works
4. Does DNS resolve the Service name?
   kubectl exec <test-pod> -- nslookup <service>.<namespace>.svc.cluster.local
        ↓ works
5. Does the Ingress route to the right Service and port?
   kubectl describe ingress <name>
        ↓ correct
6. Is a NetworkPolicy blocking the path?
   kubectl get networkpolicy -A
```

Each step isolates one layer. If step 2 shows an empty EndpointSlice, stop — you have found it, and it is almost always a label mismatch or a failing readiness probe. Do not jump to DNS or Ingress until you have confirmed the Service actually has endpoints.

## Production Reality

| Topic | Local (`kind`) | Production |
|---|---|---|
| LoadBalancer Services | Stay `Pending` forever | Provisioned by the cloud provider automatically |
| Ingress controller | Manually installed for a lab | Usually managed by the platform team, sometimes several per cluster |
| NetworkPolicy enforcement | Depends on the local CNI | A deliberate choice of CNI plugin (Calico, Cilium) specifically for this |
| DNS | Default CoreDNS, unconfigured | Tuned for scale — caching, NodeLocal DNSCache to reduce CoreDNS load |
| Default traffic posture | Fully open | Increasingly default-deny per namespace, with explicit allow rules |
| Ingress vs Gateway API | Either, for learning | New platforms increasingly choosing Gateway API; existing ones staying on Ingress |

## Core vs Ecosystem

| Category | From this volume |
|---|---|
| **Kubernetes core** | Service, EndpointSlice, NetworkPolicy (the API objects), the Kubernetes networking model itself |
| **Project tooling** | CoreDNS, `kube-proxy` |
| **Ecosystem** | NGINX Ingress Controller, Traefik, Calico, Cilium — anything that actually *enforces* NetworkPolicy or *implements* Ingress/Gateway API |
| **Cloud provider** | The real load balancer behind a `LoadBalancer` Service; managed DNS |

The single most important boundary in this volume: **Kubernetes defines what NetworkPolicy and Ingress mean. It does not enforce or implement either.** That is always a separate plugin you chose and installed.

## Things Senior Engineers Notice

1. **A Service with zero endpoints does not error — it just returns "connection refused" or times out**, with nothing in the Pod's own logs, because traffic never got there.
2. **Readiness, not liveness, controls whether a Pod appears in an EndpointSlice.** A Pod can be perfectly "alive" and invisible to a Service.
3. **`LoadBalancer` Services stuck `Pending` on a local cluster are normal**, not a bug — there is no cloud provider to ask.
4. **A default-deny NetworkPolicy blocks DNS too**, unless egress to CoreDNS on port 53 is explicitly allowed.
5. **NetworkPolicy silently does nothing on a CNI plugin that does not support it.** Applying one is not proof it is enforced — you have to verify.
6. **Ingress annotations are not portable.** Switching Ingress controllers can silently break behaviour that depended on vendor-specific annotations.
7. **Short DNS names only resolve reliably within the same namespace**, because of how `search` domains are built. Cross-namespace calls should use at least `service.namespace`.
8. **`kube-proxy`'s mode matters at scale.** Very large clusters with many Services have historically hit performance problems with the `iptables` mode; `IPVS` or `nftables` scale better.
9. **The Gateway API and Ingress can both be installed at once**, and often are during a migration. Know which controller owns which objects before debugging either.
10. **A NodePort Service exposes that port on every node**, whether or not a Pod for it is running there — traffic gets routed internally regardless of which node it lands on.

## Interview Preparation

### Level 1 — Fundamentals

**Q: What problem does a Service solve?**

Answer: Pod IPs are temporary and there can be many of them for one application. A Service gives a single stable address and DNS name that always points at the current set of healthy Pods, chosen by label selector.

**Q: What are the main Service types?**

Answer: `ClusterIP` for internal-only access, which is the default. `NodePort` exposes a fixed port on every node. `LoadBalancer` asks the cloud provider for a real external load balancer. `ExternalName` just returns a CNAME to something outside the cluster.

### Level 2 — Practical

**Q: How does a Service actually find its Pods?**

How to think: name the objects in order, not just "labels".

Answer: The Service has a label selector. An EndpointSlice controller watches for Pods matching that selector and are Ready, and writes their IPs into EndpointSlice objects. `kube-proxy` on every node watches those EndpointSlices and writes packet-forwarding rules into the kernel, so traffic to the Service's virtual IP gets rewritten to a real Pod IP. There's no live lookup per request — the rules are already in place.

**Q: What is the Service DNS name format?**

Answer: `service-name.namespace.svc.cluster.local`. From the same namespace, the short name alone usually works because of the pod's DNS search domains.

### Level 3 — Scenario

**Q: A Pod is `Running` and `1/1 Ready`, but a Service in front of it returns connection errors. What do you check?**

How to think: work outward from the Pod, do not jump straight to Ingress or DNS.

Answer: First I'd check the Service's selector against the Pod's actual labels with `kubectl describe svc` — a mismatch is extremely common. Then I'd check the EndpointSlice directly; if it's empty despite a Ready Pod, the selector is wrong. If it has the right IP, I'd try hitting the Service's ClusterIP from another Pod directly, bypassing DNS and Ingress, to isolate whether the problem is the Service layer or something further out.

**Q: You added a default-deny NetworkPolicy and now half the cluster is broken, including things unrelated to what you were restricting. Why?**

Answer: A default-deny with an empty `podSelector` blocks all ingress traffic to every Pod in that namespace, including DNS lookups to CoreDNS if egress isn't explicitly allowed. I'd check whether egress rules exist for port 53, and add allow rules for the traffic that should be permitted before assuming the deny rule itself is broken.

### Level 4 — Senior Thinking

**Q: Why doesn't Kubernetes enforce NetworkPolicy itself, the way it enforces RBAC?**

Answer: NetworkPolicy defines intent, but enforcing it means manipulating actual packet flow on the node, which is exactly the job Kubernetes already delegates to CNI plugins for all networking. Building enforcement into the core would mean picking one networking implementation for everyone, which conflicts with how Kubernetes deliberately stays neutral about the underlying network. The cost is that a policy can be applied and silently do nothing if the CNI plugin doesn't support it.

**Q: When would you choose the Gateway API over Ingress for a new platform in 2026?**

Answer: If the team needs advanced routing — traffic splitting, protocol-aware routing beyond plain HTTP, or a shared model across ingress and service-mesh traffic — Gateway API's role-oriented design fits better than stacking vendor annotations onto Ingress. For a simple platform with modest routing needs and an existing, well-understood Ingress controller, staying on Ingress is a reasonable, lower-risk choice. I'd check the specific controller's Gateway API conformance level before committing either way.

## Summary

| Concept | One line |
|---|---|
| Problem | Pod IPs are temporary and there are many of them |
| Service | A stable address routing to Pods by label selector |
| EndpointSlice | The live list of Ready Pod IPs behind a Service |
| kube-proxy | Turns EndpointSlices into kernel packet rules |
| CoreDNS | Gives every Service a predictable DNS name |
| Ingress | HTTP routing rules; needs a separate controller to do anything |
| Gateway API | The role-oriented successor to Ingress; GA for its core objects |
| NetworkPolicy | Restricts traffic by label; only works if the CNI plugin enforces it |

## What You Learned

You can now explain and demonstrate the complete path from a user's request to your Pod, know exactly which layer to check when something is unreachable, and can restrict traffic safely without accidentally blocking DNS.

Practical skills gained: reading EndpointSlices directly, standing up an Ingress controller locally, and diagnosing connectivity problems with a clear method instead of guessing.

## Next Volume

**Volume 4 — Storage, Scheduling, Resources and Reliability** covers what a workload actually needs to run well: persistent storage through PV/PVC/StorageClass, how the scheduler picks a node, requests and limits, autoscaling, and keeping applications available during maintenance.

Say **continue** when you are ready.
