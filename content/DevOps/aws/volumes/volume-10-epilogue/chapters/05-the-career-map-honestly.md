## The Career Map, Honestly

### The roles that exist

| Role | What it actually is |
|---|---|
| **Cloud / DevOps Engineer** | The broad entry point. Build and run infrastructure, CI/CD, automation. |
| **Site Reliability Engineer** | Reliability as an engineering discipline. SLOs, on-call, incident response. Usually requires stronger software skills. |
| **Platform Engineer** | Build the internal platform other engineers deploy on. Currently in high demand. |
| **Cloud Architect** | Design systems and make trade-offs. Usually requires having been one of the above first. |
| **Cloud Security Engineer** | IAM, detection, compliance, incident response. Persistent shortage. |
| **Data Engineer** | Pipelines, warehouses, streaming. Overlaps heavily with cloud. |
| **FinOps Practitioner** | Cloud cost as a discipline. Small field, growing. |
| **Solutions Architect (vendor)** | Pre-sales and customer architecture at AWS or a partner. Customer-facing. |

### On certifications — the honest version

The AWS certification ladder: **Cloud Practitioner** (foundational), three **Associates** (Solutions Architect, Developer, SysOps), two **Professionals** (Solutions Architect, DevOps Engineer), and several **Specialties** (Security, Advanced Networking, Machine Learning, Data).

**What certifications actually do:** get you past automated screening and recruiters. That's the function. In a stack of 300 applications, "AWS Solutions Architect Associate" is a filter a non-technical screener can apply.

**What they don't do:** get you the job. No hiring manager has ever been persuaded by a certification in an interview. They'll ask you to debug something.

**My honest guidance:**

- **Cloud Practitioner** — skip it if you've worked through this guide. You're past it.
- **Solutions Architect Associate** — worth it if you're trying to break in or change roles, purely for the screening filter. It's a breadth exam and it will teach you services this guide didn't cover.
- **Professional and Specialty certs** — these signal something real, because they're hard and hard to fake. Worth it once you're already working in the field and want to specialize.
- **Don't collect them.** Someone with six certifications and no projects reads as someone who studies rather than builds. It's a real pattern and interviewers notice it.

**What actually gets you hired**, roughly in order:

1. **Evidence you've built something real.** A GitHub repository with working Terraform or CDK, a small system deployed end to end, a documented architecture with the trade-offs stated.
2. **Evidence you've debugged something real.** A story about a failure, what you thought it was, what it actually was, and how you found out. This is the single most predictive interview signal there is.
3. **Reasoning about cost and trade-offs.** Very few candidates can explain why cross-AZ traffic costs money or when Multi-AZ is the wrong answer. Doing so marks you out immediately.
4. **Fundamentals under the cloud.** Linux, networking, HTTP, how a database works. Cloud services are wrappers around these, and people who only know the wrappers hit a ceiling fast.
5. **Certifications**, as a filter, not a qualification.

### A realistic note on compensation

Cloud and infrastructure roles pay well relative to general software engineering in most markets, and security and SRE specializations tend to pay above the general infrastructure band.

**I'm not going to give you numbers.** They vary enormously by country, city, company size, and year, and any figure I quoted would be both stale and misleading for most readers. Use levels.fyi, local salary surveys, and — most usefully — talk to people doing the job where you live.

### On AI and this career

You should have an honest view of this, so here it is.

AI tooling is genuinely good at generating infrastructure code, explaining error messages, writing policies, and summarizing documentation. That work is getting faster and easier. If your value proposition was "I can write Terraform," that proposition is weakening.

What it's much less good at, currently: **deciding what to build, reasoning about failure modes nobody has written down, debugging a novel problem in a live system under time pressure, and making trade-offs where the correct answer depends on context that isn't in any document.**

Which is, not coincidentally, most of what this guide has been about. The pattern-matchable layer is commoditizing. The judgment layer is not, yet.

The pragmatic response is to use the tools aggressively and to invest in the layer they don't reach. That's also just good advice for being good at this.

---

