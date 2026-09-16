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

