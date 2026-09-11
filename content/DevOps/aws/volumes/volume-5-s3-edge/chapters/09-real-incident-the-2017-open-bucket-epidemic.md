## REAL INCIDENT: The 2017 Open Bucket Epidemic

2017 was the year this broke into the open, largely because researchers started systematically looking.

A partial list of what was found publicly readable in S3, reported through 2017:

- **Verizon / Nice Systems** (July) — records relating to millions of Verizon customers, exposed via a partner's bucket
- **Dow Jones** — customer records including partial payment card details
- **WWE** — several million fans' personal information
- **The US Army INSCOM "Red Disk" bucket** (November) — classified-marked material in a publicly accessible bucket
- **Accenture** — multiple buckets containing internal credentials and keys
- **Booz Allen Hamilton** — geospatial intelligence material

The recurring pattern was not incompetence at the core company. It was a **contractor, a partner, or a departing project** that spun up a bucket, made it readable for convenience, and moved on. Nobody owned it. Nothing degraded. The Volume 3 lesson again: an over-permissive setting has no symptom.

### What AWS built in response

**November 2018 — Block Public Access.** A set of four switches, available at the bucket level *and* the account level, that override everything else. Turn on account-level Block Public Access and no bucket in the account can be made public, regardless of what any bucket policy or ACL says. It's an explicit deny at a level above the permission systems — exactly the Volume 2 guardrail pattern.

**Console warnings.** AWS started marking public buckets with unmissable orange warnings in the list view.

**April 2023 — the defaults changed.** New buckets now have Block Public Access enabled and **ACLs disabled** by default. Object Ownership defaults to bucket-owner-enforced, which turns off the ACL system entirely and leaves only policies.

That last change is quietly the most important. It removed one of the three permission systems from the default path. The number of ways to accidentally be public dropped by a third.

### What to actually do

- **Turn on account-level Block Public Access.** If you genuinely need a public bucket, use CloudFront in front of a private one instead — which is both more secure and cheaper, as we'll see.
- **Leave ACLs disabled.** Use bucket policies only.
- **Never write `"Principal": "*"`** without stopping to think hard about it.
- **Use IAM Access Analyzer**, which continuously reports which buckets are accessible from outside your account.

---

