## REAL INCIDENT: The Failovers Nobody Drilled

There's no single famous RDS outage to tell you about, and that's itself the lesson. The failures here are distributed across thousands of companies, each one private, each one the same shape.

### The documented version: April 2011

Go back to the EBS re-mirroring storm from Volume 4. RDS was a downstream victim, and AWS's post-event summary covered it specifically.

Single-AZ RDS instances in the affected Availability Zone were, unsurprisingly, badly affected — their storage was stuck. A large fraction became unavailable and stayed that way.

Multi-AZ instances were supposed to be the answer. Most of them did fail over as designed.

**But not all of them.** AWS reported that a subset of Multi-AZ deployments did not fail over automatically. The explanation involved a software bug in the failover logic that surfaced when a particular sequence of conditions occurred — conditions that were far more likely during a large correlated failure than during the single-instance failures that failover had been tested against.

Read that again, because it generalizes: **the failover mechanism was tested against the failure mode it was least likely to face, and behaved differently during the failure mode it existed for.** Individual instance failure is common and well-handled. Correlated AZ-wide failure is rare, hard to simulate, and exactly when you need failover most.

*Accuracy note: AWS's post-event summary discusses the Multi-AZ failover issue and gives figures for affected instances. I'm giving the shape of it rather than precise percentages, because I don't want to state numbers I'm not certain of. The original document is worth reading directly.*

### The undocumented version: every company

Far more common, and invisible because nobody publishes it:

**The failover worked and the application didn't reconnect.** The JVM DNS caching problem from earlier. The database was back in ninety seconds; the outage lasted forty minutes because someone had to work out that a rolling restart was the fix.

**The failover worked and the connection pool didn't notice.** Sixty pooled connections to a dead host, handed out one at a time, each failing individually. The application degrades instead of failing cleanly, which is worse for diagnosis.

**Backups existed and nobody could restore them.** Retention configured, snapshots visible in the console, and no one had ever executed a restore. When it mattered, the team learned in real time that a restore creates a new instance, that it doesn't carry all configuration, that the endpoint changes, and that a large database takes hours.

**The read replica was promoted and data was lost.** Async replication was three seconds behind at the moment of failure. Three seconds of committed transactions, gone, discovered days later during reconciliation.

### The adjacent example worth studying

One of the best-documented database incidents in the industry is **GitLab's, on January 31, 2017** — and I want to be clear that **this was not AWS**. GitLab was running their own PostgreSQL. I'm including it because they published an unusually honest account, in public, in real time, and it illustrates this volume's point better than anything from inside AWS.

During an incident response, an engineer ran a destructive command against the wrong host and removed a production database directory. The recovery revealed that they had roughly five separate backup and replication mechanisms, and **none of them were working as intended** — some had been silently failing, some produced unusable output, some had never been tested.

They recovered from a snapshot that happened to exist because of an unrelated staging process, losing several hours of data.

Their write-up is worth reading in full. The line that matters: having many backup mechanisms configured is not the same as having one that works, and the only way to know which you have is to restore.

---

