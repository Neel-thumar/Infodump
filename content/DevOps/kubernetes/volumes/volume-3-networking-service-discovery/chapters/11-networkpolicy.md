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

