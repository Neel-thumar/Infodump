## Where We Go Next

**Volume 5 — S3 and the Edge: Object Storage, CloudFront, Route 53.**

The service that shipped before EC2, and the two that put it in front of the whole planet. We'll cover why S3 has no folders (and why that's not pedantry), the 2020 shift from eventual to strong consistency and what it silently fixed, storage classes and lifecycle policies, and the three overlapping permission systems on a bucket — policies, ACLs, and Block Public Access — which is why so many buckets ended up open.

Then DNS from first principles, Route 53 routing policies and health checks, alias records, CloudFront cache behaviors, and where TLS terminates.

Three incidents: **February 28, 2017**, when a typo in one command's parameters removed more S3 capacity than intended and took down a large slice of the internet — including AWS's own status dashboard, which was hosted on S3. The **2017 open-bucket epidemic**. And the **April 2018 BGP hijack** that poisoned DNS answers and drained cryptocurrency wallets.

---

*Volume 4 complete. Say **continue** when you're ready for Volume 5.*
