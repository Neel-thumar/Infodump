## RBAC

Four objects, and the pattern is always the same: a **Role** describes permissions, a **RoleBinding** grants them to someone.

**Role** — a set of permissions, scoped to one namespace:

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: pod-reader
  namespace: apps
rules:
  - apiGroups: [""]
    resources: ["pods"]
    verbs: ["get", "list", "watch"]
```

**RoleBinding** — grants that Role to a user, group, or ServiceAccount, in that same namespace:

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: read-pods
  namespace: apps
subjects:
  - kind: User
    name: jane
    apiGroup: rbac.authorization.k8s.io
roleRef:
  kind: Role
  name: pod-reader
  apiGroup: rbac.authorization.k8s.io
```

**ClusterRole** and **ClusterRoleBinding** — the same idea, but not scoped to one namespace. Used either for genuinely cluster-scoped resources (like Nodes, which have no namespace) or to grant the same permission across every namespace at once.

### Reading a Role correctly

Three parts matter, and all three must match for a rule to apply:

* `apiGroups` — which part of the API (`""` means the core group: Pods, Services, ConfigMaps)
* `resources` — which object type
* `verbs` — which actions: `get`, `list`, `watch`, `create`, `update`, `patch`, `delete`

There is no such thing as a partial match. A Role granting `get` on `pods` does not grant `list`, even though they sound similar in casual conversation — you must include both explicitly if both are needed.

### Least privilege in practice

```bash
kubectl auth can-i delete pods --as=jane -n apps
kubectl auth can-i list secrets --as=system:serviceaccount:apps:default
```

`kubectl auth can-i` is the single most useful RBAC command you have. Use it to check a permission before granting more, and use it while debugging "forbidden" errors instead of guessing at the Role definition.

The senior-level habit: **start from nothing and add specific verbs on specific resources**, rather than starting from `cluster-admin` and trying to remember to restrict it later. In practice, "later" rarely comes.

