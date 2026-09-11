## THE MECHANISM: Static Stability

This is the idea that ties the whole guide together, and AWS has written about it well in their Builders' Library.

### The definition

**A statically stable system continues operating correctly during a dependency failure, because it doesn't need that dependency to maintain its current state.**

It only needs the dependency to *change* state.

### Why this is the whole game

Recall Volume 1's control plane / data plane split, and the prediction it enabled:

> Outages usually break your ability to change things, not your ability to run things.

Now combine that with the standard resilience playbook. What does most automatic recovery do?

- An instance dies → **Auto Scaling launches a replacement** (control plane)
- An AZ fails → **scale up in the remaining AZs** (control plane)
- A Region fails → **provision in another Region** (control plane)

**Every one of those depends on the control plane working.** And the control plane is precisely what tends to be impaired during a large failure.

That was December 2021 in miniature: companies whose plan was "fail over" discovered their plan required launching instances, and launching instances was the thing that had stopped working.

### The alternative

Don't recover by adding. **Pre-provision so that losing something requires no action.**

The canonical example:

**Dynamically stable (what most people build):**
```text
3 AZs × 2 instances each = 6 instances, each ~50% utilized
Lose one AZ  → 4 instances carrying the load of 6 → ~75% utilized
             → Auto Scaling launches 2 replacements
             → REQUIRES CONTROL PLANE
```

**Statically stable:**
```text
3 AZs × 3 instances each = 9 instances, each ~33% utilized
Lose one AZ  → 6 instances carrying the load of 9 → ~50% utilized
             → nothing happens, because nothing needs to
             → NO CONTROL PLANE REQUIRED
```

**The cost is 50% more instances. The benefit is that AZ failure is a non-event.**

That's the trade, stated plainly. You're pre-paying for capacity to remove a dependency on the control plane at the worst possible moment.

### Where else this applies

- **Don't scale on failure — be pre-scaled.** Run at lower utilization than feels efficient.
- **Cache credentials and configuration.** If your application fetches config from a service on every request, that service is now in your critical path. Cache it, and keep serving on the cached value if the fetch fails.
- **Fail open where it's safe.** If your authorization service is unreachable, what happens? Sometimes the safe answer is deny. Sometimes denying everything is a bigger outage than the one you're mitigating. Decide deliberately.
- **DNS with health checks over control plane failover.** Route 53's data plane (Volume 5) carries a far stronger availability commitment than most control planes.
- **Pre-provision your DR environment**, which is exactly why warm standby beats pilot light on more than just RTO.

### AWS Backup

Centralized backup across EBS, RDS, DynamoDB, EFS, S3, and more. Backup plans define what and how often; **vaults** hold the results.

The feature worth knowing: **Vault Lock**. It enforces write-once-read-many retention that **cannot be deleted or shortened, even by an account administrator, even by AWS**.

This exists because of ransomware. An attacker with admin credentials will delete your backups before encrypting your data — it's the standard playbook. Vault Lock in compliance mode makes that impossible. Combined with cross-account copies into an account with separate credentials, it's the strongest data-loss protection AWS offers.

---

