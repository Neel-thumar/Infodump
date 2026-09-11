## THE MECHANISM: Storage Classes and the Cost of Forgetting

Not all data deserves the same price.

| Class | Availability design | Retrieval | Best for |
|---|---|---|---|
| **Standard** | 99.99% | Immediate | Active data |
| **Intelligent-Tiering** | 99.9% | Immediate | Unknown/changing access patterns |
| **Standard-IA** | 99.9% | Immediate, per-GB retrieval fee | Infrequent but needs to be instant |
| **One Zone-IA** | 99.5% | Immediate | Reproducible data, **single AZ** |
| **Glacier Instant Retrieval** | 99.9% | Milliseconds | Archives you occasionally need fast |
| **Glacier Flexible Retrieval** | 99.99% | Minutes to hours | True archives |
| **Glacier Deep Archive** | 99.99% | Up to ~12 hours | Compliance retention, tape replacement |

**The traps, which are all the same trap:**

**Minimum storage durations.** Standard-IA and One Zone-IA bill a minimum of 30 days. Glacier Instant Retrieval is 90. Deep Archive is 180. Move an object to Deep Archive and delete it a week later — you pay for 180 days. A lifecycle policy that aggressively tiers short-lived objects can cost *more* than leaving them in Standard.

**Minimum billable object size.** The IA and Glacier classes bill a minimum of 128 KB per object. A bucket of a million 2 KB files costs as though they were 128 KB each. Tiering small objects is frequently a loss.

**Retrieval charges.** IA and Glacier charge per GB retrieved. Data you tiered because it was cold, then read heavily, costs more than if you'd left it hot.

**One Zone-IA is in one AZ.** The name says it. Lose that AZ and the data is genuinely gone. Only use it for things you can regenerate.

**Intelligent-Tiering is the honest default** when you don't know your access pattern. It monitors per object and moves things automatically, for a small monitoring fee per object. That per-object fee makes it a poor fit for buckets with enormous numbers of tiny objects.

### The cost leak nobody looks for

**Incomplete multipart uploads.**

Large objects upload in parts. If an upload fails partway — a network drop, a killed process, a crashed job — the parts that did arrive **stay in the bucket**, billed as storage, and **do not appear in any object listing**. They're invisible in the console. You can have terabytes of them.

Any bucket receiving large uploads should have this lifecycle rule:

```json
{
  "Rules": [{
    "ID": "abort-incomplete-multipart",
    "Status": "Enabled",
    "Filter": { "Prefix": "" },
    "AbortIncompleteMultipartUpload": { "DaysAfterInitiation": 7 }
  }]
}
```

It's one rule. It's the single most commonly missing thing in AWS cost reviews.

### Versioning

With versioning on, every PUT creates a new version and nothing is ever overwritten. A DELETE doesn't remove anything — it writes a **delete marker** that hides the object.

Two implications, one good, one expensive:

**Good:** near-complete protection from accidental deletion and from ransomware that tries to encrypt-in-place. Combined with MFA Delete and Object Lock, it's the strongest protection S3 offers.

**Expensive:** **you are billed for every version.** Delete a terabyte from a versioned bucket and your storage bill doesn't move — you added a delete marker. Buckets where versioning was enabled and lifecycle rules for noncurrent versions were not are a routine finding in cost audits.

Pair versioning with a rule that expires noncurrent versions after N days. Always.

---

