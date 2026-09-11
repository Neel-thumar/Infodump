## THE MECHANISM, PART 1: How a Request Gets Signed

The signing scheme is called **Signature Version 4**, universally shortened to SigV4. It's worth understanding in outline, because once you've seen it, several otherwise-baffling AWS behaviors become obvious.

### The steps

**1. Build a canonical request.** The client takes the HTTP method, the URI path, the query string, the headers it intends to sign, and a hash of the body, and assembles them into a strictly-defined normalized string. "Canonical" means every client must produce byte-identical output for the same logical request — same sort order, same encoding, same whitespace handling.

**2. Build a string to sign.** A hash of that canonical request, combined with a timestamp and a **credential scope**. The scope is where this gets interesting. It looks like:

```text
20260911/us-east-1/ec2/aws4_request
```

Date, region, service, terminator.

**3. Derive a signing key.** Here's the clever bit. The client does *not* sign with your secret access key. It runs a chain of HMAC operations:

```text
kDate    = HMAC("AWS4" + secretAccessKey, date)
kRegion  = HMAC(kDate, region)
kService = HMAC(kRegion, service)
kSigning = HMAC(kService, "aws4_request")
```

**4. Sign.** HMAC the string-to-sign with `kSigning`. Attach the result, plus your access key ID and the scope, in an `Authorization` header.

### Why the derived key design matters

Look again at that HMAC chain. The date, the region, and the service name are baked *into the key itself*.

This means a signed request for S3 in `eu-west-1` is cryptographically useless against EC2 in `us-east-1`. Not "rejected by a policy check" — mathematically unable to produce a valid signature. The scope isn't a claim the server has to verify; it's a property of the key.

It also means signatures expire. The date is in the chain, and AWS additionally rejects requests whose timestamp is too far from its own clock — typically a skew window of a few minutes.

Which produces one of the great AWS debugging experiences: **your requests suddenly all fail with signature errors, and the cause is that your machine's clock is wrong.** If you ever see `SignatureDoesNotMatch` or `RequestTimeTooSkewed` and your credentials are definitely fine, check `date`.

### What this buys you conceptually

Once you internalize "everything is a signed HTTP request," a lot of things unify:

- The console, the CLI, boto3, the Java SDK, Terraform, and your application code are all doing the same thing.
- Anything you can do in the console, you can automate — because the console has no private API.
- A presigned S3 URL (Volume 5) stops being magic: it's a signature moved from a header into the query string, with an expiry.
- IAM policies (Volume 2) make sense as the layer that runs *after* the signature verifies identity and decides what that identity may do.

---

