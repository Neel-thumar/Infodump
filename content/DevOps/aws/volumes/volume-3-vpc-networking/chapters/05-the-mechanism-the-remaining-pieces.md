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

