## THE MECHANISM: Auto Scaling, and Its Built-In Lag

### The pieces

A **launch template** describes what to launch — AMI, instance type, security groups, IAM instance profile, user data. (Launch *configurations* are the deprecated predecessor; use templates.)

An **Auto Scaling Group** maintains a count:

- **Minimum** — never go below
- **Maximum** — never go above
- **Desired capacity** — the target right now

The ASG's job is to make reality match desired capacity. If an instance dies, it launches a replacement. If a scaling policy raises desired capacity, it launches more.

**Health check type matters.** Default is `EC2`, which only checks whether the instance is running — so a wedged application on a booted instance stays in service forever. Set it to `ELB` and the ASG uses the load balancer's health check, replacing instances whose *application* is broken rather than whose *hypervisor* noticed something.

### Scaling policies

**Target tracking** — "keep average CPU at 50%." AWS manages the alarms. This is the right default for most workloads.

**Step scaling** — explicit thresholds and increments. More control, more configuration.

**Scheduled** — scale at a specific time. Correct for known patterns like a 9am login surge.

**Predictive** — machine learning over historical patterns, scaling *ahead* of anticipated demand.

### Why scaling always lags — the arithmetic

Add up the pipeline between a traffic spike and a serving instance:

```text
CloudWatch metric publication            1–2 min  (standard resolution)
Alarm evaluation (often 2–3 periods)     2–3 min
ASG launches instance                    ~30 sec
Instance boots                           1–2 min
Application starts                       30 sec – 5 min
Load balancer health checks pass         30 sec – 2 min
------------------------------------------------------
Total                                    5–15 minutes
```

**Five to fifteen minutes.** A traffic spike that arrives in thirty seconds will be absorbed — or not — entirely by the capacity you already had.

This is structural. There is no configuration that removes it. What you can do:

- **Scale on leading indicators** — queue depth or request count rather than CPU, which is a lagging symptom
- **Keep headroom.** Target 50% utilization, not 90%. The headroom is what covers the lag.
- **Cut boot time.** A pre-baked AMI beats a machine that installs packages at boot. This is the single biggest lever most teams have.
- **Use scheduled scaling** for predictable patterns rather than reacting to them
- **Warm pools** for pre-initialized, stopped instances that start fast

And remember Volume 1: **scaling is a control plane operation.** During a control plane impairment, your ASG cannot launch anything. Whatever is running is what you have. That's the entire argument for static stability in Volume 8.

---

