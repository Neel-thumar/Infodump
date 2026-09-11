---
id: identity-secrets
title: "Volume 2 — Identity and Secrets: IAM, STS, KMS, Secrets Manager"
order: 2
description: The policy evaluation algorithm AWS runs on every request, why roles beat access keys, and how envelope encryption actually works — anchored on the Capital One breach and the crypto-mining economy built on leaked keys.
draft: false
---

# Mastering AWS: The Engineering, The History, The Incidents

## Volume 2 — Identity and Secrets: IAM, STS, KMS, Secrets Manager

---

## The Question This Volume Answers

In Volume 1 you learned that every AWS operation is a signed HTTP request. The signature proves *who sent it*.

But proving identity is the easy half. The hard half is the next question: **is this identity allowed to do this specific thing to this specific resource right now?**

That question gets answered several billion times a second, across millions of accounts, with policies written by people who mostly don't understand the evaluation rules. It has to be fast enough to not be a bottleneck and correct enough that a mistake doesn't leak a hundred million people's financial records.

Which it did, once. We'll get there.

Two ideas carry this volume:

1. **IAM is a deny-by-default evaluation engine**, and once you know its actual algorithm, policies stop being guesswork.
2. **KMS never encrypts your data.** It encrypts a key that encrypts your data, and that indirection is the entire product.

These belong in one volume because a KMS key policy *is* an IAM policy, evaluated by the same engine with one extra rule. Teaching them separately means teaching the same thing twice.

---

## Part One: IAM

## THE PROBLEM: Everything Is a Shared Machine

Go back to 2006. EC2 launches. There is no IAM.

Your account has one identity — the thing we now call root — and one credential pair. That's it. Every person on your team who needs to touch AWS shares the same secret. Every script uses it. When someone leaves, you rotate it and break everything simultaneously.

Now stack up what that can't express:

- "This intern can restart web servers but not touch the database."
- "This application can read from exactly one S3 bucket and nothing else."
- "Our auditor can look at everything and change nothing."
- "This build server can deploy, but only between 9am and 6pm, and only from our office IP."
- "This partner company's account can write to this one queue."

None of it. You have one key that does everything.

And there's a worse problem hiding underneath. Suppose your application needs to read from S3. You put a credential on the server. That credential is now a file on a machine. It sits there for months or years. Anyone who gets any kind of read access to that machine — a path traversal bug, a log that captured an environment variable, a misconfigured proxy, a stolen backup — gets a permanent key to your account.

**Long-lived credentials on machines is the structural flaw.** Almost everything IAM does is an attempt to eliminate it.

AWS launched IAM in 2011. It has grown steadily more capable and, honestly, steadily more complicated. Let's take it apart in the right order.

---

## THE MECHANISM: The Pieces

### Principals

A **principal** is an entity that makes a request. There are a few kinds:

- **Root user** — the account itself. Unrestrictable. Locked in a drawer (Volume 1).
- **IAM user** — a persistent identity, usually for a human, with a password and/or long-lived access keys.
- **IAM role** — an identity with permissions but **no permanent credentials**. Something *assumes* a role and gets temporary credentials for it. This is the important one.
- **Federated identity** — a user authenticated somewhere else (your corporate directory, Google, GitHub) who gets mapped to a role.
- **AWS service** — EC2, Lambda, and friends acting on your behalf, which they do by assuming a role.

Note what's missing from the role definition: credentials. A role is a *set of permissions plus a statement about who may borrow them*. Nobody logs in as a role. They assume it, temporarily.

### ARNs

Every resource in AWS has an **Amazon Resource Name**. Learn to read them, because policies are built out of them.

```text
arn:partition:service:region:account-id:resource
```

Concretely:

```text
arn:aws:iam::123456789012:user/alice
arn:aws:s3:::my-bucket
arn:aws:s3:::my-bucket/reports/q3.pdf
arn:aws:ec2:us-east-1:123456789012:instance/i-0abc123def456
arn:aws:lambda:eu-west-1:123456789012:function:process-orders
```

Two things to notice. **S3 ARNs have no region and no account** — the bucket namespace is global, a historical quirk from Volume 1. And **IAM ARNs have no region**, because IAM is global.

The `partition` is almost always `aws`. It's `aws-cn` in China and `aws-us-gov` in GovCloud — separate partitions that don't talk to the main one.

### Policies

A policy is a JSON document. The core shape:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ReadCompanyReports",
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:ListBucket"],
      "Resource": [
        "arn:aws:s3:::company-reports",
        "arn:aws:s3:::company-reports/*"
      ],
      "Condition": {
        "IpAddress": { "aws:SourceIp": "203.0.113.0/24" }
      }
    }
  ]
}
```

Things worth knowing immediately:

**`Version` is not a date.** `2012-10-17` is the identifier of the policy *language* version. Always use that exact string. Omitting it silently drops you to an ancient version without variable support.

**`Action` and `Resource` must match up.** `s3:ListBucket` operates on a *bucket*; `s3:GetObject` operates on an *object*. That's why the example lists both the bucket ARN and the `/*` object ARN. Getting this wrong — writing only the `/*` form and then wondering why listing fails — is the single most common S3 policy bug in existence.

**`Condition` is where the real power is.** Time windows, source IP, whether MFA was used, whether the request came over TLS, tag matching, what service made the call. Conditions are how you express "only from our VPC" or "only if this resource is tagged with their team name."

**There are also `NotAction` and `NotResource`.** They mean "everything except." They're occasionally necessary and frequently a trap — a `NotAction` on an Allow grants every future service AWS ever launches. Use with suspicion.

### The five places policies attach

This is where people get lost. The same JSON language is used in structurally different positions:

| Type | Attached to | Purpose |
|---|---|---|
| **Identity-based** | User, group, or role | What this identity may do |
| **Resource-based** | The resource itself (bucket, queue, KMS key) | Who may do what to this thing |
| **Permissions boundary** | User or role | A ceiling — the *maximum* this identity could ever have |
| **Service control policy (SCP)** | An Organizations OU or account | A ceiling for an entire account |
| **Session policy** | Passed at role-assumption time | A ceiling for this one session |

The critical distinction: **identity-based policies grant. Boundaries and SCPs only restrict.** An SCP that "allows" S3 doesn't give anyone S3 access — it merely declines to block it. Grants must still come from an identity-based or resource-based policy.

Resource-based policies are the odd one out in a useful way: they have a `Principal` field. That's what makes cross-account access possible. An S3 bucket policy can name another AWS account as a principal, which no identity-based policy can do.

---

## THE MECHANISM: The Evaluation Algorithm

Here it is. This is the thing worth memorizing.

For every request, AWS runs roughly this:

```text
1. Collect all applicable policies
   (SCPs, resource-based, identity-based, boundaries, session policies)

2. Is there an EXPLICIT DENY anywhere in any of them?
       YES -> DENY. Stop. Nothing overrides this.
       NO  -> continue

3. Does an SCP allow the action?
       NO  -> DENY (implicit)
       YES -> continue

4. Does a resource-based policy explicitly allow it?
       YES -> ALLOW  (for same-account principals; see note below)
       NO  -> continue

5. Does an identity-based policy allow it,
   AND does the permissions boundary also allow it,
   AND does the session policy also allow it?
       YES -> ALLOW
       NO  -> DENY (implicit)
```

### The three rules that fall out of this

**Rule 1 — Default deny.** If nothing says Allow, the answer is no. A brand-new IAM user with no policies can do essentially nothing. This is why you attach permissions rather than remove them.

**Rule 2 — Explicit Deny always wins.** Not "usually." Always. You can attach `AdministratorAccess` and one tiny policy with a single Deny statement, and that Deny holds. There is no priority number, no specificity tiebreaker, no ordering. Deny beats everything.

This is enormously useful. It's how you write guardrails: "administrators can do anything, *except* delete CloudTrail logs, *except* modify the audit role, *except* operate outside our approved Regions."

**Rule 3 — Restrictions intersect, they don't add.** If your identity policy allows S3 and your permissions boundary allows only DynamoDB, you get nothing. The effective permission is the intersection of every ceiling with every grant.

### The cross-account nuance

Within a single account, a resource-based policy allowing a principal is generally sufficient on its own.

**Across accounts, you need both sides.** The resource's policy must allow your account or principal, *and* your identity-based policy must allow the action. Two locks, two keys, held by two different parties.

This is deliberate. It means no other account can grant your users permissions you didn't intend, and you can't grant your users access to someone else's resources without their consent. It's also why cross-account setups fail twice as often — there are two places to get it wrong, and the error message rarely tells you which.

### Why this design

Consider the alternative: a priority-ordered rule list, firewall-style. Rule 40 beats rule 50.

That model breaks down catastrophically at scale. When four different teams — the platform team's SCP, the security team's boundary, the app team's role policy, the data team's bucket policy — all contribute rules, priority numbers become a political negotiation. Someone always wants to be rule 1.

AWS's model has no negotiation. The security team writes a Deny; it wins; discussion over. The cost is that it's unintuitive until you learn it, and the effective permission set of a real principal is genuinely hard to compute in your head. AWS knows this, which is why tools like `simulate-principal-policy` and IAM Access Analyzer exist — you'll use one in the exercises.

---

## THE MECHANISM: Roles, STS, and Getting Rid of Keys

Now the part that solves the structural flaw from the top of this volume.

### What a role actually is

A role has two policy documents:

- **The permissions policy** — what the role can do
- **The trust policy** — *who is allowed to assume it*

The trust policy is a resource-based policy where the resource is the role itself. Example — a role that only EC2 instances can assume:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": { "Service": "ec2.amazonaws.com" },
      "Action": "sts:AssumeRole"
    }
  ]
}
```

Or one that another account can assume, with an MFA requirement:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": { "AWS": "arn:aws:iam::111122223333:root" },
      "Action": "sts:AssumeRole",
      "Condition": {
        "Bool": { "aws:MultiFactorAuthPresent": "true" }
      }
    }
  ]
}
```

*(The `:root` there does not mean the root user. In a trust policy it means "this account, delegating to its own IAM policies" — an unfortunate overload of the word.)*

### STS: the credential vending machine

**AWS Security Token Service** issues temporary credentials. The main calls:

- **`AssumeRole`** — take on a role in the same or another account
- **`AssumeRoleWithWebIdentity`** — exchange an OIDC token (Google, GitHub Actions, a Kubernetes service account) for AWS credentials
- **`GetSessionToken`** — upgrade your existing credentials, typically to attach MFA
- **`GetCallerIdentity`** — the "who am I" call from Volume 1

What comes back is a triple: an access key ID, a secret access key, and a **session token**. All three must be sent with the request. The session token is what tells AWS "this is temporary, here's the associated session context."

Lifetimes run from 15 minutes up to the role's configured maximum, commonly one hour by default and up to twelve. **Role chaining** — assuming a role from within an assumed role — is capped at one hour regardless.

### How an EC2 instance gets credentials without having any

This is the mechanism at the heart of the Capital One breach, so follow it closely.

You attach a role to an EC2 instance (technically via an *instance profile*, a container object that exists for historical reasons). No key is written to disk. Instead:

1. Something on the instance queries a special link-local address: **`169.254.169.254`**
2. That address is the **Instance Metadata Service (IMDS)**, served by the hypervisor — it never leaves the host, it isn't on the network
3. IMDS returns temporary credentials for the attached role
4. The credentials expire and are automatically refreshed

Every AWS SDK does this automatically. It's why code running on EC2 with a role needs zero credential configuration and Just Works.

It is a genuinely elegant design. Credentials are never at rest, never in a repo, never in an environment variable, and rotate constantly.

It also has an obvious flaw that took AWS thirteen years to close, and cost a bank a hundred million records.

---

## REAL INCIDENT: Capital One, 2019

### What happened

In roughly March 2019, an individual named Paige Thompson — a former employee of a cloud provider, though not working there at the time — obtained data on approximately **100 million Capital One customers in the United States and around 6 million in Canada**. Credit card applications, names, addresses, dates of birth, income, and a smaller number of Social Security and bank account numbers.

The breach wasn't discovered until July 2019, when an outside researcher emailed Capital One's responsible-disclosure address about data posted publicly online.

### The attack chain

The technical path is worth walking step by step, because each link is a lesson.

**Link 1 — a misconfigured web application firewall.** Capital One ran a WAF (reported to be ModSecurity) on EC2. It was configured in a way that allowed an attacker to make it issue arbitrary outbound requests on their behalf. This class of bug is **server-side request forgery (SSRF)**: you can't reach an internal system directly, but you can trick a server that *can* reach it into fetching things for you.

**Link 2 — SSRF to the metadata service.** The attacker pointed the SSRF at `169.254.169.254`. From the WAF host's point of view, this was a perfectly ordinary local request. IMDS answered.

**Link 3 — credentials for free.** IMDS handed back temporary credentials for the role attached to that instance.

**Link 4 — over-permissioned role.** That role could list and read a large number of S3 buckets — far more than a WAF has any business touching.

**Link 5 — exfiltration.** With valid AWS credentials, the rest was just using S3 normally.

### Four separate failures, any one of which would have stopped it

This is the part I want you to sit with. It wasn't one mistake.

1. **The SSRF vulnerability** — an application bug
2. **IMDSv1's design** — a plain unauthenticated GET to a well-known address returned credentials
3. **Excessive role permissions** — the classic violation of least privilege
4. **No detection** — months of unusual S3 access from a WAF instance went unnoticed

Defense in depth isn't a slogan. It's the observation that attacks are chains, and chains break at any link.

### What AWS built afterward: IMDSv2

In November 2019, AWS released a second version of the metadata service. The change is small and clever.

**IMDSv1** — one request:

```bash
curl http://169.254.169.254/latest/meta-data/iam/security-credentials/
```

**IMDSv2** — two requests, where the first must be a `PUT`:

```bash
TOKEN=$(curl -X PUT "http://169.254.169.254/latest/api/token" \
  -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")

curl -H "X-aws-ec2-metadata-token: $TOKEN" \
  http://169.254.169.254/latest/meta-data/iam/security-credentials/
```

Why does that help? Because the things that produce SSRF — a URL field, an image fetcher, a misconfigured proxy — overwhelmingly issue **GET** requests and cannot set **custom headers**. Requiring a PUT plus a custom header doesn't make the endpoint more secret; it makes it unreachable by the specific class of confused-deputy bug that was used against it.

There's a second control: **the hop limit.** IMDSv2 responses carry a TTL that defaults to 1, meaning the response won't survive a network hop. A container on a default bridge network, or a forwarding proxy, can't relay it outward.

### Where this stands now

AWS has progressively pushed toward IMDSv2 as the default for new launches. You can enforce it yourself — per instance, or account-wide via a setting, or organization-wide via an SCP that denies launches with IMDSv1 enabled.

**Check your own instances.** If you inherit an AWS environment, this is a reasonable first audit.

*Accuracy note: Thompson was charged in 2019 and convicted in 2022; Capital One paid regulatory penalties and settled civil litigation. I'm giving the technical chain as described in the indictment and subsequent public analysis. Some operational specifics were never publicly confirmed in detail, and I'd rather say so than invent them.*

---

## REAL INCIDENT: The Access Key Mining Economy

The second incident is not one event. It's a continuous, industrialized business.

### The mechanism

Someone commits `~/.aws/credentials`, or hardcodes a key in a config file, or bakes one into a Docker image layer, and pushes it to GitHub.

Within seconds — not hours — automated scanners find it. This is a well-documented phenomenon: researchers have planted honeypot keys and measured detection times in the **single-digit minutes, sometimes seconds**.

What the scanners do next is almost always the same: launch the largest GPU instances the account's limits allow, in every Region they can reach, and mine cryptocurrency. Compute converted directly to money, billed to you.

The victim finds out when the bill arrives. Amounts in the tens of thousands of dollars are routine; there are credible public accounts of six-figure weekends.

### Why this is the perfect illustration of the structural flaw

A long-lived access key has three properties that together are fatal:

- **It doesn't expire.** A key leaked in 2019 works in 2026 unless someone noticed.
- **It's a bearer token.** Whoever holds it *is* you. No second factor, no device binding, no source restriction unless you added one.
- **It's plaintext.** It goes in files, environment variables, CI configuration, and shell history.

Contrast with a role: credentials that live an hour, are never written to disk, and are bound to a session with conditions attached.

### What AWS does about it

AWS scans public repositories for exposed keys and, on finding one, applies a quarantine policy that blocks the most damaging actions — and emails you loudly. GitHub also partners with providers on secret scanning and can block pushes containing recognized credential formats.

Do not treat any of this as a safety net. It's a backstop that sometimes works, and the mining bots are often faster.

### The practical rules

- **Prefer roles to keys, always.** On EC2, ECS, EKS, Lambda: use a role. There is no excuse.
- **For CI/CD, use OIDC federation.** GitHub Actions, GitLab CI, and others can exchange a short-lived identity token for AWS credentials via `AssumeRoleWithWebIdentity`. No stored key at all. This is the single highest-value change most teams can make.
- **If you must have a key, condition it.** Source IP, MFA required, expiry enforced by policy.
- **Rotate and audit.** IAM's credential report tells you every key's age and last use.
- **Use git hooks or a scanner** so a secret can't be committed in the first place.

---

## Part Two: Encryption

## THE PROBLEM: Where Do You Put the Key?

Encryption at rest sounds simple. Encrypt the data, store the ciphertext, done.

Then: where's the key?

Next to the data? Then anyone who steals the data steals the key. In the application config? Then every server has it, forever, and rotating it means re-encrypting everything. In a hardware security module you operate? Now you're running an HSM fleet, and if you lose it, every byte you own is gone permanently.

And underneath all of that, a scaling problem. Suppose you have one key for a petabyte of data. Rotating it means re-encrypting a petabyte. So you'd want many keys — but now you have a key management problem instead of a key storage problem, which is worse.

**The real problem isn't encryption. It's key custody and key lifecycle.**

---

## THE MECHANISM: Envelope Encryption

The solution is an indirection, and it's the whole idea behind KMS.

### The flow

**To encrypt:**

1. Ask KMS for a **data key**. KMS generates a fresh symmetric key and returns it **twice**: once in plaintext, once encrypted under your KMS key.
2. Encrypt your data locally with the plaintext data key.
3. **Throw away the plaintext data key.** Wipe it from memory.
4. Store the encrypted data key alongside the ciphertext.

**To decrypt:**

1. Read the encrypted data key from next to the ciphertext.
2. Send it to KMS and ask for decryption. KMS checks whether you're permitted, and if so returns the plaintext data key.
3. Decrypt your data locally.
4. Discard the plaintext data key again.

### Why every piece of that matters

**Your data never goes to KMS.** Only small keys travel. This means KMS doesn't need petabyte-scale bandwidth, and it means a multi-gigabyte file encrypts at local disk speed, not network speed.

**The KMS key never leaves the HSMs.** The root key material is generated in and confined to hardware security modules. You cannot export it. AWS operators cannot export it. This is uncomfortable in one direction — you're trusting AWS's implementation — and reassuring in the other.

**Access control becomes an API call.** Since decryption requires calling KMS, *every* decryption is an authorization decision and a logged event. Revoking access to an exabyte of encrypted data is a policy edit, not a re-encryption project.

**Rotation becomes tractable.** Use a fresh data key per object. Rotating the KMS key doesn't require touching any of the data — the old backing key is retained so old data keys still decrypt.

**And the failure mode is honest.** Lose access to the KMS key and the data is gone. Not "hard to recover." Gone. This is why KMS key deletion has a mandatory waiting period of 7 to 30 days and shouts at you the whole time.

### Key types

- **Customer managed keys** — you create them, you control the policy, you can schedule deletion. Roughly **1 USD per month each**, plus a small per-request charge.
- **AWS managed keys** — created automatically per service (`aws/s3`, `aws/rds`), free, but you can't edit their policies.
- **AWS owned keys** — shared across customers, invisible to you, free.
- **Symmetric vs. asymmetric** — symmetric AES-256 covers the vast majority of use. Asymmetric exists for signing and for cases where a party can only encrypt.

### The rule that catches everyone: key policies are mandatory

Here's where Part One and Part Two fuse.

For most AWS resources, an IAM policy granting access is sufficient. **KMS is different.** Every KMS key has a **key policy**, a resource-based policy, and it is the primary authority. IAM policies alone do not grant access to a KMS key unless the key policy explicitly delegates to IAM.

The standard delegation clause looks like this:

```json
{
  "Sid": "EnableIAMPolicies",
  "Effect": "Allow",
  "Principal": { "AWS": "arn:aws:iam::123456789012:root" },
  "Action": "kms:*",
  "Resource": "*"
}
```

That statement is what makes normal IAM policies work for the key. Remove it and only principals named directly in the key policy get in.

This catches people constantly. An administrator with `AdministratorAccess` gets `AccessDeniedException` on a KMS key, stares at their obviously-sufficient IAM policy, and loses an afternoon. Recall the evaluation algorithm: the resource-based policy is consulted, and for KMS it's not optional.

**The genuinely dangerous version:** a key policy that names a single principal and that principal gets deleted. Now nobody can administer the key — including AWS. Recovering from this requires AWS Support. Never write a key policy without a viable administrator path.

### Grants

A **grant** is a lighter-weight, temporary permission on a KMS key, used heavily by AWS services internally. When EBS encrypts a volume for you, it's operating under a grant rather than a policy edit. You'll mostly encounter them when reading CloudTrail and wondering where a permission came from.

---

## THE MECHANISM: Secrets Manager, and When Not to Use It

KMS handles keys. But you also have *secrets* — database passwords, third-party API tokens, things that aren't encryption keys but must not be in a config file.

Two services, and the choice matters:

| | Secrets Manager | SSM Parameter Store (SecureString) |
|---|---|---|
| Cost | ~0.40 USD per secret/month + API charges | Standard tier free; advanced tier charged |
| Built-in rotation | Yes, via managed Lambda | No, build it yourself |
| Native RDS integration | Yes | No |
| Cross-account resource policy | Yes | Limited |
| Best for | Database credentials needing rotation | Config values, general secrets, cost sensitivity |

Both encrypt with KMS. Both are enormous improvements over a file.

**The honest guidance:** Parameter Store SecureString is genuinely fine for most secrets and materially cheaper. Reach for Secrets Manager when you specifically want automated rotation or the native database integrations. Teams that default to Secrets Manager for hundreds of config values are paying for a rotation feature they never enable.

**And the anti-pattern to watch for:** fetching a secret from Secrets Manager on every single request, inside a Lambda, at scale. It works, it's correct, and the API charges will surprise you. Cache it for the life of the execution environment.

---

## TRY THIS ON YOUR MACHINE

All of these need the CLI from Volume 1. **Exercise 4 creates a KMS key, which costs roughly 1 USD per month prorated** — cleanup is included and takes a moment to schedule.

### 1. Watch explicit Deny beat AdministratorAccess

Create a policy that denies one narrow thing:

```bash
cat > /tmp/deny-ec2-describe.json <<'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Deny",
      "Action": "ec2:DescribeInstances",
      "Resource": "*"
    }
  ]
}
EOF

aws iam create-policy \
  --policy-name TempDenyDescribeInstances \
  --policy-document file:///tmp/deny-ec2-describe.json
```

Attach it to your admin user (substitute your username), then try the action:

```bash
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
aws iam attach-user-policy --user-name YOUR-USERNAME \
  --policy-arn arn:aws:iam::$ACCOUNT:policy/TempDenyDescribeInstances

aws ec2 describe-instances --region us-east-1
```

**What to expect:** `UnauthorizedOperation`, despite holding `AdministratorAccess`.

**Why it's interesting:** you just proved Rule 2 empirically. There is no override, no precedence argument, no ordering. This is the mechanism behind every organizational guardrail you'll ever write.

**Cleanup:**
```bash
aws iam detach-user-policy --user-name YOUR-USERNAME \
  --policy-arn arn:aws:iam::$ACCOUNT:policy/TempDenyDescribeInstances
aws iam delete-policy --policy-arn arn:aws:iam::$ACCOUNT:policy/TempDenyDescribeInstances
rm /tmp/deny-ec2-describe.json
```

### 2. Ask IAM to explain itself before you deploy

```bash
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
aws iam simulate-principal-policy \
  --policy-source-arn arn:aws:iam::$ACCOUNT:user/YOUR-USERNAME \
  --action-names s3:GetObject s3:DeleteBucket iam:CreateUser ec2:TerminateInstances \
  --query "EvaluationResults[].{Action:EvalActionName,Decision:EvalDecision}" \
  --output table
```

**What to expect:** a table of `allowed` / `implicitDeny` / `explicitDeny` per action.

**Why it's interesting:** this runs the real evaluation engine without performing anything. `implicitDeny` versus `explicitDeny` tells you *why* something failed — nothing granted it, versus something actively blocked it. That distinction turns most IAM debugging from guesswork into a lookup.

**Cleanup:** none — read-only.

### 3. Become someone else for an hour

Create a role that your own user can assume:

```bash
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)

cat > /tmp/trust.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "AWS": "arn:aws:iam::$ACCOUNT:user/YOUR-USERNAME" },
    "Action": "sts:AssumeRole"
  }]
}
EOF

aws iam create-role --role-name TempReadOnlyRole \
  --assume-role-policy-document file:///tmp/trust.json

aws iam attach-role-policy --role-name TempReadOnlyRole \
  --policy-arn arn:aws:iam::aws:policy/ReadOnlyAccess
```

Wait a few seconds for propagation, then assume it and inspect the result:

```bash
aws sts assume-role \
  --role-arn arn:aws:iam::$ACCOUNT:role/TempReadOnlyRole \
  --role-session-name my-test-session
```

**What to expect:** JSON containing `AccessKeyId`, `SecretAccessKey`, **`SessionToken`**, and an `Expiration` timestamp. Note the key ID starts with `ASIA`, not `AKIA` — that prefix distinguishes temporary from long-lived credentials.

Export all three and check your identity:

```bash
export AWS_ACCESS_KEY_ID=...
export AWS_SECRET_ACCESS_KEY=...
export AWS_SESSION_TOKEN=...
aws sts get-caller-identity
```

**Why it's interesting:** your ARN now shows `assumed-role/TempReadOnlyRole/my-test-session`, not your user. You've swapped identity without any new permanent credential existing anywhere. The `Expiration` field is the entire security argument against the access key in your `~/.aws/credentials`.

**Cleanup:**
```bash
unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN
aws iam detach-role-policy --role-name TempReadOnlyRole \
  --policy-arn arn:aws:iam::aws:policy/ReadOnlyAccess
aws iam delete-role --role-name TempReadOnlyRole
rm /tmp/trust.json
```

### 4. Do envelope encryption by hand

**Cost flag: this creates a customer managed KMS key, about 1 USD/month prorated.** Cleanup schedules deletion at the 7-day minimum.

```bash
KEY_ID=$(aws kms create-key \
  --description "envelope encryption demo - delete me" \
  --query KeyMetadata.KeyId --output text)
echo "Key: $KEY_ID"
```

Generate a data key — note it comes back twice:

```bash
aws kms generate-data-key --key-id $KEY_ID --key-spec AES_256 \
  --query "{Plaintext:Plaintext,Encrypted:CiphertextBlob}" --output json > /tmp/datakey.json

jq -r .Plaintext /tmp/datakey.json | base64 -d > /tmp/plaintext.key
jq -r .Encrypted /tmp/datakey.json | base64 -d > /tmp/encrypted.key
ls -l /tmp/plaintext.key /tmp/encrypted.key
```

Encrypt a file locally with the plaintext key, then destroy it:

```bash
echo "the actual secret payload" > /tmp/secret.txt
openssl enc -aes-256-cbc -pbkdf2 -in /tmp/secret.txt -out /tmp/secret.enc \
  -pass file:/tmp/plaintext.key
shred -u /tmp/plaintext.key 2>/dev/null || rm -f /tmp/plaintext.key
```

Now recover it — the only thing you kept was the *encrypted* key:

```bash
aws kms decrypt --ciphertext-blob fileb:///tmp/encrypted.key \
  --query Plaintext --output text | base64 -d > /tmp/recovered.key

openssl enc -d -aes-256-cbc -pbkdf2 -in /tmp/secret.enc -pass file:/tmp/recovered.key
```

**What to expect:** your original line of text.

**Why it's interesting:** you performed manually what S3, EBS, and RDS do invisibly on every write. Notice what never crossed the network: your data. Notice what makes the recovery possible: not possession of a key, but *permission to call KMS*. That's the whole design — access control replaced key custody.

**Cleanup:**
```bash
aws kms schedule-key-deletion --key-id $KEY_ID --pending-window-in-days 7
rm -f /tmp/secret.txt /tmp/secret.enc /tmp/recovered.key /tmp/encrypted.key /tmp/datakey.json
```

### 5. Audit yourself the way an attacker would

```bash
aws iam generate-credential-report > /dev/null
sleep 5
aws iam get-credential-report --query Content --output text | base64 -d | column -t -s,
```

**What to expect:** a CSV of every IAM user with MFA status, key age, last-used dates, and password age.

**Why it's interesting:** this is the first artifact any auditor or incident responder pulls. Look specifically at `access_key_1_last_used_date` — a key that's years old and never used is pure unguarded risk. In an inherited AWS account, this report plus an IMDSv1 audit is a genuinely good first day of work.

**Cleanup:** none — read-only.

---

## What You Should Now Be Able To Say

- The evaluation order, and why explicit Deny is absolute
- Why `s3:ListBucket` and `s3:GetObject` need different Resource ARNs
- The difference between a grant (identity/resource policy) and a ceiling (boundary/SCP)
- What's in a trust policy and why a role has two documents
- The full Capital One chain, and which single fix at each link would have stopped it
- Why `ASIA` and `AKIA` key prefixes tell you something important
- Why KMS returns a data key twice, and what you do with each copy
- Why an administrator can still get AccessDenied on a KMS key

---

## Where We Go Next

**Volume 3 — VPC: Building a Network That Doesn't Exist.**

You now control *who* can act. Next: *where packets can go*. We'll build a VPC from an empty CIDR block upward — subnets, route tables, internet gateways, NAT, and the distinction that burns more hours than any other in AWS: **security groups are stateful, network ACLs are not.** Then ENIs, VPC endpoints (which will connect straight back to today's IAM material), peering, and Transit Gateway.

The incident is the anatomy of the `0.0.0.0/0` breach — plus a hard look at what a NAT Gateway bill reveals about where your data is actually travelling, which sets up Volume 9.

Volume 3 is the other likely candidate for a chapter split. I'll ask before I start.

---

*Volume 2 complete. Say **continue** when you're ready for Volume 3.*
