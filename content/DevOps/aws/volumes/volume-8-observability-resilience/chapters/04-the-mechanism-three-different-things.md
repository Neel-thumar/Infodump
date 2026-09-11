## THE MECHANISM: Three Different Things

### Metrics — numbers over time, cheap

A metric is a numeric value with a timestamp and some dimensions. CPU utilization. Request count. Queue depth. Error rate.

**They're cheap because they're aggregated.** CloudWatch doesn't store every individual measurement forever; it rolls them up as they age:

| Resolution | Retained for |
|---|---|
| 1 second (high resolution) | 3 hours |
| 1 minute | 15 days |
| 5 minutes | 63 days |
| 1 hour | 455 days |

**Use metrics for:** alerting, dashboards, capacity trends, anything where you need a number over time rather than the detail of individual events.

**Two traps worth naming.**

**Cardinality.** Custom metrics are billed per unique combination of name and dimensions, at roughly 0.30 USD per metric per month. Publish a metric dimensioned by instance ID and you get one per instance. Dimension it by user ID and you've created a metric per user, and your bill scales with your user base. **Metric dimensions must be low cardinality.** High-cardinality data belongs in logs.

**Memory and disk are not default EC2 metrics.** CloudWatch gets EC2 metrics from the hypervisor, which can see CPU, network, and disk I/O — but *cannot see inside the guest*. Memory utilization and filesystem usage require the **CloudWatch Agent** installed on the instance. An enormous number of teams alarm on CPU, never install the agent, and are genuinely surprised when a server dies of memory exhaustion with no alert.

### Logs — events with detail, expensive

A log line is a timestamped record with arbitrary content. Full fidelity, full context, no aggregation.

**And that's why they cost.** CloudWatch Logs charges roughly **0.50 USD per GB ingested**, plus storage, plus per-GB-scanned for Logs Insights queries. Ingestion is usually the dominant line.

Do the arithmetic on a service producing 100 GB of logs a day:

```text
100 GB/day × 30 days × $0.50/GB  =  $1,500/month  in ingestion alone
```

Before storage. Before queries. It is entirely normal for a team's logging bill to exceed its compute bill, and it usually happens because someone left debug logging on in production.

**The default that costs the most money in AWS:** log groups are created with **retention set to Never Expire**. Every Lambda function, every ECS task, every service creates a log group on first write and keeps its logs forever, accumulating cost indefinitely, including for services that were deleted years ago.

You met this in Volume 7's teardown. At organizational scale it's frequently the single largest avoidable line in a CloudWatch bill. Exercise 1 finds yours.

**Use logs for:** debugging specific events, audit trails, high-cardinality data, anything where you need the detail rather than the count.

**Metric filters** bridge the two — they scan incoming log lines for a pattern and emit a metric. "Count log lines containing ERROR" becomes a metric you can alarm on cheaply, without querying logs.

### Traces — one request across many services, sampled

A trace follows a single request through every service it touches, recording where the time went.

**AWS X-Ray** is the native option: segments, subsegments, a service map, and **sampling rules** — because tracing every request would be prohibitively expensive, so you trace a representative fraction.

**Be precise here:** **OpenTelemetry is not an AWS product.** It's a CNCF project, the industry-standard vendor-neutral instrumentation framework. AWS packages a distribution of it (ADOT) and X-Ray can receive OTel data. Instrumenting with OpenTelemetry rather than the X-Ray SDK keeps you portable, which is usually the right call.

**Use traces for:** "which service is slow," "what does this request actually touch," and understanding latency in a distributed system where no single service's metrics explain the total.

### Alarms — turning signal into action

A CloudWatch alarm watches a metric against a threshold. Three states: `OK`, `ALARM`, `INSUFFICIENT_DATA`.

**Evaluation periods and datapoints-to-alarm** control sensitivity. "3 out of 5 periods breaching" is far less noisy than "1 period breaching" and catches sustained problems while ignoring blips.

**Treat missing data is the setting nobody configures and everybody should.** Options: `breaching`, `notBreaching`, `ignore`, `missing`.

Here's why it matters. Your alarm watches error rate. Your service dies completely and stops publishing metrics. There is now **no data** — not high error rates, *no data at all*.

With the default (`missing`), the alarm goes to `INSUFFICIENT_DATA` and **does not fire**. Your service is completely dead and your alarm is quietly grey.

For an alarm monitoring something that *should always be producing data*, set missing data to **`breaching`**. Absence is the signal.

**Composite alarms** (2020) combine alarms with boolean logic. The use case is noise: when a database fails, twelve dependent service alarms fire simultaneously and page twelve times. A composite alarm can express "alert if the API alarm is firing AND the database alarm is not" — so you get one page about the root cause, not twelve about symptoms.

### EventBridge — the nervous system

Formerly CloudWatch Events, rebranded in 2019 and substantially expanded.

Every AWS service emits events to a default event bus: an instance changed state, a snapshot completed, a build finished, a finding appeared. You write **rules** with pattern matching and route them to targets — Lambda, SQS, Step Functions, another account's bus.

```json
{
  "source": ["aws.ec2"],
  "detail-type": ["EC2 Instance State-change Notification"],
  "detail": { "state": ["terminated"] }
}
```

That rule fires whenever any instance terminates. It's how you build reactive automation — auto-remediation, compliance enforcement, notification — without polling anything.

**Archive and replay** is the underrated feature: retain events and replay them later, which turns an incident into something you can reproduce.

---

