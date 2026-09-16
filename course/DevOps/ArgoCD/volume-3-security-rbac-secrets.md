---
id: volume-3-security-rbac-secrets
title: "Volume 3 — Security, Projects, and Secrets Management"
order: 3
description: "Securing the GitOps workflow with AppProjects, RBAC, and safe secrets management."
draft: false
---

# Mastering GitOps: Argo CD Engineering Guide

## Volume 3 — Security, Projects, and Secrets Management

## What Are We Learning?
In a learning environment, Argo CD runs as a cluster administrator and allows any Git repository to deploy anything to any namespace. If we do this in production, one compromised developer laptop or one malicious pull request can destroy the entire cluster. 

In this volume, we will secure our GitOps pipeline. We will learn about the GitOps Trust Chain, Argo CD AppProjects, and Role-Based Access Control (RBAC). Finally, we will solve the most common GitOps interview question: *"If everything is in Git, how do we handle database passwords?"*

## Why Should a DevOps Engineer Care?
Security is not an afterthought in platform engineering. Argo CD has extremely high privileges in your Kubernetes cluster. If you do not lock it down, it becomes a massive attack vector. Furthermore, if you commit base64-encoded secrets (which is just encoding, not encryption) to Git, you are leaking credentials. Understanding AppProjects and external secrets separates junior engineers from senior platform architects.

## What You Will Be Able to Do
By the end of this volume, you will be able to:
* Explain the GitOps Trust Chain.
* Create and configure Argo CD AppProjects to isolate teams.
* Understand how Argo CD RBAC ties into AppProjects.
* Securely manage secrets in a GitOps workflow without committing plaintext.
* Troubleshoot AppProject restriction failures.

---

## The GitOps Trust Chain

In traditional CI/CD, the CI server (Jenkins/GitLab) held the keys to the cluster. In GitOps, the trust model changes. 

**Git -> Argo CD -> Kubernetes**

1. **Git is the new attack surface:** If an attacker gains write access to your Git repository, they can change the desired state (e.g., adding a crypto-mining container). Argo CD will happily sync it. Therefore, branch protection rules (requiring PR approvals) in GitHub are actually a Kubernetes security boundary.
2. **Argo CD is a highly privileged agent:** Argo CD needs permissions to create Deployments, Services, and Namespaces. We must restrict *what* Argo CD is allowed to do on behalf of specific Git repositories.

---

## Isolating Teams with AppProjects

By default, every Argo CD Application belongs to a project called `default`. The `default` project has zero restrictions. 

In a real company, Team A should not be able to deploy into Team B's namespace. We solve this using the **AppProject** custom resource.

An AppProject acts as a security boundary. It restricts:
1. **Source Repositories:** Which Git URLs are allowed?
2. **Destinations:** Which Clusters and Namespaces are allowed?
3. **Resource Allow/Deny Lists:** Can they deploy Deployments? Can they deploy highly privileged ClusterRoles? (Usually, we deny Cluster-scoped resources to regular teams).

---

## Practical Lab: Securing Our Web Application

We are going to lock down our continuous project. We will create an AppProject for the `webapp` team.

#### Goal
Create a restricted AppProject. Move our Staging and Production applications into this project. Test the restrictions by intentionally trying to break the rules.

#### Setup Requirements
Your `kind` cluster, Argo CD, and the two applications (`webapp-staging` and `webapp-production`) from Volume 2 must be running.

#### Step 1: Create the AppProject (The Security Boundary)
Create a file on your laptop called `webapp-project.yaml`.

*Replace `<YOUR_GITHUB_USERNAME>` with your actual username.*

```yaml
apiVersion: argoproj.io/v1alpha1
kind: AppProject
metadata:
  name: webapp-project
  namespace: argocd
spec:
  description: "Project for the WebApp Team"
  
  # 1. Allowed Git Repositories
  sourceRepos:
  - "[https://github.com/](https://github.com/)<YOUR_GITHUB_USERNAME>/gitops-webapp.git"
  
  # 2. Allowed Destinations (Clusters and Namespaces)
  destinations:
  - server: "[https://kubernetes.default.svc](https://kubernetes.default.svc)"
    namespace: "staging"
  - server: "[https://kubernetes.default.svc](https://kubernetes.default.svc)"
    namespace: "production"
    
  # 3. Deny Cluster-scoped resources (like ClusterRole)
  clusterResourceWhitelist: []

```

Apply the project to the cluster:

```bash
kubectl apply -f webapp-project.yaml

```

#### Step 2: Move the Applications to the New Project

Open the `multi-env-apps.yaml` file on your laptop (from Volume 2). Update the `project` field for both applications from `default` to `webapp-project`.

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: webapp-staging
  namespace: argocd
spec:
  project: webapp-project
  # ... rest of the file remains exactly the same ...

```

Do the same for `webapp-production`.

Apply the updated applications:

```bash
kubectl apply -f multi-env-apps.yaml

```

#### Expected Result

Check the Argo CD UI. The applications will look exactly the same and remain `Synced` and `Healthy`. However, they are now operating inside a strict security sandbox.

#### Break It & Troubleshoot It (Destination Restriction)

Let's see the AppProject in action. Pretend a malicious developer modifies the Application manifest to deploy the web application into the highly privileged `kube-system` namespace.

Edit `multi-env-apps.yaml` and change the staging destination:

```yaml
  destination:
    server: [https://kubernetes.default.svc](https://kubernetes.default.svc)
    namespace: kube-system

```

Apply it:

```bash
kubectl apply -f multi-env-apps.yaml

```

**Troubleshoot It:**
Go to the Argo CD UI. The `webapp-staging` Application will immediately show a **Sync Failed** or **Unknown** status.
Read the error message:
`application destination {https://kubernetes.default.svc kube-system} is not permitted in project 'webapp-project'`

**Investigation:**
The Application Controller rejected the desired state before even trying to talk to the Kubernetes API. The AppProject successfully prevented a cross-namespace deployment.
Change the namespace back to `staging`, apply it, and the application will turn green again.

---

## A Brief Note on Argo CD RBAC

AppProjects restrict what *Argo CD* can do. Argo CD RBAC restricts what *humans* can do inside the Argo CD UI/CLI.
In production, you will connect Argo CD to your company's SSO (like Okta or Azure AD). You will write an `argocd-rbac-cm` ConfigMap that says:
*"If a user is in the 'WebApp-Developers' SSO group, give them 'Sync' permissions only for Applications inside the 'webapp-project'."*
We will not configure SSO in this lab, but you must know this is how humans are restricted.

---

## The Secrets Problem in GitOps

If Git is the single source of truth, where do we put our database password?
**NEVER put plaintext secrets in Git.**
**NEVER put base64-encoded Kubernetes Secret YAMLs in Git.** (Base64 can be decoded by anyone in 1 second).

In GitOps, we use the **External Secrets** pattern. You do not store the *value* of the secret in Git; you store the *pointer* to the secret in Git.

**How it works in practice:**

1. A platform engineer manually saves the database password in a secure vault (e.g., AWS Secrets Manager, Azure Key Vault, or HashiCorp Vault). Let's call it `db-password-prod`.
2. You install a tool like **External Secrets Operator (ESO)** into your Kubernetes cluster.
3. In your GitOps repository, instead of writing a Kubernetes `Secret` YAML, you write an `ExternalSecret` Custom Resource:

```yaml
# This goes into Git. It is safe because there are no real passwords here.
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: webapp-db-secret
spec:
  refreshInterval: "1h"
  secretStoreRef:
    name: aws-secrets-manager
    kind: ClusterSecretStore
  target:
    name: real-k8s-secret-for-webapp
  data:
  - secretKey: password
    remoteRef:
      key: db-password-prod

```

4. Argo CD reads Git and syncs this `ExternalSecret` to the cluster.
5. The ESO controller inside the cluster sees the `ExternalSecret`, talks to AWS (using an IAM role), fetches the real password, and generates the standard Kubernetes `Secret` containing the base64 value.
6. Your Pod mounts the standard Kubernetes `Secret`.

This is beautiful engineering: The GitOps workflow is preserved, Argo CD still manages the deployment declaratively, but the sensitive material is perfectly safe.

*(Alternative: Tools like **Sealed Secrets** or **SOPS** encrypt the secret value into ciphertext using a public key. The ciphertext is committed to Git. A controller inside the cluster decrypts it using a private key. This is also valid, but ESO is generally preferred in enterprise cloud environments).*

#### Cleanup

Leave the AppProject and Applications running. We will use them in Volume 4 when we introduce a second Kubernetes cluster.

---

## Things Senior DevOps Engineers Notice

1. **The Argo CD Service Account Blast Radius:** When installed, Argo CD's application-controller uses a Service Account with `cluster-admin` privileges. In highly secure environments, senior engineers strip these rights and give Argo CD explicit RBAC roles per namespace, enforcing true least privilege at the Kubernetes API level.
2. **RBAC Drift:** If you manage Argo CD's RBAC ConfigMap manually through `kubectl`, it will drift. Senior engineers use an Argo CD Application to manage Argo CD's own configuration (The App of Apps pattern).
3. **Secret Rotation:** When using External Secrets, if a database admin rotates the password in AWS Secrets Manager, the External Secrets Operator will detect it (based on `refreshInterval`) and update the Kubernetes Secret. However, the Pods using that secret will not automatically restart to pick up the new value unless you use a tool like Reloader.

---

## Interview Preparation

#### Level 1 — Fundamentals

**Q: What is the purpose of an AppProject in Argo CD?**
A: An AppProject provides logical grouping and security restrictions for Applications. It defines which Git repositories can be used, which target clusters and namespaces can be deployed to, and which Kubernetes resources are allowed or denied.

**Q: Why shouldn't we store Kubernetes Secrets directly in a GitOps repository?**
A: Standard Kubernetes Secrets are only base64 encoded, not encrypted. Anyone with read access to the Git repository can decode the secrets and compromise the infrastructure.

#### Level 2 — Practical

**Q: How do you handle secrets in a GitOps workflow?**
A: We use external secret management systems. A common approach is the External Secrets Operator. We commit an `ExternalSecret` manifest to Git, which acts as a pointer. Argo CD syncs the pointer to the cluster, and the operator securely fetches the actual secret value from a provider like AWS Secrets Manager or HashiCorp Vault to create the native Kubernetes Secret.

#### Level 3 — Scenario Based

**Q: "A new developer joined Team A. They created an Argo CD Application for a new microservice, but the Argo CD UI says 'Sync Failed: destination namespace is not permitted'. What is the problem and how do you fix it?"**
**How I should think:** The Application Controller is enforcing a boundary. Check the AppProject.
**Answer:** The Application is assigned to an AppProject that has a restricted list of allowed destination namespaces, and the developer's target namespace is not on that list. To fix it, a platform engineer must update the `AppProject` manifest in Git to add the new namespace to the `destinations` list, and then sync the AppProject.

#### Level 4 — Senior Thinking

**Q: "If someone gains admin access to your Argo CD UI, what is the worst they can do, and how would you mitigate this architecturally?"**
**How I should think:** UI admin means they can create any Application, bypassing Git branch protections.
**Answer:** An attacker with Argo CD admin access could create a rogue Application pointing to their own malicious Git repository and deploy privileged pods to take over the cluster. To mitigate this, we enforce strict AppProjects that only allow company-owned Git repositories, deny cluster-scoped resource creation (like ClusterRoles), and implement SSO with strict RBAC so nobody shares the local 'admin' account. Additionally, we restrict Argo CD's own Kubernetes Service Account so it cannot modify critical system namespaces like `kube-system`.

---

*This concludes Volume 3. You have now secured your GitOps pipeline with Projects and learned how to handle secrets declaratively. In Volume 4, things get serious as we introduce multi-cluster architecture and deploy our application across different Kubernetes clusters from a single Argo CD control plane.*