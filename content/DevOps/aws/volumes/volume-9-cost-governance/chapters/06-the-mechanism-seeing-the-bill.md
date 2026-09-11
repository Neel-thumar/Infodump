## THE MECHANISM: Seeing the Bill

### The tools

**Cost Explorer** — the visual and API interface. Group by service, account, Region, usage type, or tag. **Note that the Cost Explorer API charges roughly $0.01 per request** — negligible for humans, meaningful for a dashboard polling every minute.

**AWS Budgets** — thresholds with alerts. You created one in Volume 1, step 4. Budgets can also trigger actions, like applying a restrictive IAM policy when a threshold is crossed.

**Cost Anomaly Detection** — machine learning over your spending patterns, alerting on unusual changes. This is the tool that catches a runaway Lambda loop (Volume 7) faster than a monthly budget will, because it's looking for *change* rather than an absolute number. Turn it on.

**Cost and Usage Report (CUR)** — the complete, line-item-level dataset delivered to S3. Every charge, every resource, hourly. This is what you query when you need real answers.

**Compute Optimizer** — recommends right-sizing based on observed utilization.

**Trusted Advisor** — checks across cost, security, and fault tolerance. The full check set requires Business support or above.

### Tagging, and the trap

Cost allocation tags let you attribute spend to teams, environments, and projects. Apply a `Team` tag, activate it in the billing console, and Cost Explorer can group by it.

**The trap: activating a cost allocation tag is not retroactive.** It applies from activation forward. Realize in November that you need per-team costs and you cannot get them for January.

**So: decide your tagging scheme early and activate the tags immediately**, even before you need them. A reasonable minimum:

```text
Environment   prod | staging | dev
Team          owning team
Project       what this belongs to
ManagedBy     terraform | cloudformation | manual
CostCenter    for finance
```

`ManagedBy` is the one people skip and shouldn't — it tells you instantly whether a resource is reproducible or was hand-made by someone who has since left.

**Tag policies** in AWS Organizations enforce consistent tag keys and values, which is what stops you ending up with `team`, `Team`, `TEAM`, and `owner` all meaning the same thing.

---

