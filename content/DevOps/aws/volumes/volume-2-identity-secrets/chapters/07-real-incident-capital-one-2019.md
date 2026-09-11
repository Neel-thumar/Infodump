## REAL INCIDENT: Capital One, 2019

### What happened

In roughly March 2019, an individual named Paige Thompson — a former employee of a cloud provider, though not working there at the time — obtained data on approximately **100 million Capital One customers in the United States and around 6 million in Canada**. Credit card applications, names, addresses, dates of birth, income, and a smaller number of Social Security and bank account numbers.

The breach wasn't discovered until July 2019, when an outside researcher emailed Capital One's responsible-disclosure address about data posted publicly online.

### The attack chain

The technical path is worth walking step by step, because each link is a lesson.

**Link 1 — a misconfigured web application firewall.** Capital One ran a WAF (reported to be ModSecurity) on EC2. It was configured in a way that allowed an attacker to make it issue arbitrary outbound requests on their behalf. This class of bug is **server-side request forgery (SSRF)**: you can't reach an internal system directly, but you can trick a server that *can* reach it into fetching things for you.

**Link 2 — SSRF to the metadata service.** The attacker pointed the SSRF at `169.254.169.254`. From the WAF host's point of view, this was a perfectly ordinary local request. IMDS answered.

**Link 3 — credentials for free.** IMDS handed back temporary credentials for the role attached to that instance.

**Link 4 — over-permissioned role.** That role could list and read a large number of S3 buckets — far more than a WAF has any business touching.

**Link 5 — exfiltration.** With valid AWS credentials, the rest was just using S3 normally.

### Four separate failures, any one of which would have stopped it

This is the part I want you to sit with. It wasn't one mistake.

1. **The SSRF vulnerability** — an application bug
2. **IMDSv1's design** — a plain unauthenticated GET to a well-known address returned credentials
3. **Excessive role permissions** — the classic violation of least privilege
4. **No detection** — months of unusual S3 access from a WAF instance went unnoticed

Defense in depth isn't a slogan. It's the observation that attacks are chains, and chains break at any link.

### What AWS built afterward: IMDSv2

In November 2019, AWS released a second version of the metadata service. The change is small and clever.

**IMDSv1** — one request:

```bash
curl http://169.254.169.254/latest/meta-data/iam/security-credentials/
```

**IMDSv2** — two requests, where the first must be a `PUT`:

```bash
TOKEN=$(curl -X PUT "http://169.254.169.254/latest/api/token" \
  -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")

curl -H "X-aws-ec2-metadata-token: $TOKEN" \
  http://169.254.169.254/latest/meta-data/iam/security-credentials/
```

Why does that help? Because the things that produce SSRF — a URL field, an image fetcher, a misconfigured proxy — overwhelmingly issue **GET** requests and cannot set **custom headers**. Requiring a PUT plus a custom header doesn't make the endpoint more secret; it makes it unreachable by the specific class of confused-deputy bug that was used against it.

There's a second control: **the hop limit.** IMDSv2 responses carry a TTL that defaults to 1, meaning the response won't survive a network hop. A container on a default bridge network, or a forwarding proxy, can't relay it outward.

### Where this stands now

AWS has progressively pushed toward IMDSv2 as the default for new launches. You can enforce it yourself — per instance, or account-wide via a setting, or organization-wide via an SCP that denies launches with IMDSv1 enabled.

**Check your own instances.** If you inherit an AWS environment, this is a reasonable first audit.

*Accuracy note: Thompson was charged in 2019 and convicted in 2022; Capital One paid regulatory penalties and settled civil litigation. I'm giving the technical chain as described in the indictment and subsequent public analysis. Some operational specifics were never publicly confirmed in detail, and I'd rather say so than invent them.*

---

