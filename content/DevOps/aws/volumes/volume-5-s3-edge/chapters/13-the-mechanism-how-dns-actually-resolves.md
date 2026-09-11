## THE MECHANISM: How DNS Actually Resolves

Worth knowing properly, because the 2018 incident exploits exactly this.

When your machine needs `www.example.com`:

1. **Check local caches** — OS cache, browser cache
2. **Ask a recursive resolver** (your ISP's, or a public one). It does the work:
3. **Ask a root server**: "who handles `.com`?" → a referral to the `.com` TLD servers
4. **Ask a `.com` server**: "who handles `example.com`?" → a referral to that domain's authoritative nameservers
5. **Ask the authoritative server**: "what's the address for `www.example.com`?" → the answer
6. **Cache it** for the TTL and return it

Note what's *not* in that list. Classic DNS has **no authentication**. The resolver trusts whichever server answers at the expected address. DNSSEC exists to add cryptographic signing and is still far from universal.

And crucially: step 3 through 5 all depend on the resolver's packets actually reaching the servers they're addressed to. That's a **routing** guarantee, not a DNS one. Remember this.

### Route 53

AWS's DNS service, launched December 2010. The "53" is port 53, DNS's port.

**Record types** you'll use: `A` (IPv4), `AAAA` (IPv6), `CNAME` (alias to another name), `MX` (mail), `TXT` (verification, SPF), `NS` (delegation), `SOA` (zone metadata).

**Alias records** are AWS-specific and genuinely useful. A `CNAME` cannot exist at a zone apex — `example.com` itself — because the DNS standard forbids a CNAME coexisting with other records, and the apex must have `SOA` and `NS` records. This is why so many sites historically forced you to `www`.

An alias record solves it. It looks like an `A` record to the outside world but points internally at an AWS resource — a CloudFront distribution, an ALB, an S3 website endpoint. Route 53 resolves the target's current address at query time. It also **costs nothing to query**, while standard records are billed per query.

**Routing policies** are where Route 53 becomes more than a lookup table:

| Policy | Behavior |
|---|---|
| **Simple** | One answer |
| **Weighted** | Split traffic by percentage — canary deploys, A/B |
| **Latency-based** | Send each client to the Region with lowest latency *for them* |
| **Failover** | Primary, with a secondary when a health check fails |
| **Geolocation** | Route by the client's country — compliance, localization |
| **Geoproximity** | Route by geographic distance with an adjustable bias |
| **Multivalue answer** | Up to eight healthy records, with health checking |

**Health checks** monitor endpoints and remove unhealthy records from answers. This is DNS-level failover, and its limitation is inherent: **DNS is cached**. A client that resolved thirty seconds ago keeps using the old answer until its TTL expires. Low TTLs help and cost more queries. DNS failover is a minutes-scale tool, not a seconds-scale one — which is why load balancer health checks (Volume 4) and DNS health checks solve different problems.

**One notable thing:** Route 53's data plane carries an unusually strong availability commitment — AWS offers a 100% availability SLA for it. Volume 1's control plane / data plane split again: the query-answering path is engineered to a far higher standard than the record-changing path.

---

