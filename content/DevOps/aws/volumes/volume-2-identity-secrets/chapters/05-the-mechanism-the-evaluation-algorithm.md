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

