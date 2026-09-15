## Interview Preparation

### Level 1 — Fundamentals

**Q: What is the difference between authentication and authorization in Kubernetes?**

Answer: Authentication establishes who is making the request — usually a certificate or a token. Authorization, done through RBAC, decides what that identity is allowed to do. They're separate steps and separate mechanisms.

**Q: What is a ServiceAccount?**

Answer: An identity for things running inside the cluster — applications, not humans. Every Pod runs as one, defaulting to the namespace's `default` ServiceAccount if nothing else is specified, and it's how Pods authenticate if they call the Kubernetes API themselves.

### Level 2 — Practical

**Q: How do you check what permissions a user or ServiceAccount actually has?**

Answer: `kubectl auth can-i <verb> <resource> --as=<identity>`. It's the direct way to confirm a permission rather than reading through Role and RoleBinding definitions and hoping you traced them correctly.

**Q: Why isn't base64 encoding of Secrets considered a security measure?**

Answer: Base64 is reversible with a single command by anyone who can read the object — it's an encoding for storing binary-safe text, not encryption. The real protections are RBAC controlling who can read Secret objects at all, and encryption at rest protecting the underlying etcd data.

### Level 3 — Scenario

**Q: A deployment fails with `Error from server (Forbidden)`. How do you investigate?**

How to think: name the layer immediately — this is not a scheduling or networking problem.

Answer: This is an RBAC problem, not an application problem. I'd check which identity is being used — my own user or a CI ServiceAccount — and run `kubectl auth can-i` for the specific verb and resource the failing command needs. Then I'd look at the Role and RoleBinding bound to that identity to see what's actually missing, and add the minimum permission required rather than reaching for a broader Role.

**Q: You suspect a Pod is compromised. What immediate steps tell you what it could have done?**

Answer: Check which ServiceAccount it was running as, and what that ServiceAccount's RBAC bindings actually grant — that defines its blast radius against the Kubernetes API. Separately check its SecurityContext — whether it ran as root, whether it had a writable root filesystem, whether it dropped capabilities — because that defines what it could have done to the node itself, independent of RBAC entirely.

### Level 4 — Senior Thinking

**Q: Why does Kubernetes handle authentication and authorization as two completely separate systems instead of one combined check?**

Answer: Authentication is inherently pluggable — organisations already have identity systems (certificates, OIDC, cloud IAM) and Kubernetes needs to trust whichever one is in place rather than reinventing identity management. Authorization, though, needs to be consistent and fine-grained regardless of how identity was established. Separating them means RBAC rules work the same way whether the identity came from a certificate, an OIDC token, or a ServiceAccount — the authorization model doesn't need to know or care how you proved who you are.

**Q: How would you approach hardening a cluster that currently has almost no security controls in place?**

Answer: I'd start with RBAC audit — find and narrow any broad `cluster-admin` bindings first, since that's usually the highest-impact fix. Then disable `automountServiceAccountToken` cluster-wide by default, re-enabling it only where a Pod genuinely calls the API. Then Pod Security Standards at `baseline` initially, moving toward `restricted` per namespace as workloads are adjusted to tolerate it — doing this all at once tends to break everything simultaneously and erodes trust in the effort. Encryption at rest for Secrets, and a real audit trail so future changes are traceable, round it out.

