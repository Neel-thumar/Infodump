## Summary

| Concept | One line |
|---|---|
| Authentication | Who are you — certificate, token, OIDC |
| Authorization / RBAC | What you're allowed to do — Role + RoleBinding |
| ServiceAccount | Identity for things running inside the cluster |
| Secret protection | RBAC and encryption at rest — not base64 |
| SecurityContext | Controls what a container can do on its node |
| Pod Security Standards | Baseline/Restricted enforcement, replacing PodSecurityPolicy |
| Events | The first place to look — short-lived, narrates control-plane actions |
| Logs | Application output; not persisted by Kubernetes itself |
| Troubleshooting method | Evidence, one layer at a time, in the order things actually happen |

