---
id: volume-5-troubleshooting-reliability
title: "Volume 5 — Troubleshooting, Drift, and Reliability"
order: 5
description: "The debugging mindset, investigating failures, and executing GitOps rollbacks."
draft: false
---

# Mastering GitOps: Argo CD Engineering Guide

## Volume 5 — Troubleshooting, Drift, and Reliability

## What Are We Learning?
When a deployment goes perfectly, GitOps feels like magic. But at 2:00 AM, when production is down and Argo CD says "Sync Failed," magic doesn't help you. You need a systematic debugging framework. 

In this volume, we will learn how to troubleshoot Argo CD. We will intentionally break our multi-cluster setup in different ways, investigate the logs, and fix the problems. Most importantly, we will learn how to execute a proper GitOps rollback when an application crashes.

## Why Should a DevOps Engineer Care?
Junior engineers guess. They click the "Sync" button multiple times hoping it works. Senior engineers look at the exact error, determine which component is failing (Git, Repository Server, Application Controller, or Kubernetes API), and fix it immediately. Your value as a platform engineer is directly tied to how fast you can diagnose and recover a broken GitOps pipeline.

## What You Will Be Able to Do
By the end of this volume, you will be able to:
* Use the Debugging Mindset to isolate failures.
* Distinguish between a Sync Failure and a Health Failure.
* Troubleshoot manifest validation errors.
* Execute a proper GitOps rollback using Git, instead of the Argo CD UI.
* Retrieve logs from the correct Argo CD internal components.

---

## The Debugging Mindset: Asking the Right Questions

When an Application misbehaves, do not immediately look at the pods. Look at the Argo CD Application status and ask yourself a sequence of questions.

**1. Is it a Git/Repository access problem?**
*Symptom:* The Application cannot even fetch the blueprint.
*Component:* Repository Server.
*Cause:* The GitHub token expired, the repository was deleted, or the network is blocking GitHub.

**2. Is it a Manifest Rendering problem?**
*Symptom:* `Manifest generation error`.
*Component:* Repository Server.
*Cause:* A typo in `values.yaml`, a missing Kustomize patch, or invalid Helm syntax. Kubernetes hasn't even been contacted yet.

**3. Is it a Sync problem?**
*Symptom:* `Sync Failed`. The status is `OutOfSync`.
*Component:* Application Controller -> Kubernetes API.
*Cause:* Argo CD rendered the YAML perfectly, but the Kubernetes API rejected it. Why? The namespace might not exist, Argo CD might lack RBAC permissions, or you tried to modify an immutable field (like a Deployment selector).

**4. Is it a Health problem?**
*Symptom:* `Synced` (Green) but `Degraded` (Red).
*Component:* Kubernetes actual state.
*Cause:* Argo CD successfully gave the YAML to Kubernetes. Kubernetes accepted it. But the application itself is failing to run (e.g., `ImagePullBackOff`, `CrashLoopBackOff`, failing readiness probes).

---

## The Four Quadrants of GitOps Status

You must memorize the difference between Sync Status and Health Status.

| Sync Status | Health Status | What it means |
| :--- | :--- | :--- |
| **Synced** | **Healthy** | Perfect. The building matches the blueprint, and it is fully operational. |
| **Synced** | **Degraded** | **Health Failure:** Kubernetes accepted the YAML, but the Pods are crashing (e.g., bad code, missing database). |
| **OutOfSync** | **Healthy** | **Drift / Paused:** Someone changed the cluster manually, or you turned off Auto-Sync and pushed to Git. |
| **OutOfSync**| **Degraded** | **Total Failure:** The sync failed, and the currently running application is also broken. |

---

## Practical Lab: Breaking and Fixing the System

Let's put this into practice using our continuous project. 

#### Goal
Create a Health Failure and a Sync Failure. Investigate the root causes, and perform a Git-native rollback.

#### Setup Requirements
Your control plane cluster (running Argo CD) and your production cluster from Volume 4 must be running.

#### Scenario 1: The Health Failure (Bad Image)
Let's simulate a developer pushing a Docker image tag that doesn't actually exist. 

Open `overlays/production/kustomization.yaml` on your laptop. Add an `images` block to override the image to a broken tag:

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - ../../base
namespace: production
namePrefix: prod-
patches:
  - path: replica-patch.yaml
images:
  - name: nginx
    newName: nginx
    newTag: "999.invalid.tag"

```

Commit and push:

```bash
git commit -am "Update prod image to 999.invalid.tag"
git push origin main

```

**What to Observe:**
Go to the Argo CD UI.

1. The Sync Status will quickly turn **Synced** (Green). Why? Because changing an image tag is perfectly valid Kubernetes YAML. The API accepted it.
2. The Health Status will spin, turn **Progressing**, and eventually turn **Degraded** (Red).

**Investigation:**
Click the `webapp-production` application. Click on the Pods that are red.
Argo CD will show you the Kubernetes event: `ErrImagePull` or `ImagePullBackOff`.

**The Fix (GitOps Rollback):**
In a traditional system, you might run `kubectl rollout undo`. **Do not do this in GitOps.** If you do, Auto-Sync will instantly fight you and re-apply the broken `999.invalid.tag` because Git is the source of truth!

To rollback in GitOps, you rollback the *Git repository*.
In your terminal:

```bash
git revert HEAD --no-edit
git push origin main

```

Watch Argo CD. It will detect the reverted commit, sync the old valid image (`1.25`), and the application will become **Healthy** again. You fixed it the GitOps way.

#### Scenario 2: The Sync Failure (Invalid Kubernetes Manifest)

Now, let's simulate a developer pushing YAML that Kubernetes fundamentally rejects.

Open `base/service.yaml`. Change `targetPort: 80` to an invalid port number that Kubernetes does not allow (ports must be between 1 and 65535):

```yaml
  ports:
    - protocol: TCP
      port: 80
      targetPort: 999999

```

Commit and push:

```bash
git commit -am "Update service port to 999999"
git push origin main

```

**What to Observe:**
Go to the Argo CD UI. The Application will immediately show **Sync Failed** (Red) and **OutOfSync** (Yellow).

**Investigation:**
Click on the Application. At the top of the screen, you will see a `Sync Failed` error message. It will read something like:
`Service "prod-webapp-service" is invalid: spec.ports[0].targetPort: Invalid value: 999999: must be between 1 and 65535`

Ask the debugging questions:

* Did it render? Yes.
* Did it sync? No, the Kubernetes API rejected the desired state.

**The Fix:**
Change the `targetPort` back to `80` in `base/service.yaml`, commit, and push. Argo CD will instantly recover and sync successfully.

#### Scenario 3: Checking Argo CD Logs

Sometimes the UI doesn't give you enough information (especially for repository authentication issues). You need to check the logs of Argo CD itself in the control plane cluster.

If it's a Git/Rendering issue, check the Repository Server:

```bash
kubectl logs -l app.kubernetes.io/name=argocd-repo-server -n argocd --tail=50 --context kind-gitops-learning

```

If it's a Sync/Cluster issue, check the Application Controller:

```bash
kubectl logs -l app.kubernetes.io/name=argocd-application-controller -n argocd --tail=50 --context kind-gitops-learning

```

#### Cleanup

Ensure your `gitops-webapp` repository is fixed and pushed, and both applications (`webapp-staging` and `webapp-production`) are green and healthy.

---

## Things Senior DevOps Engineers Notice

1. **The UI Rollback Trap:** Argo CD has a "History and Rollback" button in the UI. If you click it, Argo CD will roll back the cluster, but it will **disable Auto-Sync**. This leaves your cluster and your Git repository permanently out of sync until a human intervenes. Senior engineers rarely use this button. They use `git revert` so the Git history accurately reflects the rollback, and Auto-Sync remains active.
2. **"Synced" tells you nothing about correctness:** A green "Synced" badge only means the blueprint was successfully handed to the builder. It does not mean the application is actually working, connected to the database, or serving traffic. Rely on the "Health" status and external observability tools (like Prometheus/Grafana) for correctness.
3. **Drift is a process failure:** If you are constantly relying on Argo CD's Self-Heal to revert manual `kubectl` changes, your problem is not technical; it is a human process problem. Engineers are bypassing Git because the GitOps pipeline is too slow, too strict, or they lack the knowledge to use it. Fix the pipeline speed, don't just rely on Self-Heal.
4. **Stuck in Pending:** If you deploy a StatefulSet and the persistent volume cannot be provisioned (e.g., AWS EBS limit reached), Argo CD will remain in a `Progressing` state indefinitely. You must configure timeouts or set up alerts for applications stuck in `Progressing` for more than 10 minutes.

---

## Interview Preparation

#### Level 1 — Fundamentals

**Q: If an Argo CD Application shows "Synced" but "Degraded", what does this mean?**
A: It means the desired state from Git was successfully applied and accepted by the Kubernetes API (Synced), but the resources themselves are failing to run correctly in the cluster, such as a Pod crashing in an ImagePullBackOff (Degraded).

**Q: What is the correct way to perform a rollback in a GitOps environment?**
A: The correct way is to revert the commit in the Git repository (e.g., using `git revert`) and push it. Argo CD will detect the reverted state in Git and automatically sync the cluster back to the previous known-good state.

#### Level 2 — Practical

**Q: An Application is failing to sync with a "Manifest generation error". Which Argo CD component is likely failing, and why?**
A: The Repository Server is failing. This usually happens because there is a syntax error in the source manifests (like a bad Helm template or missing Kustomize file). The failure happens in memory before Kubernetes is even contacted.

**Q: You see an Application is "OutOfSync" but "Healthy". Auto-sync is enabled. What is a likely cause?**
A: Someone made a manual change to the cluster using `kubectl` (creating drift), but `selfHeal` is not enabled in the Argo CD sync policy, so Argo CD is reporting the drift without fixing it. The application itself is still running fine (Healthy).

#### Level 3 — Scenario Based

**Q: "Production is down. A bad commit was merged. You click 'Rollback' in the Argo CD UI to restore the previous version. Production is fixed. Two hours later, a developer merges a typo fix to the README. Suddenly, production crashes again with the same error. What happened?"**
**How I should think:** How does the UI Rollback affect Auto-Sync and the Git source of truth?
**Answer:** When you use the Argo CD UI Rollback button, it pauses Auto-Sync. The bad code was still sitting in the `main` branch of Git. When the developer merged the README fix, they created a new commit. The team likely re-enabled Auto-Sync or manually synced the new commit, which pulled in the README fix *along with the bad code that was still in the branch*. In GitOps, you must fix the code in Git via `git revert`.

#### Level 4 — Senior Thinking

**Q: "You are designing an alerting system for a multi-cluster Argo CD setup. What specific Argo CD metrics or events would you alert on to prevent silent deployment failures?"**
**How I should think:** Don't just alert on Pods crashing. Alert on the GitOps machinery breaking.
**Answer:** I would not rely solely on Kubernetes pod metrics. I would alert on Argo CD specific metrics exported to Prometheus:

1. Applications stuck in `OutOfSync` for more than 15 minutes (indicating a failing sync).
2. Applications in a `Degraded` health state.
3. High error rates from the `argocd-repo-server` (indicating Git authentication failures or widespread rendering issues).
4. `argocd-application-controller` work queue depth; if the controller is overwhelmed and falling behind on reconciling, developers will experience silent deployment delays.

---

*This concludes Volume 5. You now possess a solid troubleshooting framework to debug and recover failing GitOps deployments. In our final volume, Volume 6, we will tie everything together into a complete Production GitOps review, checklist, and advanced system design interview mastery.*