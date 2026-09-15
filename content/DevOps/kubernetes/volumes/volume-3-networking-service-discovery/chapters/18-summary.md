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

