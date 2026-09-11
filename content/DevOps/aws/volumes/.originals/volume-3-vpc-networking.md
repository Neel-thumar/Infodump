---
id: vpc-networking
title: "Volume 3 — VPC: Building a Network That Doesn't Exist"
order: 3
description: Construct a private network from an empty CIDR block up — subnets, routing, gateways, and the stateful/stateless distinction that burns more debugging hours than anything else in AWS.
draft: false
---

# Mastering AWS: The Engineering, The History, The Incidents

## Volume 3 — VPC: Building a Network That Doesn't Exist

---

## The Question This Volume Answers

You launch two EC2 instances. They can talk to each other. You launch a third in a different account, in the same data center, possibly on the same physical host — and it can't reach either of them, can't see their traffic, doesn't know they exist.

There is no cable between the first two. There is no switch you configured. There's no VLAN you set up. The "network" they share is a fiction maintained by software.

**So what is it made of, and what happens when the fiction leaks?**

This volume is about the layer that decides where packets may go. It's the layer that most reliably separates people who can operate AWS from people who can only use it — partly because networking is genuinely hard, and partly because two AWS features that look like the same thing behave in opposite ways, and nobody tells you until you've lost an afternoon.

Three things to take away:

1. **A VPC is a software-defined network**, and its routing rules are explicit objects you can read.
2. **Security groups are stateful. Network ACLs are not.** That one word is the whole difference.
3. **Every network path has a price**, and the expensive paths are invisible until the bill arrives.

---

## THE PROBLEM: Everyone Was on the Same Network

To understand why VPC exists, you have to understand what came before it, because it was genuinely alarming.

### EC2-Classic

When EC2 launched in 2006, there was no such thing as your own network. Every instance you launched went onto a single enormous flat network shared with **every other AWS customer**. Your instance got a public IP address, directly, and was reachable from the internet by default.

Think about what that means:

- No private subnets. Your database server had a public IP, same as your web server.
- No network-level isolation from other customers. Your neighbour was some stranger's instance.
- No control over IP addressing. You got what you were given, and it changed when you stopped and started.
- Security groups existed, and they were the *only* thing standing between your instance and the entire internet.

It worked, in the sense that it shipped and people used it. But it made certain architectures impossible. You could not build the standard enterprise pattern — a DMZ with public-facing servers, a private tier behind it that has no route to the internet at all. There was no "no route to the internet." There was only "a firewall rule that says no."

And you certainly couldn't connect this to a corporate data center in any sane way.

### What AWS built

**Amazon VPC arrived in 2009.** The proposition: you get your own logically isolated section of the AWS cloud, with your own IP range, your own subnets, your own route tables, and your own gateways. A network that behaves like a network you'd build yourself, except it's entirely software.

For several years VPC was opt-in and EC2-Classic remained the default. In 2013 AWS flipped it — new accounts got a **default VPC**, and EC2-Classic began a long retirement, finally completed in **August 2022**.

If you created an AWS account in Volume 1, you already have a default VPC in every Region. It's a convenience: a `/16`, one public subnet per AZ, an internet gateway, all wired up. It's also why your first EC2 instance "just works" — and why a lot of people never learn any of this, right up until the day they need to.

*Accuracy note: the 2009 launch and the 2022 EC2-Classic retirement are firm. The exact sequencing of default-VPC rollout across Regions in 2013 I'd treat as approximately right rather than precisely so.*

---

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

## THE MECHANISM: Security Groups vs. Network ACLs

This is the section that matters most. If you take one thing from this volume, take this.

AWS gives you two packet-filtering mechanisms. They look similar in the console. They are not similar.

### Security groups

A **security group** is a virtual firewall attached to an **ENI** (which in practice means: to an instance, a load balancer, an RDS database, a Lambda function in a VPC).

Properties:

- **Stateful.** If a request is allowed out, the response is automatically allowed back in. You never write a return rule.
- **Allow rules only.** There is no such thing as a deny rule in a security group. You cannot express "block this IP."
- **Default deny inbound, allow all outbound.** A new security group blocks everything coming in and permits everything going out.
- **Evaluated as a union.** Attach five security groups and the effective permission is everything any of them allows.
- **They can reference each other.** This is the feature that makes them genuinely good.

That last one deserves emphasis. You can write a rule that says: *allow port 5432 from security group `sg-web`*. Not from an IP range — from a **group**. Any instance in `sg-web` can reach the database, and instances launched tomorrow are covered automatically, with no address bookkeeping ever.

This is how you should be building. Tiers reference tiers:

```text
sg-alb   : inbound 443 from 0.0.0.0/0
sg-web   : inbound 8080 from sg-alb
sg-db    : inbound 5432 from sg-web
```

Read that and the architecture is legible at a glance. Nothing reaches the database except the web tier. Nothing reaches the web tier except the load balancer. No IP addresses appear anywhere, so nothing breaks when instances are replaced.

### Network ACLs

A **network ACL** is a filter at the **subnet** boundary. Every packet entering or leaving a subnet is checked against it.

Properties:

- **Stateless.** Return traffic is *not* automatically allowed. You must write rules in both directions.
- **Allow and deny rules.** You can explicitly block.
- **Numbered, evaluated in order.** Lowest rule number first; first match wins and evaluation stops.
- **One NACL per subnet**, though one NACL can be shared by several subnets.
- The default NACL allows all traffic both ways — so in a fresh VPC it's effectively transparent.

### The trap

Statelessness is where people lose the afternoon.

You write a NACL that permits inbound HTTPS on port 443. Correct. Traffic arrives. Your server responds — and the response goes to the client's **ephemeral port**, some number in the range 1024–65535 that was chosen randomly by the client's OS.

Your outbound NACL rules don't mention that range. The response is dropped.

From the server's perspective, everything worked — it received the request and wrote the response. From the client's perspective, the connection hangs and times out. Nothing in your application logs indicates anything wrong. You will check the security group, which is fine, three times.

So any NACL that permits inbound service traffic also needs something like:

```text
Rule 100  ALLOW  outbound  TCP  1024-65535  to  0.0.0.0/0
```

With a security group, none of this arises. The connection is tracked; the response is allowed because the request was.

### Which should you use?

**Default to security groups.** Use them as your primary control, structure them by tier, and reference groups rather than IPs.

**Reach for NACLs when you need something security groups structurally cannot do:**

- **Explicit deny.** Blocking a specific attacking IP range — security groups have no deny.
- **A subnet-wide guarantee** that doesn't depend on every resource having the right group attached. Belt and braces for a sensitive subnet.
- **Blast-radius containment** during an incident.

The comparison, side by side:

| | Security group | Network ACL |
|---|---|---|
| Attaches to | ENI / resource | Subnet |
| State tracking | Stateful | Stateless |
| Rule types | Allow only | Allow and deny |
| Evaluation | Union of all rules | Numbered, first match wins |
| Return traffic | Automatic | You write it |
| Can reference other groups | Yes | No |
| Applies to | Resources with the group | Everything in the subnet |

---

## THE MECHANISM: The Remaining Pieces

### Elastic Network Interfaces

An **ENI** is a virtual network card. Every instance has at least one (`eth0`, the primary, which cannot be detached). It carries the private IP, any secondary IPs, the MAC address, and the security group attachments.

Secondary ENIs can be attached, detached, and moved between instances **in the same AZ** — which is a neat failover trick: move the ENI, and the IP and security posture move with it.

One property matters later: the **source/destination check**, which is on by default. It drops packets that aren't addressed to or from the instance. You disable it only when the instance is deliberately acting as a router — the old NAT-instance pattern that NAT Gateway replaced.

### VPC endpoints — and where IAM comes back

Here's a scenario that seems fine until you look at the bill and the threat model.

Your private instances need S3. They have no public IP, so they route through the NAT Gateway, out the IGW, across the public internet, to S3's public endpoint. You pay NAT processing on every byte. And your "private" traffic has left the AWS network.

**VPC endpoints** fix this. Two kinds, and they're genuinely different:

**Gateway endpoints** — available for **S3 and DynamoDB only**. They're a route table entry, not a device. You create one, associate it with a route table, and traffic to S3 gets a more specific route that keeps it on the AWS network entirely.

**They are free.** No hourly charge, no data charge. A gateway endpoint for S3 is very close to a pure win, and enormous numbers of AWS accounts don't have one.

**Interface endpoints (AWS PrivateLink)** — available for most other services. These create an actual ENI in your subnet with a private IP, and DNS is adjusted so the service's hostname resolves to it. Roughly **0.01 USD per hour per endpoint per AZ**, plus data processing. Not free, but often cheaper than the NAT path and strictly better for security.

**And here's the connection back to Volume 2:** endpoints support **endpoint policies** — resource-based IAM policies attached to the endpoint itself. You can enforce, at the network layer, "traffic through this endpoint may only reach *our* S3 buckets." A compromised instance can't exfiltrate to an attacker's bucket even with valid credentials, because the network path refuses.

That's identity and networking enforcing the same rule from two directions. It's one of the better patterns AWS offers.

### DNS inside a VPC

Two VPC attributes control this:

- **`enableDnsSupport`** — whether the VPC's DNS resolver works at all. On by default.
- **`enableDnsHostnames`** — whether instances get public DNS names. On in the default VPC, **off** in VPCs you create manually.

The resolver lives at **VPC base + 2** (`10.0.0.2` for a `10.0.0.0/16` VPC) and also at `169.254.169.253`. This is Route 53 Resolver, and it's what resolves private hosted zones, endpoint DNS names, and public names.

If you've ever created a VPC by hand and found that private DNS names don't resolve, `enableDnsHostnames` is the answer.

### Connecting VPCs

**VPC peering** — a direct connection between two VPCs, same or different accounts, same or different Regions. Two hard constraints:

- **CIDRs must not overlap.** No NAT, no workaround.
- **Peering is not transitive.** If A peers with B and B peers with C, A cannot reach C. Period. You'd need A–C directly.

Non-transitivity is the killer. With four VPCs you need six peerings; with ten you need forty-five. The full-mesh explosion is what Transit Gateway was built for.

**Transit Gateway** — a regional hub. Each VPC attaches once, and the gateway routes between them transitively, with route tables controlling who may reach whom. Also terminates VPN and Direct Connect. Roughly **0.05 USD per hour per attachment** plus per-GB data processing, so it's not free — but past a handful of VPCs it's cheaper than the mesh and vastly easier to reason about.

**Site-to-Site VPN** — IPsec tunnels to your own network over the internet. Cheap, quick, subject to internet conditions.

**Direct Connect** — a dedicated physical circuit into AWS. Consistent latency, lower data transfer rates, lead times measured in weeks and a real contract.

---

## REAL INCIDENT: The `0.0.0.0/0` Pattern

There's no single famous VPC outage to tell you about. Instead there's something more useful: a failure pattern that recurs so reliably it has become an industry constant.

### The shape of it

Someone needs to reach a service. Debugging a connection issue, setting up a demo, onboarding a contractor. They open a security group to `0.0.0.0/0` — all IPv4 addresses — intending to narrow it later.

They don't narrow it later.

The service is discovered by automated scanning, typically within hours. It's exploited. The pattern repeats across every cloud provider and every year.

### Documented waves

**January 2017 — the MongoDB ransom wave.** Tens of thousands of MongoDB instances were found exposed to the internet with no authentication. Attackers wiped databases and left ransom notes demanding Bitcoin. Several competing groups were doing it simultaneously, sometimes overwriting each other's ransom notes. The same wave rolled through Elasticsearch, CouchDB, and Hadoop clusters over the following months.

Root cause in almost every case: a database bound to all interfaces, with a network rule allowing the world in.

**2018 — Tesla's Kubernetes console.** Security researchers at RedLock reported finding a Kubernetes administrative console belonging to Tesla exposed without password protection. Inside it were AWS credentials. The attackers who'd found it first were using the infrastructure to mine cryptocurrency — and notably, they'd configured the mining to run at low intensity behind CloudFlare to avoid detection.

**Ongoing — Redis, Docker APIs, Jenkins, exposed management ports.** The cryptomining economy from Volume 2 feeds directly on these. An open port is compute someone else can spend.

### Why this keeps happening

It isn't ignorance. It's structural:

1. **`0.0.0.0/0` is the fastest way to make a thing work.** Under deadline pressure, "it works now" beats "it's correct."
2. **Nothing degrades.** An over-permissive rule has no symptom. It doesn't slow anything, break anything, or appear in a log. There's no feedback loop.
3. **Default-open software.** Plenty of databases historically shipped binding to all interfaces with no auth, on the reasonable-in-1998 assumption that the network was trusted.
4. **Nobody owns the cleanup.** The person who opened it moved on. Nothing prompts anyone to revisit it.

### What actually prevents it

- **Reference security groups, not CIDRs.** If the only way to reach the database is "be in `sg-web`," there's no temptation to type an IP range.
- **Put things in private subnets.** A resource with no route to an IGW cannot be exposed by a security group mistake. Routing is a stronger guarantee than filtering.
- **Use a bastion or Session Manager instead of open SSH.** AWS Systems Manager Session Manager gives shell access with no inbound port at all — the agent dials out. Port 22 open to the world is a habit worth breaking permanently.
- **Detect continuously.** AWS Config rules, Security Hub, or a scheduled script that flags every `0.0.0.0/0` ingress rule. Exercise 5 below is the manual version.
- **Block it structurally.** An SCP (Volume 2) that denies creating `0.0.0.0/0` ingress rules on sensitive ports. Explicit Deny wins — that's what it's for.

---

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

## TRY THIS ON YOUR MACHINE

Exercises 1, 2, 4, and 5 are **free** — VPCs, subnets, route tables, security groups, and gateway endpoints carry no charge. Exercise 3 launches a `t3.micro` instance, covered by the free tier for the first 12 months of a new account (roughly 0.01 USD/hour otherwise). **No NAT Gateway is created anywhere in this set** — deliberately, since it's the one piece here that costs real money by the hour.

A full teardown script is at the end. Run it.

### 1. Build a VPC and find the missing addresses

```bash
export AWS_DEFAULT_REGION=us-east-1

VPC_ID=$(aws ec2 create-vpc --cidr-block 10.42.0.0/16 \
  --query Vpc.VpcId --output text)
aws ec2 create-tags --resources $VPC_ID --tags Key=Name,Value=volume3-lab
echo "VPC: $VPC_ID"

SUBNET_ID=$(aws ec2 create-subnet --vpc-id $VPC_ID \
  --cidr-block 10.42.1.0/24 --availability-zone us-east-1a \
  --query Subnet.SubnetId --output text)

aws ec2 describe-subnets --subnet-ids $SUBNET_ID \
  --query "Subnets[].{Cidr:CidrBlock,AZ:AvailabilityZone,Available:AvailableIpAddressCount}" \
  --output table
```

**What to expect:** `AvailableIpAddressCount` of **251**, not 256.

**Why it's interesting:** those five missing addresses are the reservations from earlier — router, DNS, network, broadcast, and one held in reserve. On a `/24` it's a rounding error. Try the same with a `/28` and you'll have eleven usable addresses, which is genuinely constraining, and is exactly the arithmetic that bites EKS clusters later.

**Cleanup:** at the end.

### 2. Read the routing table that defines "private"

```bash
aws ec2 describe-route-tables \
  --filters "Name=vpc-id,Values=$VPC_ID" \
  --query "RouteTables[].Routes[].{Dest:DestinationCidrBlock,Target:GatewayId,State:State}" \
  --output table
```

**What to expect:** exactly one route — `10.42.0.0/16` to `local`.

Now attach an internet gateway and watch the subnet change character:

```bash
IGW_ID=$(aws ec2 create-internet-gateway --query InternetGateway.InternetGatewayId --output text)
aws ec2 attach-internet-gateway --internet-gateway-id $IGW_ID --vpc-id $VPC_ID

RTB_ID=$(aws ec2 describe-route-tables --filters "Name=vpc-id,Values=$VPC_ID" \
  --query "RouteTables[0].RouteTableId" --output text)

aws ec2 create-route --route-table-id $RTB_ID \
  --destination-cidr-block 0.0.0.0/0 --gateway-id $IGW_ID

aws ec2 describe-route-tables --route-table-ids $RTB_ID \
  --query "RouteTables[].Routes[].{Dest:DestinationCidrBlock,Target:GatewayId}" --output table
```

**Why it's interesting:** you just converted a private subnet into a public one, and the entire change is one row in a table. There is no "make public" operation. Public is a routing fact. Internalize that and a whole category of AWS confusion dissolves.

### 3. Make statefulness visible

**Free-tier flag: launches one `t3.micro`. Terminated in cleanup.**

First, a security group allowing SSH-style inbound from your own IP only, and a subnet that auto-assigns public IPs:

```bash
aws ec2 modify-subnet-attribute --subnet-id $SUBNET_ID --map-public-ip-on-launch

MY_IP=$(curl -s https://checkip.amazonaws.com)
SG_ID=$(aws ec2 create-security-group --group-name volume3-lab-sg \
  --description "volume 3 lab" --vpc-id $VPC_ID --query GroupId --output text)

aws ec2 authorize-security-group-ingress --group-id $SG_ID \
  --protocol tcp --port 22 --cidr ${MY_IP}/32
```

Launch an instance using Session Manager rather than an SSH key — no key pair, no inbound port needed:

```bash
AMI=$(aws ssm get-parameters \
  --names /aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64 \
  --query "Parameters[0].Value" --output text)

INSTANCE_ID=$(aws ec2 run-instances --image-id $AMI --instance-type t3.micro \
  --subnet-id $SUBNET_ID --security-group-ids $SG_ID \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=volume3-lab}]' \
  --query "Instances[0].InstanceId" --output text)
echo "Instance: $INSTANCE_ID"
```

Now the actual experiment. The security group allows **all outbound** and no inbound except port 22. The instance can still reach the internet — because security groups are stateful, the responses come back without any inbound rule for them.

Check the rules to confirm there is no inbound rule permitting return traffic:

```bash
aws ec2 describe-security-groups --group-ids $SG_ID \
  --query "SecurityGroups[].{In:IpPermissions,Out:IpPermissionsEgress}" --output json
```

**What to expect:** one inbound rule (port 22 from your IP) and one outbound rule (all traffic). Nothing permitting inbound responses on ephemeral ports — and yet outbound connections from the instance work fine.

**Why it's interesting:** that asymmetry is statefulness. Now imagine replicating this with a NACL: you'd need an explicit outbound allow *and* an inbound allow for ports 1024–65535, or every response would vanish. The rules you didn't have to write are the point.

### 4. Give yourself a free S3 gateway endpoint

```bash
aws ec2 create-vpc-endpoint --vpc-id $VPC_ID \
  --service-name com.amazonaws.us-east-1.s3 \
  --route-table-ids $RTB_ID

aws ec2 describe-route-tables --route-table-ids $RTB_ID \
  --query "RouteTables[].Routes[].{Dest:DestinationCidrBlock,Prefix:DestinationPrefixListId,Target:GatewayId}" \
  --output table
```

**What to expect:** a new route whose destination is a **prefix list ID** rather than a CIDR, targeting a `vpce-` gateway.

**Why it's interesting:** the prefix list is a managed, auto-updating set of S3's IP ranges — AWS maintains it so you don't. Because it's more specific than `0.0.0.0/0`, longest-prefix-match sends S3 traffic to the endpoint instead of out through NAT. This single free object is the 230-dollars-a-month fix from earlier in the volume.

Now attach an endpoint policy and watch IAM and networking meet:

```bash
VPCE_ID=$(aws ec2 describe-vpc-endpoints \
  --filters "Name=vpc-id,Values=$VPC_ID" \
  --query "VpcEndpoints[0].VpcEndpointId" --output text)
echo "Endpoint: $VPCE_ID"
```

The default endpoint policy permits everything. In production you'd scope it to your own bucket ARNs — making exfiltration to a foreign bucket impossible at the network layer regardless of credentials.

### 5. Audit your whole account for `0.0.0.0/0`

```bash
for region in $(aws ec2 describe-regions --query "Regions[].RegionName" --output text); do
  result=$(aws ec2 describe-security-groups --region $region \
    --filters Name=ip-permission.cidr,Values=0.0.0.0/0 \
    --query "SecurityGroups[].{Group:GroupId,Name:GroupName,VPC:VpcId}" \
    --output text 2>/dev/null)
  if [ -n "$result" ]; then
    echo "=== $region ==="
    echo "$result"
  fi
done
```

**What to expect:** at minimum, the security group from exercise 3 is *not* listed (it's scoped to your IP), but default security groups and anything you've created loosely will appear.

**Why it's interesting:** this is the manual version of the check that Config, Security Hub, and every cloud security product sell you. Run it against any AWS account you inherit. The results are frequently educational, and occasionally alarming.

**Cleanup:** none — read-only.

### Teardown — run this

VPC components have dependencies, so order matters. Instance termination takes a minute or two.

```bash
aws ec2 terminate-instances --instance-ids $INSTANCE_ID
aws ec2 wait instance-terminated --instance-ids $INSTANCE_ID

aws ec2 delete-vpc-endpoints --vpc-endpoint-ids $VPCE_ID
aws ec2 delete-security-group --group-id $SG_ID
aws ec2 delete-subnet --subnet-id $SUBNET_ID
aws ec2 detach-internet-gateway --internet-gateway-id $IGW_ID --vpc-id $VPC_ID
aws ec2 delete-internet-gateway --internet-gateway-id $IGW_ID
aws ec2 delete-vpc --vpc-id $VPC_ID

echo "Verifying nothing is left:"
aws ec2 describe-vpcs --filters "Name=tag:Name,Values=volume3-lab" \
  --query "Vpcs[].VpcId" --output text
```

The last command should print nothing. If a delete fails with a dependency error, something is still attached — `describe-network-interfaces --filters "Name=vpc-id,Values=$VPC_ID"` will usually tell you what.

---

## What You Should Now Be Able To Say

- Why "public subnet" is a routing property, not a setting
- Why a `/28` subnet gives you 11 usable addresses
- What breaks when a NACL allows inbound 443 but nothing outbound
- Why referencing a security group beats writing a CIDR
- Why VPC peering doesn't scale, and what replaces it
- Why an S3 gateway endpoint is close to a free win
- Which network paths in your architecture generate a bill

---

## Where We Go Next

**Volume 4 — Compute: EC2, EBS, Load Balancing, Auto Scaling.**

You have identity and a network. Now the machines that live in it. We'll go from Xen to Nitro and why AWS ended up designing its own silicon, work through instance families and what the letters actually mean, then EBS — volume types, IOPS, and the burst-credit mechanism that makes instances mysteriously slow down after running fine for hours.

Second half: the load balancer generations (CLB, ALB, NLB) and what each is genuinely for, target groups, health checks, connection draining, and Auto Scaling Groups — including why scaling always lags demand and what you do about it.

Two incidents: **April 21, 2011**, when EBS volumes in a Region tried to re-replicate themselves simultaneously and consumed the capacity they needed to recover — the outage that taught the industry "design for failure." And **Christmas Eve 2012**, when a maintenance process deleted production ELB state data and took Netflix down on one of the highest-traffic nights of the year.

---

*Volume 3 complete. Say **continue** when you're ready for Volume 4.*
