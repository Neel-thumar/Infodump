## THE MECHANISM: Concurrency, and How It Becomes an Outage

### The model

Lambda scales by running more execution environments in parallel. One environment handles exactly one invocation at a time.

```text
concurrent executions ≈ invocations per second × average duration in seconds
```

100 requests/second at 200 ms each means about 20 concurrent executions.

### The limits

**Account concurrency** — a per-Region ceiling across all your functions. The default is **1,000**, raisable via a support request.

**Reserved concurrency** — set on a function, and it does **two** things simultaneously:

- It **guarantees** that function can reach that level
- It **caps** that function at that level
- And it **removes** that amount from the pool available to everything else

That combination is the trap.

**Provisioned concurrency** — pre-warmed environments, a subset of reserved.

### The outage shapes

**Shape one — one function starves the account.** A function is triggered by a large S3 batch, or a queue backs up, and scales to 1,000 concurrent executions. It has no reserved concurrency limit, so it consumes the whole account pool.

**Every other Lambda function in that Region and account now throttles.** Your authentication function. Your payment webhook handler. Your API backend. None of them are broken. None of them are under unusual load. They cannot run because a batch job ate the budget.

This is why reserved concurrency on high-volume functions is a *reliability* control, not a cost control. It's a bulkhead.

**Shape two — throttling looks different depending on invocation type.** Synchronous invocations return `429 TooManyRequestsException` immediately to the caller, who sees an error. Asynchronous invocations are retried with backoff for up to six hours — so the work isn't lost, but it arrives late and out of order, and your queue depth climbs while everything looks superficially fine.

**Shape three — downstream connection exhaustion.** Lambda scales to a thousand concurrent executions. Each opens a database connection. Your RDS instance has a `max_connections` of 100 (Volume 6). The database falls over, taking down services that never touched Lambda.

**RDS Proxy** exists precisely for this — it sits between Lambda and the database, pooling and multiplexing connections so a thousand Lambdas share a small number of real ones. If you connect Lambda to a relational database at any scale, you want it.

### The VPC problem, and its fix

Worth knowing because it explains a lot of old advice.

Before 2019, attaching a Lambda function to a VPC (Volume 3) was painful. **Each concurrent execution needed its own ENI** created and attached to your subnet. ENI creation takes on the order of ten seconds — *added to every cold start*. And a few hundred concurrent executions could exhaust the IP addresses in a `/24`.

The advice at the time was: don't put Lambda in a VPC unless you absolutely must.

In September 2019, AWS re-engineered it using its internal Hyperplane network function. Now a **small number of shared ENIs** are created once per unique subnet-plus-security-group combination, and executions are mapped through them. The cold start penalty essentially vanished, and the IP exhaustion problem with it.

**So: pre-2019 advice about avoiding Lambda in VPCs is obsolete.** You'll still find it everywhere.

---

