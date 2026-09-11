## REAL INCIDENT: The Bill for an Empty Bucket

### What happened

In April 2024, a developer named Maciej Pocwierz published an account of something genuinely strange.

He created a single empty S3 bucket for a proof of concept. Uploaded nothing. Within a day, his bill showed charges of roughly **1,300 US dollars**.

The cause: the bucket had received on the order of **100 million PUT requests** — from strangers.

An open-source tool had shipped with a configuration where the bucket name defaulted to a placeholder resembling the one he'd chosen. Every installation of that tool, worldwide, was attempting to write backup data to that bucket name. All of those requests failed with access denied.

**And at the time, AWS charged for them anyway.** Unauthorized requests — requests from accounts with no permission at all, returning HTTP 403 — were billed to the bucket owner.

The implication people immediately drew was uncomfortable: if you knew someone's bucket name, you could generate cost for them by sending requests you knew would be rejected. Not an attack requiring any access. Just volume.

### How AWS responded

To their credit, quickly. In May 2024 AWS announced a billing change: **unauthorized requests from accounts that don't own the bucket are no longer charged to the bucket owner.** The loophole was closed.

*Accuracy note: I'm confident about the shape and timing of this — the blog post and AWS's subsequent policy change were both widely covered. Treat my specific figures as close-but-approximate rather than exact.*

### What it teaches

**Cost is an attack surface.** Most security thinking is about confidentiality, integrity, and availability. There's a fourth axis: an attacker who can make you *spend money* has caused harm without accessing anything. Denial of wallet is a real category.

**Request charges are invisible until they aren't.** He stored zero bytes. The entire bill was requests against a resource containing nothing. If your cost model is "storage plus compute," you cannot predict this.

**Global namespaces have consequences.** Volume 5 noted that S3 bucket names are globally unique across every AWS account. That design decision is exactly why a third party's default configuration could target *his* bucket. Predictable bucket names are a mild liability; add a random suffix.

**Set budget alarms at low thresholds.** He found out because of a bill, and that's the slow path. A 10 USD budget alarm — Volume 1, step 4 — would have caught it within hours. Cost Anomaly Detection would have too.

### The wider genre

This one is documented and unusual. The common versions are duller and far more frequent:

- The forgotten NAT Gateway in a Region nobody uses, at $32/month, for three years
- The recursive Lambda from Volume 7
- The GPU instance spun up for one experiment and never terminated
- Snapshots accumulating with no lifecycle policy
- CloudWatch Logs with no retention (Volume 8)
- The dev environment nobody turns off at night or at weekends

**The pattern is always the same: there is no symptom.** Nothing breaks. Nothing slows down. Which is why cost management has to be a *scheduled activity* rather than a reactive one. Put a monthly review in the calendar.

---

