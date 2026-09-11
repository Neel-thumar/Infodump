## THE MECHANISM: The Execution Model

### Invocation types

**Synchronous** — the caller waits. API Gateway, ALB, direct SDK calls. Errors return to the caller, who decides what to do. Payload up to 6 MB.

**Asynchronous** — Lambda queues the event and returns immediately. S3 events, SNS, EventBridge. Payload up to 256 KB. **Lambda retries failures automatically** — twice by default, so three attempts total — then sends the event to a dead-letter queue or an on-failure destination if you've configured one. If you haven't, the event is silently dropped.

**Poll-based** — Lambda polls the source and invokes with batches. SQS, Kinesis, DynamoDB Streams. Retry behaviour is the source's, not Lambda's, and differs significantly between them.

**The retry behaviour is the part people get wrong.** A function that isn't idempotent, invoked asynchronously, will process the same event up to three times on failure. If it charges a credit card, it may charge three times. Idempotency is not optional in an async Lambda.

### The limits, and what they mean

| Limit | Value | Why it matters |
|---|---|---|
| Timeout | 15 minutes max | Not a batch processing platform |
| Memory | 128 MB – 10,240 MB | **Also sets CPU** — see below |
| `/tmp` | 512 MB – 10,240 MB | Ephemeral, per execution environment |
| Sync payload | 6 MB | Big payloads go via S3 |
| Async payload | 256 KB | Smaller than you'd think |
| Zipped package | 50 MB direct upload | 250 MB unzipped |
| Container image | 10 GB | The escape hatch for large dependencies |

**The memory setting is the most misunderstood control in Lambda.** It does not only allocate memory. **CPU is allocated proportionally.** At roughly 1,769 MB you get the equivalent of one full vCPU; below that, a fraction; above, more than one.

The counterintuitive consequence: **increasing memory often reduces cost.** A CPU-bound function at 512 MB running for 4 seconds may run in 1 second at 2,048 MB. You pay for GB-seconds, so:

```text
512 MB  × 4.0s  =  2,048 MB-seconds
2048 MB × 1.0s  =  2,048 MB-seconds
```

The same price — and four times faster. Often it's cheaper outright, because the speedup is more than linear once you cross the one-vCPU threshold. Almost nobody tunes this, and it's one of the easiest wins available.

---

