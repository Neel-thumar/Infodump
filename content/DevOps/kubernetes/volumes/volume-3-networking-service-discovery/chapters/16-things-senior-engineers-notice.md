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

