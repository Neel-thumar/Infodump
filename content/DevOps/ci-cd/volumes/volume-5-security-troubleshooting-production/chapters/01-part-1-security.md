## Part 1 — Security

### 1. Why the pipeline is a high-value target

Your pipeline has, in one place:

- Read access to all source code
- Write access to the artifact registry everyone downstream trusts
- Credentials for test, staging, and production
- Network access into environments developers can't reach directly
- The ability to execute arbitrary commands

An attacker who controls the build doesn't need to break production directly. They put something in the artifact, and your own trusted promotion process delivers it. That's the supply-chain problem in one sentence:

> **Everything downstream trusts the build. So the build is the thing worth attacking.**

### 2. How secrets actually leak

Nobody commits a password on purpose. Secrets escape through paths that all look harmless.

| Path | How it happens |
|---|---|
| **Printed in logs** | `set -x` in a script, a debug `env` dump, a tool echoing its own arguments, a curl command with a token in the URL |
| **Unprotected variables** | Any branch pipeline can read them, so anyone who can push a branch can exfiltrate them |
| **Error messages** | A failing HTTP client printing the full request, including headers |
| **Artifacts** | A generated `.env`, a kubeconfig, or a build log saved as an artifact and downloadable by anyone with project access |
| **Cache** | A credentials file inside a cached directory, restored into other jobs |
| **Baked into images** | `ARG`/`ENV` secrets that persist in image layers — deleting the file in a later layer doesn't remove it |
| **Third-party CI code** | An included template or action from a moving reference that changes underneath you |
| **Wide scope** | A group-level variable inherited by fifty projects, most of which have no business with it |

Masking is a safety net with real holes: base64 the value, split it, or transform it, and masking no longer matches. So:

> **Masking prevents accidents. Scoping prevents attacks.**

### 3. Practical secret hygiene

**Scope narrowly.** Project-level over group-level. Environment-scoped where possible. A test-environment credential should not exist in a production job, and vice versa.

**Protect everything that deploys.** Protected variable + protected branch + protected environment + a tagged, restricted runner. Any one of those alone is weak; together they close the path.

**Short-lived over long-lived.** GitLab's registry credentials expire with the job — that's the model to copy. Prefer OIDC/workload-identity federation with cloud providers over stored static keys: the job exchanges a short-lived GitLab token for temporary cloud credentials, so there is no long-lived secret sitting in settings at all. This is where mature setups have moved.

**Never echo. Check emptiness instead:**

```bash
- if [ -z "$DEPLOY_TOKEN" ]; then echo "DEPLOY_TOKEN not available"; exit 1; fi
```

**Rotate.** On staff changes, on any suspicion, and on a schedule. If rotation requires a person who understands a 12-step process, it won't happen — automate it.

**Assume compromise on exposure.** A secret printed in a log is compromised, even if the log is private and you delete it. Rotate it. "Probably fine" is not a security posture.

### 4. Forks and merge requests

The scenario that surprises people: an outside contributor opens a merge request. Your pipeline runs their code — including their changes to `.gitlab-ci.yml`.

Controls that matter:

- **Protected variables** are unavailable to fork pipelines and unprotected branches. This is the main defence.
- **Merge request pipelines for forks** should require approval before running, for public or externally contributed projects.
- **Protected branches** prevent direct pushes to `main` and make CI a required gate rather than advice.
- **Review `.gitlab-ci.yml` changes like code**, because a change to the pipeline is a change to what runs with your credentials. CODEOWNERS on that file is a cheap, effective control.

### 5. Runner security architecture

The most important structural decision in this volume.

```text
        ┌──────────────────────────────────────┐
        │  BUILD / TEST FLEET                  │
        │  - runs any branch, any MR           │
        │  - runs untrusted contributed code   │
        │  - NO production credentials         │
        │  - ephemeral, isolated, autoscaled   │
        └──────────────────────────────────────┘

        ┌──────────────────────────────────────┐
        │  DEPLOYMENT RUNNER                   │
        │  - tagged: production-deploy         │
        │  - only protected branches           │
        │  - holds production credentials      │
        │  - small, hardened, tightly audited  │
        └──────────────────────────────────────┘
```

The rule behind it:

> **A runner that can reach production must never execute code that anyone can submit.**

Supporting practices:

- **Ephemeral runners.** Destroy and recreate per job. Nothing persists, so nothing leaks between jobs and nothing drifts.
- **Avoid shell executors for anything shared.** No isolation, and state accumulates.
- **Avoid privileged containers** where possible — the Volume 3 DinD discussion is the common example. Rootless builders remove the need.
- **Network segmentation.** Build runners don't need routes into production. Remove them.
- **Least privilege on the credentials themselves.** A deploy token that can only deploy is far better than an admin key, whatever else goes wrong.

### 6. Scanning in the pipeline

GitLab ships CI templates for scanning. Add them with `include:`:

```yaml
include:
  - template: Jobs/Secret-Detection.gitlab-ci.yml
  - template: Jobs/SAST.gitlab-ci.yml
  - template: Jobs/Dependency-Scanning.gitlab-ci.yml
  - template: Security/Container-Scanning.gitlab-ci.yml
```

What each one answers:

| Scan | Question | Typical engine |
|---|---|---|
| **Secret detection** | Did we commit a credential? | Gitleaks |
| **SAST** | Are there insecure patterns in our source? | Semgrep-based analyzers |
| **Dependency scanning** | Do our third-party packages have known CVEs? | Advisory databases + SBOM |
| **Container scanning** | Does the image's OS/packages have known CVEs? | Trivy |
| **DAST** | Does the running application have exploitable issues? | OWASP ZAP |

**Tier reality, stated honestly:** availability differs by GitLab tier and changes between releases. Broadly, SAST and secret detection are available across tiers with the advanced engines and the aggregated Vulnerability Report in Ultimate; container scanning runs in lower tiers with JSON/SBOM reports as artifacts, while the Vulnerability Report view is an Ultimate feature; DAST and several dashboard features are Ultimate. **Check the current docs for your tier rather than trusting any tutorial**, including this one — this is exactly the kind of detail that shifts release to release.

Where scans belong in the pipeline:

```text
Fast, cheap, early:   secret detection, SAST, dependency scanning  (on every MR)
After image build:    container scanning
Against a deployment: DAST (usually staging, usually scheduled — it's slow)
```

**The part that actually matters, and that tools cannot do for you:**

- **Decide what blocks.** Everything blocking on every CVE is unworkable and gets disabled within a month. A common starting policy: secret detection blocks always (a leaked credential is binary); critical/high vulnerabilities block releases; everything else is tracked with an owner and a due date.
- **Findings need triage, not accumulation.** Ten thousand unreviewed findings is the same as zero scanning, with extra cost.
- **Rebuild on a schedule.** Your base image accrues CVEs while your source code sits unchanged. A weekly scheduled pipeline that rebuilds and rescans catches this.
- **Secret detection is retrospective.** It tells you a credential is in Git history — which means it is already compromised. Rotate first, then clean history.

### 7. Artifact integrity

Signing and provenance — proving *this artifact came from this pipeline, from this commit* — is where supply-chain security is heading (SBOM generation, artifact signing, attestations). It's worth knowing the direction even if you don't implement it yet: the goal is that a deployment target can verify an image's origin instead of trusting that whatever is in the registry got there legitimately.

Start with the basics that give most of the value: immutable tags, restricted registry write access, and a build environment that isn't shared with untrusted code.

---

