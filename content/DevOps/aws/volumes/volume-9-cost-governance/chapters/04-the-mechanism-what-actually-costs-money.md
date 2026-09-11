## THE MECHANISM: What Actually Costs Money

### The four categories

Almost every AWS charge falls into one of these:

1. **Compute time** — instance-hours, Lambda GB-seconds, Fargate vCPU-seconds
2. **Storage** — GB-months of EBS, S3, RDS storage, snapshots
3. **Requests** — API calls, S3 operations, Lambda invocations, CloudWatch metrics
4. **Data transfer** — bytes crossing a boundary

Most people budget for the first two. **Categories three and four are where the surprises live.**

### The data transfer map

Learn this table. It's the single highest-value thing in this volume.

| Path | Approximate cost |
|---|---|
| **Inbound from the internet** | **Free** |
| Outbound to the internet | ~$0.09/GB (tiered down at volume) |
| **Between AZs, same Region** | ~$0.01/GB **each direction** |
| Between Regions | ~$0.02/GB |
| **Within one AZ, via private IP** | **Free** |
| Within one AZ, via **public** IP | Charged as if it left |
| Through a NAT Gateway | ~$0.045/GB processed, **on top of** the above |
| Through an interface VPC endpoint | ~$0.01/GB |
| Through Transit Gateway | ~$0.02/GB |
| **S3/DynamoDB via gateway endpoint** | **Free** |
| S3 or EC2 origin → CloudFront | Free |

*(Rates vary by Region and change over time. Verify against current pricing pages before making a decision on the strength of a number.)*

**Three things in that table deserve emphasis.**

**Cross-AZ is charged in both directions.** A service in AZ-a calling a service in AZ-b pays on the request and on the response. The effective round-trip rate is roughly double the headline number. For a chatty microservice architecture spread across three AZs for resilience, this is a real and continuous tax — and it's the direct cost of the static stability you bought in Volume 8. Worth it, usually. Worth *knowing about*, always.

**Using a public IP inside your own VPC costs money.** If service A reaches service B by its public DNS name rather than its private one, the traffic is billed as though it left AWS. This happens constantly with hardcoded endpoints and misconfigured service discovery. Use private IPs and private DNS.

**Inbound is free.** This is why AWS is cheap to get into and expensive to get out of, and why "egress fees" have become a regulatory topic. It's a real strategic property of the pricing model, not an accident.

### The request charges people forget

- **S3 requests** — PUT/COPY/POST/LIST are charged at a higher rate than GET. A workload doing millions of small PUTs can pay more in requests than in storage.
- **CloudWatch custom metrics** — roughly $0.30 per metric per month, and a high-cardinality dimension multiplies that (Volume 8).
- **CloudWatch Logs ingestion** — roughly $0.50/GB (Volume 8).
- **Secrets Manager** — per-secret monthly plus per-API-call. Fetching a secret on every Lambda invocation at scale adds up (Volume 2).
- **KMS** — per-key monthly plus per-request. A high-throughput encryption workload generates a lot of requests.
- **NAT Gateway hours** — roughly $32/month per gateway, before any data (Volume 3).
- **EKS control plane** — roughly $73/month per cluster, before any nodes (Volume 7).

---

