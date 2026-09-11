## The incident: 17 images, 5 million pulls

Volume 1's incident was a runtime bug. This one is about trust, and it's the reason `FROM` deserves as much scrutiny as any dependency in your lockfile.

**What happened.** Beginning in mid-2017, an account on Docker Hub using the pseudonym **`docker123321`** uploaded container images advertised as tools for popular software — images named after Tomcat, MySQL, and Cron. They were also backdoored: they installed **XMRig-based Monero miners** and, in a number of cases, embedded reverse shells giving the attacker persistent access to the victim's server.

The numbers, as reported by Kromtech in June 2018: **17 malicious images**, collectively **pulled about 5 million times**, and roughly **544.74 Monero mined — around $90,000** at the exchange rate then.

**The part that should bother you is the timeline.** The account was created in May 2017 and the first malicious images appeared around July–August 2017. Users reported them on GitHub and Twitter as early as September 2017. Sysdig published on related cryptojacking in January 2018, Fortinet published in May 2018, and Docker Hub deleted the account on **10 May 2018** — roughly a week after the Fortinet report, and about eight months after the first public complaints.

> **Confidence: high** on the figures and the broad timeline — corroborated across Kromtech's report as relayed by CyberScoop, TechCrunch, The Register, and INCIBE-CERT. **Medium** on exact dates for individual complaints, which vary slightly between retellings.

**Why it was so effective.** Kromtech's own framing is the sharpest summary of the structural problem: pulling an image from Docker Hub is, for most users, equivalent to downloading an arbitrary binary from the internet, running it, and hoping. There is no build transparency by default. You cannot see the Dockerfile. You cannot see what `RUN` steps executed. The layers are opaque tarballs, and the thing you're looking at in the web UI is a description the uploader wrote.

Worse, and specific to containers: **removing the image does not remove the compromise.** The images established reverse shells and persistence on the host. Kromtech's guidance for affected users was to wipe the systems. And note the amplification mechanism — the attacks were largely automated, scanning for misconfigured Docker and Kubernetes installations with exposed APIs, which is the Volume 7 topic.

**It was not a one-off.** In 2021, Palo Alto Unit 42 researcher **Aviv Sasson** reported finding **30 malicious images across 10 accounts** on Docker Hub, with a combined **~20 million pulls** and an estimated **~$200,000** mined — mostly Monero via XMRig, with small amounts of Grin and Aronium. Sasson's stated conclusion was that many more probably remain undiscovered. **Confidence: medium-high** — widely reported from the Unit 42 research; I'd verify current figures against the original write-up before quoting them anywhere that matters.

**What to actually do about it:**

- Prefer **Docker Official Images** and **Verified Publisher** images. Not a guarantee, but a real difference in review.
- **Read `docker history`** on anything unfamiliar, and prefer images that publish their Dockerfile and build provenance.
- **Pin by digest** in production, so an image can't be swapped under a tag you trust.
- **Scan images** — `docker scout cves`, Trivy, Grype. Volume 7 covers this properly.
- Mirror critical base images into a registry you control, so a deleted or altered upstream tag can't break or compromise your builds.

The general lesson, and it's the same one the software industry keeps relearning: **`FROM someimage` is a dependency with root-equivalent privileges over your build, and it deserves the scrutiny you'd give a dependency in your lockfile.** Most teams review the latter carefully and the former not at all.

---

