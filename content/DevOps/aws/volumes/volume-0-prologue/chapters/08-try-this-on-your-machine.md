## TRY THIS ON YOUR MACHINE

These five need **no AWS account** and cost nothing. They're all read-only lookups against public endpoints. You need a terminal with `curl` and `dig` (on most Linux and macOS systems both are present; on Debian/Ubuntu, `dig` comes from `sudo apt install dnsutils`).

### 1. Watch AWS tell you the truth in an error message

```bash
curl -i https://s3.amazonaws.com/
```

**What to expect:** an HTTP error response with an XML body, plus response headers including `x-amz-request-id` and `x-amz-id-2`.

**Why it's interesting:** you just made an unauthenticated call to the same API the console uses. The refusal is proof of the model — every S3 operation is an HTTP request, and the identifiers in those headers are exactly what AWS support asks for when you file a ticket about a failed request. There's no magic layer; there's just this.

**Cleanup:** none.

### 2. Download the map of AWS's entire public network

```bash
curl -s https://ip-ranges.amazonaws.com/ip-ranges.json -o /tmp/aws-ip-ranges.json
wc -c /tmp/aws-ip-ranges.json
grep -o '"region": "[^"]*"' /tmp/aws-ip-ranges.json | sort -u | head -40
```

**What to expect:** a JSON file of a few megabytes, then a list of region codes — `us-east-1`, `eu-west-1`, `ap-southeast-2`, and dozens more.

**Why it's interesting:** AWS publishes every IP range it owns, tagged by region and by service. This file is how firewalls the world over are configured. It's also your first encounter with region codes as the organizing coordinate of everything in AWS — and if you count them, you get a rough sense of the physical footprint behind the abstraction.

**Cleanup:**
```bash
rm /tmp/aws-ip-ranges.json
```

### 3. Find the services hiding inside that file

```bash
grep -o '"service": "[^"]*"' /tmp/aws-ip-ranges.json | sort | uniq -c | sort -rn | head -20
```

*(Run exercise 2 first.)*

**What to expect:** a count of IP prefixes per service — `AMAZON`, `EC2`, `S3`, `CLOUDFRONT`, `ROUTE53_HEALTHCHECKS`, and others.

**Why it's interesting:** the relative counts are a rough proxy for architectural weight. `CLOUDFRONT` having its own enormous allocation separate from `EC2` is your first hint that edge infrastructure is a physically different thing from compute — the subject of Volume 5.

**Cleanup:** none beyond exercise 2's.

### 4. Trace a Route 53 answer back to its source

```bash
dig +trace amazon.com
```

**What to expect:** a multi-stage walk down the DNS hierarchy — root servers, then `.com` servers, then the authoritative nameservers for the domain.

**Why it's interesting:** you're watching the delegation chain that the April 2018 BGP hijack exploited. Attackers didn't break DNS cryptography; they convinced the internet's routing layer to send queries somewhere else. Seeing the hops makes the attack surface visible in a way no diagram does.

**Cleanup:** none.

### 5. Measure the edge

```bash
curl -s -o /dev/null -w "connect: %{time_connect}s  total: %{time_total}s\n" https://aws.amazon.com/
curl -s -o /dev/null -w "connect: %{time_connect}s  total: %{time_total}s\n" https://s3.us-east-1.amazonaws.com/
curl -s -o /dev/null -w "connect: %{time_connect}s  total: %{time_total}s\n" https://s3.ap-southeast-2.amazonaws.com/
```

**What to expect:** the first is usually fast from almost anywhere on earth. The other two will differ from each other — sometimes dramatically — depending on where you physically are.

**Why it's interesting:** the first URL is served from a CDN edge location near you; the other two are regional API endpoints in Virginia and Sydney respectively. You are directly measuring the difference between "AWS has a cache near you" and "your packet crossed an ocean." That gap is the entire economic argument for CloudFront, and it's also why choosing a region isn't a cosmetic decision.

**Cleanup:** none.

---

