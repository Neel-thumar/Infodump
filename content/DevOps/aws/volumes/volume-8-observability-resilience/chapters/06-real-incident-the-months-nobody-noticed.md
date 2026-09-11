## REAL INCIDENT: The Months Nobody Noticed

### The pattern

Go back to Capital One (Volume 2). The technical chain was: SSRF, then IMDS, then credentials, then S3 exfiltration.

But look at the **timeline**:

- The data was taken around **March 2019**
- It was discovered in **July 2019**
- The discovery came from an **outside party** emailing the company's responsible-disclosure address, having seen the data posted publicly

**Roughly four months.** And the alarm was rung by a stranger.

This is not unusual. Industry research consistently puts the mean time to identify a breach in the range of **six to seven months**, with a further period to contain it. *(Figures vary year to year — IBM's annual Cost of a Data Breach report is the usual source. Treat the specific number as approximate and check the current edition.)*

The uncomfortable summary: **most organizations find out about their breaches from someone else.**

### Why detection fails

**The data events weren't on.** Even with a trail configured, if data events were off, S3 object reads aren't in the record. There is nothing to detect and — later — nothing to investigate with.

**Nothing looked wrong.** Valid credentials, used correctly, calling a legitimate API. No authentication failure. No error. No crash. From every system's point of view, an authorized principal read some objects. The only anomalous thing was the *pattern* — a WAF instance suddenly listing and reading a great many buckets — and pattern detection requires something actively looking.

**Nobody owned the signal.** Even where logs existed, no one had asked "should this role be doing this?" Logs that nobody queries are storage costs, not security.

**No baseline.** You cannot detect anomalies without a sense of normal. This is exactly what GuardDuty provides, and why it's worth turning on even if you do nothing else.

### The dependency lesson, again

Here's what makes this a *this volume* incident rather than a Volume 2 one.

**Detection capability must exist before the event.** You cannot retroactively enable CloudTrail data events for last March. You cannot go back and instrument. The forensic record either exists or it doesn't, and which one is true was decided months earlier by someone weighing a line item.

Same structure as everything else in this volume. Same structure as the status page on S3, the monitoring inside the congested network, the failover never drilled.

**The questions to answer now:**

- If an attacker used valid credentials to read your most sensitive S3 bucket today, would there be a record?
- Could an attacker with admin access delete that record?
- Is anyone or anything looking at it?
- How long would it take you to find out?

---

