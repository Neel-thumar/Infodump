## THE MECHANISM: Building a VPC From Nothing

Let's construct one conceptually, in the order the pieces actually depend on each other.

### Step 1 — A CIDR block

You start by claiming an address range:

```text
10.0.0.0/16
```

That's 65,536 addresses, from `10.0.0.0` to `10.0.255.255`. It's private space (RFC 1918), so it doesn't collide with the public internet.

Constraints worth knowing:

- VPC CIDR must be between `/16` (65,536 addresses) and `/28` (16 addresses)
- You cannot change the primary CIDR after creation — you can only *add* secondary blocks
- **Choose carefully.** The moment you want to peer with another VPC, or connect to an office network, overlapping ranges become an expensive, migration-shaped problem. `10.0.0.0/16` is the default everyone picks, which is precisely why picking it makes future peering harder.

### Step 2 — Subnets

A VPC spans a whole Region. A **subnet** is a slice of the VPC's address range **pinned to exactly one Availability Zone**.

```text
10.0.1.0/24   in us-east-1a    (256 addresses)
10.0.2.0/24   in us-east-1b
10.0.3.0/24   in us-east-1a
```

This is the mechanism behind everything you'll do in Volume 8 about high availability. You get multi-AZ resilience by placing subnets in different AZs and spreading resources across them. A subnet cannot span AZs — so "which subnet" always implies "which AZ."

**AWS takes five addresses out of every subnet.** In `10.0.1.0/24`:

| Address | Reserved for |
|---|---|
| `10.0.1.0` | Network address |
| `10.0.1.1` | VPC router |
| `10.0.1.2` | DNS (the "VPC base + 2" address) |
| `10.0.1.3` | Reserved for future use |
| `10.0.1.255` | Broadcast address (reserved even though VPC doesn't support broadcast) |

So a `/24` gives you 251 usable addresses, not 256. On a `/28` you get **11**, which is small enough to actually run out — and people do, particularly with EKS, where every pod can consume an IP (Volume 7).

### Step 3 — Route tables

Here's where the "software-defined" part becomes concrete. A **route table** is a list of destination-to-target rules, and every subnet is associated with exactly one.

Every route table starts with one rule you cannot delete:

```text
Destination      Target
10.0.0.0/16      local
```

That's the VPC's own CIDR, routed locally. It's why everything inside a VPC can reach everything else by default at the routing layer — *subject to security groups*, which is a separate question we'll get to.

Routing uses **longest prefix match**: the most specific matching route wins. A route for `10.0.5.0/24` beats one for `10.0.0.0/16` beats one for `0.0.0.0/0`.

### Step 4 — The Internet Gateway

A subnet with only the local route is entirely cut off from the internet. To change that, you attach an **Internet Gateway (IGW)** to the VPC and add a route:

```text
Destination      Target
10.0.0.0/16      local
0.0.0.0/0        igw-0abc123
```

**And now the actual definition of a public subnet: a subnet whose route table has a route to an Internet Gateway.** That's it. There is no "public" checkbox. It's a routing property. A subnet is public because of where its packets can go.

Two details people find surprising:

**The IGW is not a device.** It's horizontally scaled and redundant by design, with no bandwidth constraint you can hit or availability you need to manage. There is exactly one per VPC and nothing to size.

**Your instance does not know its own public IP.** The IGW performs one-to-one NAT between the instance's private address and its public address. Run `ip addr` on an EC2 instance with a public IP and you'll see only the private one. The public address exists in the gateway's translation table, not on the machine. This trips up software that tries to determine its own address for, say, cluster membership — which is one reason the metadata service from Volume 2 exists.

### Step 5 — NAT, for the traffic that should go out but not come in

Now the common requirement: your application servers sit in a private subnet. They must not be reachable from the internet. But they need to *fetch* things — OS updates, package registries, third-party APIs.

You need outbound-only. That's a **NAT Gateway**.

You place it **in a public subnet** (it needs internet access itself), give it an Elastic IP, and then point the *private* subnet's route table at it:

```text
Private subnet route table:
Destination      Target
10.0.0.0/16      local
0.0.0.0/0        nat-0xyz789
```

Traffic from private instances goes to the NAT Gateway, which translates the source address to its own and forwards out through the IGW. Return traffic comes back through the same translation. Unsolicited inbound connections have nowhere to go — the NAT has no mapping for them.

**The NAT Gateway is AZ-scoped**, which has two consequences people miss:

- For real high availability you need one per AZ. One NAT Gateway is a single-AZ dependency for your whole private tier.
- If your private subnet in `us-east-1b` routes to a NAT Gateway in `us-east-1a`, **every byte crosses an AZ boundary and you pay cross-AZ data transfer on top of NAT charges.**

**Cost flag, because this is one of the great AWS bill surprises:** a NAT Gateway costs roughly **0.045 USD per hour** plus roughly **0.045 USD per gigabyte processed** (rates vary by Region — verify current pricing). The hourly charge is about 32 USD per month per gateway. Three AZs means roughly 100 USD per month before a single byte moves.

And the per-gigabyte charge applies to *everything*, including traffic to S3 — which is completely avoidable, as we'll see shortly.

---

