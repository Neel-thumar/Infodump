## The Origin Story, Told Honestly

You have probably heard this version:

> Amazon had tons of spare server capacity sitting idle eleven months a year, because they had to build for the Christmas shopping peak. So they decided to rent out the excess. Genius!

It's a great story. It is also, according to the people who were actually there, **not true**.

Benjamin Black — one of the two authors of the internal document that led to AWS — has publicly said the excess-capacity explanation is a myth. Werner Vogels, Amazon's longtime CTO, has said the same thing repeatedly. The real story is less romantic and considerably more interesting to an engineer.

### The actual problem: Amazon couldn't ship software

By the early 2000s, Amazon.com had a growth problem that wasn't about servers at all. It was about *coupling*. Every new project needed infrastructure, and getting infrastructure meant negotiating with the teams who owned databases, storage, and compute. Engineering teams spent an enormous share of their time on undifferentiated plumbing — the same plumbing, over and over, slightly differently each time.

Amazon's internal response was architectural: break the monolith into services with hard API boundaries. If every team could only talk to every other team through a documented interface, teams could move independently. This is the origin of the famous (and possibly somewhat mythologized) "API mandate" attributed to Jeff Bezos.

But services need somewhere to run. And so, in **2003**, Benjamin Black and Chris Pinkham wrote a short internal paper describing what a standardized, automated, self-service infrastructure layer for Amazon would look like — compute and storage that any internal team could provision without filing a ticket with anyone.

The paper ended with a line that changed the industry. Roughly: *we could sell this as a service to external customers too.*

That was the idea. Not selling leftovers. **Building the plumbing properly for internal use, and realizing the plumbing itself was the product.**

### What shipped, and in what order

The order matters, because it's the opposite of what most people assume.

| Year | What arrived | Why it's surprising |
|---|---|---|
| 2002 | Amazon.com Web Services (product data API) | Same name, unrelated product |
| 2004 | Simple Queue Service (SQS), in beta | The first piece of infrastructure-as-a-service AWS shipped |
| March 2006 | Simple Storage Service (S3) | **Storage came before compute** |
| August 2006 | Elastic Compute Cloud (EC2), in beta | The one everyone remembers |

Storage launched first. That ordering is a clue about how AWS thinks, and we'll come back to it in Volume 5.

### What EC2 actually was on day one

It's worth being concrete about how primitive the first version was, because almost every service you'll learn in this guide exists to patch a gap that was present at launch:

- **One instance type.** The `m1.small`: roughly 1.7 GB of RAM, one "EC2 Compute Unit," and about 160 GB of local disk, for around ten cents an hour.
- **Linux only.** No Windows.
- **One location.** No concept of Regions or Availability Zones yet — those arrived later, as the failure modes became obvious.
- **No persistent storage.** If your instance stopped, your data was gone. Permanently. EBS came in 2008.
- **No load balancer.** No auto scaling. No managed database. No IAM. No VPC.

Read that list again and notice what it tells you: **AWS did not launch as a cloud platform. It launched as a rentable computer, and everything else on the list is a response to someone getting hurt.**

No persistent storage → EBS. No network isolation → VPC. No identity model → IAM. No way to survive a data center fire → Availability Zones. No way to handle traffic spikes → ELB and Auto Scaling.

That's the shape of this entire guide. Each volume takes one of those responses and asks: what exactly went wrong, what did they build, and what did it cost?

---

