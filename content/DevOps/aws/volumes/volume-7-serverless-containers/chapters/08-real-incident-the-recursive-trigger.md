## REAL INCIDENT: The Recursive Trigger

### The shape

This one is a genre, not a single event. It recurs constantly, and the arithmetic is what makes it memorable.

The classic setup:

```text
S3 bucket  →  (on object created)  →  Lambda function
Lambda function  →  writes output  →  same S3 bucket
```

Perfectly reasonable-looking. A function that generates thumbnails, or compresses uploads, or normalizes filenames. And if the output lands in the same bucket with a prefix the trigger also matches:

1. Upload one file
2. Lambda fires, writes an output file
3. That write triggers Lambda
4. Which writes another file
5. Which triggers Lambda

Exponential, running at Lambda's full scaling rate, in parallel, overnight, while everyone's asleep.

The same pattern appears with SQS (a function that writes to the queue it consumes), SNS, and DynamoDB Streams (a function that writes to the table whose stream invokes it).

### What it costs

Do the arithmetic. A function at 1,024 MB running for 500 ms, at the account concurrency limit of 1,000, running continuously:

```text
1,000 concurrent × 2 invocations/second  = 2,000 invocations/sec
                                         ≈ 7.2 million invocations/hour
```

Add the compute charge, the S3 PUT requests, the S3 GET requests, the storage for however many millions of objects it created, and the CloudWatch Logs ingestion for millions of log entries — which is frequently the largest line, because every invocation logs.

Eight hours of that is a four- or five-figure bill. Public accounts of exactly this exist in abundance.

### Why it's so easy to do

- **It looks correct in review.** "Function reads from bucket, writes to bucket" is not obviously a loop until you trace the trigger configuration.
- **Nothing fails.** Every invocation succeeds. Every write succeeds. There is no error to alert on.
- **It's fastest at night.** Nobody is watching, and there's no competing load to slow it down.
- **Billing is delayed.** Cost data lags by hours. By the time a budget alarm fires, the loop has been running for a long time.

### What AWS built

In 2023 AWS introduced **recursive loop detection**. Lambda tracks invocation lineage through a request metadata chain and, after roughly 16 recursive invocations of the same lineage, stops the function and notifies you. A `RecursiveInvocationsDropped` CloudWatch metric records it.

**Note the coverage carefully.** It works for Lambda-to-Lambda, SQS, and SNS chains. **S3-triggered loops are not covered the same way**, because the lineage metadata doesn't traverse an S3 object write. The single most common version of this incident is the one the safety net doesn't catch.

### What you should do

- **Never write output to the same prefix that triggers the function.** Use a different bucket, or an output prefix that the trigger's prefix filter excludes. Configure the filter explicitly rather than relying on the code.
- **Set reserved concurrency on every function.** A cap you never hit costs nothing. A cap you do hit converts a catastrophe into a bounded incident.
- **Budget alarms** — Volume 1, step 4. This is what they're for.
- **Alarm on invocation count**, not just errors. A function that normally runs 100 times an hour running 100,000 times an hour is the signal, and every one of those invocations is "successful."
- **Set log retention.** Lambda log groups default to never expiring. Volume 8 covers this.

---

