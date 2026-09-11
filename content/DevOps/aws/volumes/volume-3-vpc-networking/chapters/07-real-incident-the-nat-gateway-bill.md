## REAL INCIDENT: The NAT Gateway Bill

A quieter failure, without a CVE, that shows up constantly in cost reviews.

### The arithmetic

A team runs a data pipeline on private subnets. It reads and writes several terabytes a month to S3. Sensible architecture — nothing has a public IP, everything goes out through NAT.

Every byte to S3 traverses the NAT Gateway. At roughly 0.045 USD per gigabyte processed:

```text
5 TB/month  =  5,120 GB  ×  $0.045  ≈  $230/month in NAT processing
```

Add three NAT Gateways for AZ redundancy at about 32 USD each:

```text
$230  +  $96   ≈  $326/month
```

Now add a **free** S3 gateway endpoint. S3 traffic gets a more specific route, bypasses NAT entirely, and stays on the AWS network:

```text
$0  +  $96   ≈  $96/month
```

The same architecture. The same security posture — better, actually, since traffic no longer touches the internet. One route table entry, and the bill drops by seventy percent.

### The general lesson

**Data transfer is the AWS cost most people can't see.** Compute is legible: an instance has a type and an hourly rate. Data transfer is a property of *paths*, and paths are implicit. Nothing in your architecture diagram says "this arrow costs money."

The paths that cost:

- Out to the internet (per GB, the largest rate)
- Through a NAT Gateway (per GB processed, on top of internet egress)
- **Across AZs, in both directions** — the one that quietly dominates chatty microservice architectures
- Between Regions
- Through Transit Gateway or an interface endpoint

The paths that don't:

- Within a single AZ using private IPs
- To S3 or DynamoDB via a gateway endpoint
- Inbound from the internet

Volume 9 does this properly. For now, install the habit: **when you draw an arrow between two boxes, ask which boundary it crosses.**

---

