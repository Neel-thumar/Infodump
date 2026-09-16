## A Brief Note on Argo CD RBAC

AppProjects restrict what *Argo CD* can do. Argo CD RBAC restricts what *humans* can do inside the Argo CD UI/CLI.
In production, you will connect Argo CD to your company's SSO (like Okta or Azure AD). You will write an `argocd-rbac-cm` ConfigMap that says:
*"If a user is in the 'WebApp-Developers' SSO group, give them 'Sync' permissions only for Applications inside the 'webapp-project'."*
We will not configure SSO in this lab, but you must know this is how humans are restricted.

---

