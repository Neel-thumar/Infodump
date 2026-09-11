## THE MECHANISM: Organizations and SCPs

### Why multiple accounts

The instinct is one account with tidy IAM. That's wrong, for four concrete reasons:

**Blast radius.** An account is the strongest isolation boundary AWS offers — stronger than a VPC, stronger than an IAM policy. A mistake in a dev account cannot touch production if production is a different account.

**Service quotas are per-account.** Lambda concurrency (Volume 7), EC2 instance limits, VPC counts — all per-account. A runaway dev workload consuming the concurrency pool can starve production if they share an account.

**Billing clarity.** Per-account costs need no tagging discipline to attribute. This alone converts endless arguments into a report.

**Security boundaries.** An auditor with read access to the log archive account gets nothing else. Compliance scope can be confined to one account.

**AWS Organizations** (2017) provides a **management (payer) account**, member accounts, and **organizational units** for grouping. Billing consolidates, volume discounts aggregate across the whole organization, and Savings Plans and RIs can be shared between accounts.

### SCPs — Volume 2's explicit Deny at account scale

A **Service Control Policy** is a permission ceiling attached to an OU or an account.

**SCPs do not grant anything.** They define the maximum. A principal's effective permissions are the intersection of their IAM policies and every SCP above them.

This is precisely Volume 2's evaluation algorithm, applied one level up. And it's where explicit Deny earns its keep:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyRegionsOutsideApproved",
      "Effect": "Deny",
      "NotAction": [
        "iam:*", "sts:*", "cloudfront:*", "route53:*",
        "support:*", "organizations:*", "budgets:*"
      ],
      "Resource": "*",
      "Condition": {
        "StringNotEquals": {
          "aws:RequestedRegion": ["us-east-1", "eu-west-1"]
        }
      }
    }
  ]
}
```

That denies operations outside two Regions — while exempting the global services whose control planes live in us-east-1 (Volume 1), because forgetting that exemption breaks IAM for the whole account. It's a small policy that eliminates an entire class of problem: resources created in a Region nobody monitors, by someone who left the console's Region selector on a default.

**Common SCP guardrails:**

- Deny leaving the organization or disabling CloudTrail, Config, or GuardDuty
- Deny deleting or modifying specific security roles
- Deny disabling S3 Block Public Access (Volume 5)
- Restrict which Regions can be used
- Require IMDSv2 on instance launch (Volume 2)

**Two things to know:** SCPs do **not** apply to the management account — so don't run workloads there. And an SCP that's too strict breaks things in ways that are hard to diagnose, because the error is an ordinary `AccessDenied` with no hint that an SCP caused it. Test in a non-production OU first.

**AWS Control Tower** automates the setup: a landing zone with a log archive account, an audit account, baseline SCPs, and an Account Factory for provisioning new accounts consistently.

---

