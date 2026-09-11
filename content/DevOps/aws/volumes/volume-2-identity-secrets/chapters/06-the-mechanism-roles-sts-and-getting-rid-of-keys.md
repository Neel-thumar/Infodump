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

