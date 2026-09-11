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

