## THE MECHANISM: Burst Credits, or Why Your Server Got Slow

This one catches almost everyone, and it's the kind of problem that produces a week of confused investigation.

### The T family

`t3.micro`, `t3.small`, `t4g.medium` — these are **burstable** instances. They're cheap because they don't give you a full vCPU continuously. They give you a **baseline percentage**, plus the ability to exceed it by spending credits.

The model:

- You earn **CPU credits** continuously, at a rate set by the instance size
- One credit equals one vCPU running at 100% for one minute
- Running below baseline accumulates credits, up to a cap
- Running above baseline spends them
- **Credits hit zero, and you get throttled to baseline** — which for a `t3.micro` is around 10% of a vCPU per core

Ten percent. Your application doesn't crash. It doesn't error. It just becomes ten times slower, indefinitely, with nothing in your application logs to explain it.

Classic shape of the incident: deploy on a `t3.micro`, everything is fast for two days while banked credits drain, then performance falls off a cliff on a Wednesday morning with no deploy, no traffic change, and no obvious cause. CPU utilization looks *fine* — it's pinned at baseline, which reads as low.

**The metric that explains it is `CPUCreditBalance` in CloudWatch.** Not CPU utilization. If you run T instances and don't alarm on credit balance, you will eventually lose a day to this.

### Unlimited mode

T3 and T4g default to **unlimited mode**: when credits run out, you keep bursting and pay a surcharge per vCPU-hour instead of being throttled. T2 defaults to *standard* mode, where you get throttled.

Unlimited is usually the right choice — a small surcharge beats a ten-fold slowdown — but it converts a performance cliff into a billing surprise. A runaway process on an unlimited T instance quietly accrues charges. Neither default is wrong; both need a monitor.

**When to use T instances:** genuinely spiky, low-average workloads. Dev boxes, low-traffic services, bastion hosts, cron runners.

**When not to:** anything with sustained load, anything latency-sensitive, anything where a mysterious tenfold slowdown would be a problem. Reach for `m` or `c`.

---

