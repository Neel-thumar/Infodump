## THE MECHANISM: Commitment Models

You can pay substantially less than On-Demand by committing. The models differ in what you commit *to*, and that's the whole decision.

### On-Demand

No commitment, highest rate. Correct for unpredictable workloads, short experiments, and anything you might turn off.

### Savings Plans (2019)

**You commit to a dollar amount per hour for 1 or 3 years.** Not to an instance type. Not to a Region necessarily. To spend.

Two relevant kinds:

**Compute Savings Plans** — the flexible one. Applies to EC2, Fargate, **and Lambda**, across any Region, any instance family, any OS, any tenancy. Discounts up to roughly 66%.

**EC2 Instance Savings Plans** — locked to an instance family in a Region, but you can change size, OS, and tenancy within that. Discounts up to roughly 72%.

**Payment options:** No Upfront, Partial Upfront, All Upfront — more upfront means a better rate.

### Reserved Instances

The older model. You commit to a specific instance configuration.

- **Standard RIs** — deepest discount (up to ~72%), least flexible, can't change family
- **Convertible RIs** — up to ~54%, exchangeable for different configurations
- **Regional vs Zonal** — a zonal RI also gives you a **capacity reservation** in that specific AZ, which is the one thing Savings Plans don't provide

**The practical guidance today:** for EC2, Fargate, and Lambda, **Savings Plans are generally the better instrument** — comparable discount, far more flexibility, less administrative work.

**But RIs are still required elsewhere.** RDS, ElastiCache, Redshift, and OpenSearch have their own reserved-node models and are **not covered by Savings Plans**. A team that buys a Compute Savings Plan and assumes their database is covered has a surprise coming.

### Spot — up to 90% off, with a catch

Spot instances use AWS's spare capacity at a steep discount. AWS can reclaim them at any time, **with a two-minute warning**.

A common misconception: Spot is no longer a bidding auction. AWS moved to smoothed, predictable pricing in 2017. You don't bid; you get a price that moves gradually with supply and demand.

**Use Spot for:** batch processing, CI/CD runners, data pipelines, stateless web tiers behind a load balancer, anything that can checkpoint or be retried.

**Don't use Spot for:** databases, stateful singletons, anything where a two-minute eviction means data loss.

### The two-minute notice as a design primitive

This is the part worth internalizing, because it generalizes well beyond Spot.

Your instance receives an interruption notice via the metadata service (Volume 2 — the same `169.254.169.254`) two minutes before reclamation. A poll looks like this:

```bash
TOKEN=$(curl -sX PUT "http://169.254.169.254/latest/api/token" \
  -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")

curl -s -H "X-aws-ec2-metadata-token: $TOKEN" \
  http://169.254.169.254/latest/meta-data/spot/instance-action
```

Empty means you're fine. A JSON response with an action and a time means you have two minutes.

**Two minutes is enough to:**

- Deregister from a load balancer target group and drain connections (Volume 4)
- Finish the in-flight request and refuse new ones
- Checkpoint work in progress to S3
- Return a queue message so another worker picks it up
- Flush buffers and close cleanly

And here's the general lesson: **a system that handles Spot interruption gracefully handles almost every other kind of instance loss gracefully too.** Hardware failure, AZ event, scaling down, a deployment replacing instances — all the same shape, and Spot gives you a warning the others don't.

Building for Spot makes you resilient *and* cheaper, which is an unusually good deal. It's Volume 8's chaos engineering argument with a discount attached.

**Allocation strategies matter.** `capacity-optimized` asks AWS to draw from the deepest pools, meaning fewer interruptions than chasing the lowest price. Diversify across instance types and AZs so no single pool's exhaustion takes out your fleet.

---

