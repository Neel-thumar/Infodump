## THE MECHANISM: The Three Permission Systems

Here's the part that explains the epidemic.

At various points in its history, S3 has had **three overlapping ways** to control access to an object:

### 1. IAM policies (Volume 2)

Identity-based. "This role may read from this bucket." Evaluated by the engine from Volume 2.

### 2. Bucket policies

Resource-based, attached to the bucket, with a `Principal` field. This is what makes cross-account access and public access possible:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": "*",
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::my-bucket/*"
  }]
}
```

`"Principal": "*"` means the entire internet. That statement is the whole breach, in five lines.

### 3. ACLs — the legacy system

S3's **original** permission mechanism, predating IAM. A per-object and per-bucket list of grants, in a different format, with different semantics.

And two ACL grantee groups that caused enormous damage:

- **`AllUsers`** — literally anyone on the internet
- **`AuthenticatedUsers`** — and here's the vicious one: **any user with any AWS account.** Not your account. *Any* AWS account. Anyone who can sign up for the free tier.

Enormous numbers of people read "Authenticated Users" and reasonably assumed it meant *their* users. It meant everyone on earth willing to enter a credit card.

### Why three systems is the actual problem

The three interact. A bucket policy can deny while an ACL allows. An object can have a different ACL from its bucket. An object uploaded by another account could be owned by that account and carry ACLs you didn't write.

The result: **a bucket's true public-accessibility was genuinely hard to determine.** Not "people were careless." The question "is this data public?" required reasoning across three systems with different models, and the console's answer wasn't always obvious.

---

