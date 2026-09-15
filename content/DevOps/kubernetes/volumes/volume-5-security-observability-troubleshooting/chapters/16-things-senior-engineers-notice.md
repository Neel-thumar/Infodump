## Things Senior Engineers Notice

1. **`cluster-admin` bound broadly is the single most common serious misconfiguration** found in cluster security reviews. It is almost always granted for convenience and never revisited.
2. **The `default` ServiceAccount, auto-mounted, is a bigger risk than most teams realise** — a compromised Pod inherits whatever that ServiceAccount can do, even if the Pod never intended to call the API.
3. **A Secret is only as protected as the RBAC around it.** Auditing "who can read Secrets" is worth doing on a schedule, not just once.
4. **`readOnlyRootFilesystem` breaks more images than people expect**, because many images write cache or temp files by default — plan for a small writable volume rather than abandoning the setting.
5. **Events expire faster than incidents get investigated.** If a Pod's history matters, capture `kubectl describe` output before it ages out.
6. **`kubectl top` is not monitoring.** It has no history and no alerting — treat it as a spot-check tool only.
7. **Admission policy rejections often look like validation errors** and get misdiagnosed as a YAML mistake, when the manifest is fine and a policy engine is enforcing a rule.
8. **`auth can-i` should be used before granting a permission, not just after something breaks.** It is cheap, instant, and prevents over-granting out of uncertainty.
9. **PodSecurityPolicy is gone.** Anyone referencing it is working from outdated material; Pod Security Standards replaced it entirely.
10. **A working `kubectl` session with a wide-open Role is a bigger liability than most infrastructure misconfigurations**, because it is a standing credential, not a one-time mistake.

