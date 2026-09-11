## REAL INCIDENT: April 24, 2018 — Hijacking the Map

### What happened

On April 24, 2018, for roughly two hours, users visiting **MyEtherWallet.com** — a popular Ethereum wallet interface — were served a malicious site. Those who proceeded past a browser security warning had their wallets drained. Public reporting put losses at over 150,000 USD in Ethereum.

The attackers did not compromise MyEtherWallet. They did not compromise AWS. **They attacked the layer beneath DNS.**

### The mechanism

Recall from earlier: DNS resolution assumes your packets reach the server you addressed. That assumption is guaranteed by **BGP**, the Border Gateway Protocol, which is how networks on the internet announce "traffic for these IP ranges should come to me."

BGP, historically, works on trust. You announce a prefix; other networks generally believe you.

The attackers arranged for BGP announcements claiming several IP prefixes belonging to **Amazon's Route 53 authoritative nameservers**. The announcements originated through an ISP in the United States. A significant portion of the internet's routers accepted them and began sending Route 53 DNS queries to the attackers' infrastructure instead.

Those servers answered normally for almost everything — but for `myetherwallet.com`, they returned an IP address controlled by the attackers, hosting a clone of the site.

The user typed the correct domain. Their resolver did everything correctly. The answer was wrong because the *packets went somewhere else*.

### The one thing that worked

The attackers could not obtain a valid TLS certificate for the domain. They used a self-signed one, so browsers displayed a full-page security warning.

**Some users clicked through it anyway**, and those are the users who lost money.

That's the entire defense that functioned. The certificate authority system did its job. The warning appeared. And a meaningful number of people dismissed it — which is a lesson about the limits of security controls that depend on a human decision under enthusiasm.

### Why this is in a volume about S3 and CDNs

Because it demonstrates something easy to forget while learning a cloud provider: **AWS's guarantees end at AWS's network.**

Route 53 was up. Its data plane was answering. AWS's systems behaved correctly throughout. The failure was in the routing fabric of the internet itself — infrastructure no single company controls, running a protocol designed in an era when every participant was trusted.

### What defends against it

**DNSSEC** signs DNS records cryptographically. A resolver validating DNSSEC would reject the forged answers, because the attacker couldn't sign them. Route 53 added DNSSEC signing support in 2020; adoption remains partial across the internet.

**RPKI and Route Origin Authorizations** let networks cryptographically declare which autonomous systems may announce their prefixes, so other networks can reject invalid announcements. Adoption has improved considerably since 2018 but is still incomplete.

**Certificate Transparency** logs every issued certificate publicly, so you can detect unauthorized certificates for your domains.

**Certificate pinning and HSTS** reduce the chance a user can click through the warning that saves them.

The honest summary: **the internet's routing layer is less authenticated than most people assume**, and it sits underneath every guarantee your cloud provider makes.

---

