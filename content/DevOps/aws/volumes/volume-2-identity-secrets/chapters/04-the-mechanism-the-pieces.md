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

