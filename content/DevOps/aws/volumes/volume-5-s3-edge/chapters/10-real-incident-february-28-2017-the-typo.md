## REAL INCIDENT: February 28, 2017 — The Typo

### What happened

At approximately 9:37 AM Pacific on Tuesday February 28, 2017, an authorized S3 engineer was working an established runbook. The S3 billing system was running slow, and the playbook called for removing a small number of servers from a subsystem used by the billing process.

**A parameter was entered incorrectly.** The command removed a substantially larger set of servers than intended.

The servers that got removed weren't only the billing subsystem's. They supported two other S3 subsystems in `us-east-1`:

**The index subsystem** — which holds metadata and location information for **every S3 object in the Region**. Without it, S3 cannot answer GET, LIST, PUT, or DELETE. It doesn't know where anything is.

**The placement subsystem** — which allocates storage for new objects, and which depends on the index subsystem.

Enough capacity was removed that both required a **full restart**.

### Why it took hours instead of minutes

AWS's post-event summary contains the detail that makes this a genuine engineering lesson rather than a story about typing.

**These subsystems had not been fully restarted for many years.**

S3 had grown enormously in that time. The restart process involved safety checks validating the integrity of metadata across the entire Region's object inventory — and at the scale S3 had reached, that took far longer than anyone expected. Nobody had measured it, because nobody had done it.

The index subsystem came back around 1:18 PM Pacific. Placement followed. Full normal operation returned in the afternoon.

### The blast radius

`us-east-1` is the gravity well from Volume 1. S3 was down there, so: Slack, Trello, Quora, Medium, IFTTT, Docker Hub, Giphy, parts of Adobe's services, and a very long tail of others. Many sites that weren't hosted on S3 still broke, because their static assets, images, or JavaScript bundles were.

**And the AWS Service Health Dashboard couldn't be updated** — because the dashboard's own administration console depended on S3 in `us-east-1`. For a while, AWS's only channel for telling customers what was happening was Twitter.

### Four lessons

**1. Blast radius is a design parameter.** The tool could remove an arbitrary amount of capacity in one call. AWS's remediation changed it to remove capacity more slowly and to refuse to take a subsystem below a minimum safe capacity level. That's not a fix for the typo — it's a fix for *the tool's ability to cause this class of harm at all*. Any operational tool you build should be audited the same way: what's the worst single invocation?

**2. Untested recovery paths are not recovery paths.** Something that hasn't been exercised in years has unknown duration and unknown failure modes. This is why Volume 8 argues for game days. If you have never restored from your backups, you do not know whether you can.

**3. Your status page must not depend on your product.** The dashboard failure is almost comic, but it generalizes hard. Where do your alerts go? Where does your runbook live? Where does your team coordinate? If any answer sits inside the blast radius, you lose that capability precisely when you need it. Same lesson as December 2021, four years earlier.

**4. Cellularization.** AWS's remediation included partitioning the index subsystem into smaller **cells**, so that a failure affects one cell rather than the entire Region. This is now a core AWS architectural pattern and a good idea in your own systems: make the unit of failure smaller than the unit of service.

*Accuracy note: AWS published a detailed post-event summary. The 9:37 AM start and the roughly 1:18 PM index recovery come from that document; I'd treat my other timings as approximate and read the original if precision matters.*

---

