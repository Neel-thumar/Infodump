## Where We Go Next

**Volume 4 — Compute: EC2, EBS, Load Balancing, Auto Scaling.**

You have identity and a network. Now the machines that live in it. We'll go from Xen to Nitro and why AWS ended up designing its own silicon, work through instance families and what the letters actually mean, then EBS — volume types, IOPS, and the burst-credit mechanism that makes instances mysteriously slow down after running fine for hours.

Second half: the load balancer generations (CLB, ALB, NLB) and what each is genuinely for, target groups, health checks, connection draining, and Auto Scaling Groups — including why scaling always lags demand and what you do about it.

Two incidents: **April 21, 2011**, when EBS volumes in a Region tried to re-replicate themselves simultaneously and consumed the capacity they needed to recover — the outage that taught the industry "design for failure." And **Christmas Eve 2012**, when a maintenance process deleted production ELB state data and took Netflix down on one of the highest-traffic nights of the year.

---

*Volume 3 complete. Say **continue** when you're ready for Volume 4.*
