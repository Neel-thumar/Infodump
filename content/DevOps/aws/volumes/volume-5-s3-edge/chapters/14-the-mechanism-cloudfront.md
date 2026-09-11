## THE MECHANISM: CloudFront

A CDN with roughly 600 points of presence worldwide *(a number that changes constantly — verify against current sources)*. Launched November 2008.

### The pieces

**A distribution** is the configuration. It has one or more **origins** — where real content lives (an S3 bucket, an ALB, any HTTP server, including one outside AWS).

**Cache behaviors** map path patterns to settings:

```text
/api/*      -> origin: ALB,    TTL: 0,      forward all headers/cookies
/static/*   -> origin: S3,     TTL: 1 year, forward nothing
/*          -> origin: ALB,    TTL: 60s
```

**The cache key** determines what counts as "the same request." By default it's the URL path. You can add headers, query strings, and cookies — and this is where people destroy their own cache. Forward all cookies, and every user with a distinct session cookie gets a distinct cache entry. Your hit rate collapses to near zero and you've built an expensive, slow proxy.

**Rule of thumb: forward the minimum that correctness requires.**

**TTLs** come from origin `Cache-Control` headers, bounded by minimum, maximum, and default TTLs you configure.

**Invalidations** purge cached objects. The first 1,000 paths per month are free; beyond that they're charged, and they take minutes to propagate. **The better pattern is versioned filenames** — `app.a3f8c2.js` — so new content has a new URL and nothing ever needs invalidating. Invalidation is a fix for a deployment process that doesn't version its assets.

### Origin Access Control

Here's how the 2017 epidemic should have been avoided entirely.

Rather than making a bucket public so CloudFront can read it, **Origin Access Control** gives the distribution a signed identity. The bucket policy allows that specific distribution and nothing else. The bucket stays fully private; only CloudFront can read it; the public reaches CloudFront.

This is better on every axis:

- **Security** — the bucket is never public
- **Cost** — CloudFront egress is cheaper than S3 egress, and cache hits don't touch S3 at all, so you avoid request charges too
- **Performance** — content is cached near users
- **Capability** — you get TLS, WAF, geo-restriction, and signed URLs

OAC replaced the older Origin Access Identity in 2022. If you find OAI in an existing setup, it's the legacy mechanism.

**There is essentially no good reason to serve a public website directly from an S3 bucket in 2026.** Put CloudFront in front of it.

### Edge compute and the certificate trap

**CloudFront Functions** — lightweight JavaScript at the edge location, sub-millisecond, for header manipulation, URL rewrites, simple redirects.

**Lambda@Edge** — full Lambda functions at regional edge caches. More capable, more latency, more cost.

**And the trap that catches everyone:** an ACM certificate used by CloudFront **must be requested in `us-east-1`**, regardless of where anything else is. Your ALB in Frankfurt needs a certificate in `eu-central-1`. Your CloudFront distribution serving the same content needs one in `us-east-1`.

This is Volume 1's us-east-1 gravity showing up in a place you'd never predict, and it is a reliable half-hour of confusion for everyone the first time.

---

