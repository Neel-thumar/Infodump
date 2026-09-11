## Where AWS Actually Sits

### The market position

AWS remains the largest cloud infrastructure provider by revenue and market share, with Microsoft Azure second and Google Cloud third. The commonly cited figures put AWS somewhere around 30% of the global infrastructure market, Azure in the low-to-mid twenties, and Google Cloud around 11–12%.

**Treat those numbers as directional.** They come from analyst firms with differing methodologies, they move each quarter, and Azure has been gaining share for several years running. If a precise figure matters to you, go to a current source.

The more durable observations:

**AWS is no longer the default choice by a wide margin.** For much of the 2010s, "cloud" effectively meant AWS. That's no longer true. Azure wins a great deal of enterprise business through existing Microsoft relationships — if an organization already runs Active Directory, Office, and enterprise agreements with Microsoft, Azure arrives pre-negotiated. Google Cloud is genuinely strong in data analytics, machine learning, and Kubernetes, which is unsurprising given it originated Kubernetes.

**AWS's advantage is breadth and maturity.** It has the most services, the longest operational track record, the deepest documentation, and — relevant to this guide — the most public postmortems. That last one is an underrated asset for anyone trying to learn how large systems actually fail.

**AWS is enormously profitable**, and has for years generated a disproportionate share of Amazon's operating income relative to its share of revenue. The retail business is large and thin; the cloud business is smaller and fat. That's the quiet reason the 2003 memo mattered.

### The axis everything currently turns on

The dominant competitive question in cloud right now is **AI infrastructure**, and it has reshaped priorities across all three major providers.

What this looks like at AWS: **Bedrock** for accessing foundation models, **SageMaker** for the full ML lifecycle, and — most strategically — **custom silicon**. Trainium for training and Inferentia for inference are Annapurna Labs outputs, the same acquisition that produced Nitro and Graviton (Volume 4). The logic is identical: the largest input cost is hardware bought from someone else, so design your own.

Amazon has also made substantial investments in Anthropic, and the two companies have a significant infrastructure partnership.

**The honest caveat:** this area moves faster than any other part of the cloud market. Model availability, pricing, chip generations, and partnership structures change on a timescale of months. Anything specific I say here is likely already stale. Go and look.

### Three currents worth understanding

**Repatriation is real but overstated.** Some companies have moved workloads off cloud and back to owned hardware — 37signals has been the loudest public example, publishing detailed cost comparisons.

The honest read: repatriation makes economic sense for **steady, predictable, high-utilization workloads** where cloud's elasticity premium buys you nothing. It makes much less sense for spiky workloads, for small teams without infrastructure staff, or where you'd be rebuilding managed services by hand.

It's a real phenomenon and a minority one. The useful lesson isn't "cloud is a scam"; it's that **cloud economics are workload-dependent**, and "everything in cloud" is as unexamined a default as "everything in a data center" was in 2005.

**Egress fees became a political question.** Volume 9 noted that inbound data transfer is free and outbound costs money. Critics have long argued that this is deliberate lock-in.

That argument gained regulatory force. The EU Data Act includes provisions on cloud switching and data transfer charges, and in 2024 AWS announced free data transfer out for customers migrating away from AWS entirely. Other providers made comparable moves.

**This is live and evolving** — the regulatory picture, particularly in Europe, has been changing and may have changed since my information ends. Check current terms.

**Multi-cloud is mostly aspirational.** Many organizations say they're multi-cloud. Far fewer run the same workload across providers in a way that would survive one going down.

What's usually actually happening: different teams or acquisitions on different clouds, or one cloud for infrastructure and another for a specific service. That's *multiple clouds*, not *multi-cloud*, and the difference matters. True portability means using the lowest common denominator of every provider, which means giving up the managed services that made cloud worth using.

Volume 8's warning applies: complexity you don't exercise is a liability, not insurance.

---

