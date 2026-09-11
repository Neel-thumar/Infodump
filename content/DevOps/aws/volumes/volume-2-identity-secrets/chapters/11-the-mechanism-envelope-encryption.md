## THE MECHANISM: Envelope Encryption

The solution is an indirection, and it's the whole idea behind KMS.

### The flow

**To encrypt:**

1. Ask KMS for a **data key**. KMS generates a fresh symmetric key and returns it **twice**: once in plaintext, once encrypted under your KMS key.
2. Encrypt your data locally with the plaintext data key.
3. **Throw away the plaintext data key.** Wipe it from memory.
4. Store the encrypted data key alongside the ciphertext.

**To decrypt:**

1. Read the encrypted data key from next to the ciphertext.
2. Send it to KMS and ask for decryption. KMS checks whether you're permitted, and if so returns the plaintext data key.
3. Decrypt your data locally.
4. Discard the plaintext data key again.

### Why every piece of that matters

**Your data never goes to KMS.** Only small keys travel. This means KMS doesn't need petabyte-scale bandwidth, and it means a multi-gigabyte file encrypts at local disk speed, not network speed.

**The KMS key never leaves the HSMs.** The root key material is generated in and confined to hardware security modules. You cannot export it. AWS operators cannot export it. This is uncomfortable in one direction — you're trusting AWS's implementation — and reassuring in the other.

**Access control becomes an API call.** Since decryption requires calling KMS, *every* decryption is an authorization decision and a logged event. Revoking access to an exabyte of encrypted data is a policy edit, not a re-encryption project.

**Rotation becomes tractable.** Use a fresh data key per object. Rotating the KMS key doesn't require touching any of the data — the old backing key is retained so old data keys still decrypt.

**And the failure mode is honest.** Lose access to the KMS key and the data is gone. Not "hard to recover." Gone. This is why KMS key deletion has a mandatory waiting period of 7 to 30 days and shouts at you the whole time.

### Key types

- **Customer managed keys** — you create them, you control the policy, you can schedule deletion. Roughly **1 USD per month each**, plus a small per-request charge.
- **AWS managed keys** — created automatically per service (`aws/s3`, `aws/rds`), free, but you can't edit their policies.
- **AWS owned keys** — shared across customers, invisible to you, free.
- **Symmetric vs. asymmetric** — symmetric AES-256 covers the vast majority of use. Asymmetric exists for signing and for cases where a party can only encrypt.

### The rule that catches everyone: key policies are mandatory

Here's where Part One and Part Two fuse.

For most AWS resources, an IAM policy granting access is sufficient. **KMS is different.** Every KMS key has a **key policy**, a resource-based policy, and it is the primary authority. IAM policies alone do not grant access to a KMS key unless the key policy explicitly delegates to IAM.

The standard delegation clause looks like this:

```json
{
  "Sid": "EnableIAMPolicies",
  "Effect": "Allow",
  "Principal": { "AWS": "arn:aws:iam::123456789012:root" },
  "Action": "kms:*",
  "Resource": "*"
}
```

That statement is what makes normal IAM policies work for the key. Remove it and only principals named directly in the key policy get in.

This catches people constantly. An administrator with `AdministratorAccess` gets `AccessDeniedException` on a KMS key, stares at their obviously-sufficient IAM policy, and loses an afternoon. Recall the evaluation algorithm: the resource-based policy is consulted, and for KMS it's not optional.

**The genuinely dangerous version:** a key policy that names a single principal and that principal gets deleted. Now nobody can administer the key — including AWS. Recovering from this requires AWS Support. Never write a key policy without a viable administrator path.

### Grants

A **grant** is a lighter-weight, temporary permission on a KMS key, used heavily by AWS services internally. When EBS encrypts a volume for you, it's operating under a grant rather than a policy edit. You'll mostly encounter them when reading CloudTrail and wondering where a permission came from.

---

