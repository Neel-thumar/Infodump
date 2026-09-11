## THE MECHANISM: There Are No Folders

Let's be concrete, because this is the fact people nod along to and then continue not believing.

You upload something to:

```text
s3://my-bucket/reports/2026/q3/summary.pdf
```

The console shows you `reports`, then `2026`, then `q3`. Feels like directories.

**None of those exist.** There is one object. Its key is the literal string `reports/2026/q3/summary.pdf`. The slashes are ordinary characters with no special meaning to the storage layer.

The console builds the illusion by calling `ListObjectsV2` with a **prefix** and a **delimiter**:

```bash
aws s3api list-objects-v2 --bucket my-bucket --prefix "reports/2026/" --delimiter "/"
```

S3 returns matching keys, plus a list of **common prefixes** — the distinct strings that appear between the prefix and the next delimiter. The console renders common prefixes as folder icons. It's a string-grouping operation presented as a directory listing.

### Why this matters practically

**You cannot rename a "folder."** There's nothing to rename. Moving `reports/2026/` to `archive/2026/` means copying every object to a new key and deleting the originals. For a million objects, that's a million copies and a million deletes. Tools like `aws s3 mv` do exactly this, and it's why they're slow on large prefixes.

**Empty folders aren't real.** When you "create a folder" in the console, it writes a zero-byte object with a key ending in `/`. Delete everything under a prefix and the prefix ceases to exist — there's no container left behind.

**Listing costs money and time at scale.** Listing is a scan over a sorted keyspace. Listing a bucket with fifty million objects is a paginated operation that will take a while and generate real request charges. Systems that list-then-process on every run get slow and expensive in ways that surprise people.

**But key naming still matters for performance.** Historically, S3 partitioned by key prefix, and the standard advice was to prepend random hashes to keys so writes spread across partitions. In 2018 AWS substantially improved this — you now get roughly 3,500 write and 5,500 read requests per second *per partitioned prefix*, and S3 partitions automatically. The random-prefix advice is obsolete. But the underlying model — that throughput scales with prefix diversity — is still why a well-distributed keyspace outperforms one where everything shares a prefix.

### Buckets

Bucket names are **globally unique across all AWS accounts on earth**. Not per-account, not per-Region. This is a consequence of the original URL scheme, where the bucket name was a subdomain of `s3.amazonaws.com`.

It's also why every short, sensible bucket name was taken in about 2009, and why you'll end up with names like `mycompany-prod-reports-use1`.

The bucket lives in a Region even though its name is global. Volume 1's inconsistency, still with us.

---

