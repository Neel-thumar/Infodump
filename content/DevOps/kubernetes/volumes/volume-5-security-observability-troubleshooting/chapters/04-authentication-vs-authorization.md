## Authentication vs Authorization

These are two different questions, answered by two different mechanisms, and conflating them is the most common beginner confusion in this whole area.

```text
Request arrives at kube-apiserver
        ↓
AUTHENTICATION — "who are you?"
   (certificate, token, OIDC identity)
        ↓
AUTHORIZATION — "are you allowed to do this?"
   (RBAC checks your identity against Roles)
        ↓
ADMISSION — "is this object itself allowed, and should it be modified?"
        ↓
Object is validated and stored
```

**Authentication** identifies you. In most clusters this is a client certificate (for humans, often via `kubectl` and your kubeconfig) or a bearer token (for automated clients — most importantly, ServiceAccounts, covered below). Kubernetes does not manage user accounts itself; it trusts whatever identity provider issued the credential, which is why enterprise clusters commonly plug in an OIDC provider tied to their existing single sign-on.

**Authorization** decides what that identity may do, once known. This is where **RBAC** — Role-Based Access Control — lives.

