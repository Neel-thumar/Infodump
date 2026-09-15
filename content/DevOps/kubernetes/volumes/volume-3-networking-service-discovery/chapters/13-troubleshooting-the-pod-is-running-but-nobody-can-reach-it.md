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

