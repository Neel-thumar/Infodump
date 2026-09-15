## Production Reality

| Topic | Local (`kind`) | Production |
|---|---|---|
| LoadBalancer Services | Stay `Pending` forever | Provisioned by the cloud provider automatically |
| Ingress controller | Manually installed for a lab | Usually managed by the platform team, sometimes several per cluster |
| NetworkPolicy enforcement | Depends on the local CNI | A deliberate choice of CNI plugin (Calico, Cilium) specifically for this |
| DNS | Default CoreDNS, unconfigured | Tuned for scale — caching, NodeLocal DNSCache to reduce CoreDNS load |
| Default traffic posture | Fully open | Increasingly default-deny per namespace, with explicit allow rules |
| Ingress vs Gateway API | Either, for learning | New platforms increasingly choosing Gateway API; existing ones staying on Ingress |

