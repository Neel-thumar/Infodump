## THE MECHANISM: CloudTrail, and the Setting That's Off

CloudTrail records API calls. Every signed request from Volume 1: who, what, when, from where, and whether it succeeded.

**It is the only reason anyone ever finds out what an attacker did.**

### Three kinds of event, and the critical distinction

**Management events** — control plane operations. `RunInstances`, `CreateBucket`, `AssumeRole`, `PutBucketPolicy`, `AttachUserPolicy`. **Logged by default**, and the console keeps a searchable 90-day **Event history** at no charge.

**Data events** — data plane operations. `GetObject`, `PutObject`, `DeleteObject` on S3. Lambda `Invoke`. DynamoDB item-level operations.

**These are OFF by default. All of them.**

Read that again with Volume 2 in mind.

In the Capital One breach, the attacker used stolen role credentials to list and read S3 objects. Those were `ListBucket` and `GetObject` calls — **data events**. Unless data events had been explicitly enabled for those buckets, **the actual exfiltration does not appear in CloudTrail at all.**

Management events would show the role being assumed. They would not show a single object being read.

**Why it's off by default:** volume and cost. A busy S3 bucket generates millions of object operations, and logging every one costs real money. AWS made it opt-in rather than imposing that on everyone.

**What you should actually do:** enable data events at minimum for buckets holding sensitive data, and for Lambda functions that touch it. It costs money. Being unable to answer "what did they take?" costs more.

**Insights events** — CloudTrail's own anomaly detection over API call rates, flagging unusual bursts. Also opt-in.

### The trail versus the console history

The free 90-day console Event history is **management events only, in the console, for 90 days.**

For anything real you create a **trail** delivering to S3, which gives you indefinite retention, all Regions, data events if you enable them, and — critically — **log file integrity validation**. CloudTrail writes periodic digest files containing SHA-256 hashes of the log files, signed with a private key. You can verify cryptographically that nobody altered the record.

That last point matters more than it sounds. A competent attacker's first move after gaining access is to cover their tracks. Integrity validation, plus delivering the trail to a **separate, locked-down account** that the compromised account cannot write to, is how you keep a record an attacker can't erase.

**Organization trails** in AWS Organizations (Volume 9) capture every account centrally and cannot be disabled by member accounts. If you run more than one account, this is the correct setup.

### The rest of the security stack, briefly

- **GuardDuty** — threat detection over CloudTrail, VPC Flow Logs, and DNS logs. Finds crypto-mining, credential misuse, communication with known-bad hosts. Low effort, genuinely useful.
- **AWS Config** — records resource configuration over time and evaluates rules. Answers "what did this security group look like last Tuesday?" and "which buckets are non-compliant?"
- **Security Hub** — aggregates findings from the above against benchmarks like CIS.
- **Amazon Inspector** — vulnerability scanning for EC2, ECR images (Volume 7's Log4Shell lesson), and Lambda.
- **Amazon Detective** — graphs relationships across the data for investigation.

---

