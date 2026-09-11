## The Question This Volume Answers

Everything so far has been about provisioning: instances, volumes, load balancers, database instances. You decide how much, you pay for it, it sits there.

**Now: what if you didn't have to decide?**

Upload some code. It runs when something happens. You pay for the milliseconds it ran and nothing else. At three in the morning, when nobody is using your application, you pay zero.

That proposition — Lambda's, announced at re:Invent in November 2014 — required AWS to solve a problem that had defeated the industry: **how do you run untrusted code from thousands of different customers on the same physical machine, safely, with startup times measured in milliseconds?**

Containers are fast but share a kernel. Virtual machines are isolated but slow to boot. For a decade that was the trade. AWS's answer to it is one of the more interesting pieces of systems engineering of the last ten years, and it's now running underneath more of AWS than most people realize.

Four things to take away:

1. **Firecracker dissolved the container-versus-VM trade-off**, and understanding it explains Lambda's pricing, its limits, and its cold starts.
2. **Cold starts are five distinct phases**, and only some of them are your problem.
3. **Concurrency limits are an outage mechanism**, not just a billing control.
4. **"AWS containers" is three different things**, two of which AWS didn't build.

---

