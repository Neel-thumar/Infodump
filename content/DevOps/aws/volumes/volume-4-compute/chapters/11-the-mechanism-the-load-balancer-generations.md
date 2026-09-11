## THE MECHANISM: The Load Balancer Generations

AWS has shipped four, and they are not versions of one product.

### Classic Load Balancer (2009)

The original, simply called Elastic Load Balancing. Operates at both layer 4 and layer 7, with a limited feature set. It predates VPC in its original form.

**Use it for:** nothing new. It still exists for legacy workloads. If you're building today and reaching for CLB, you want ALB or NLB.

### Application Load Balancer (2016)

Layer 7. Understands HTTP and HTTPS, and routes on content:

- **Path-based routing** — `/api/*` to one target group, `/static/*` to another
- **Host-based routing** — different domains to different backends
- Routing on headers, query strings, HTTP method, source IP
- Native HTTP/2 and WebSocket support
- Integrated authentication via OIDC or Cognito
- Targets can be instances, IP addresses, or Lambda functions

**Use it for:** essentially all HTTP workloads.

### Network Load Balancer (2017)

Layer 4. TCP, UDP, and TLS. Built for extreme throughput and very low latency.

- Handles millions of requests per second with latency in the tens of microseconds
- **Static IP per AZ**, and supports Elastic IPs — which matters enormously when a client's firewall needs to allowlist you
- **Preserves the client source IP** by default, so your application sees the real client without reading `X-Forwarded-For`
- Doesn't understand HTTP, so no content-based routing

**Use it for:** non-HTTP protocols, extreme performance requirements, or when you need a fixed IP address.

### Gateway Load Balancer (2020)

Layer 3. Exists to insert third-party network appliances — firewalls, intrusion detection — transparently into your traffic path. Specialized; you'll know when you need it.

### Target groups, and the plumbing that matters

Modern load balancers don't point at instances directly. They point at a **target group**, which holds the targets, the health check configuration, and the protocol settings. A listener rule sends traffic to a target group. This indirection is what makes blue/green deployments and weighted traffic shifting possible.

**Health checks** are the heart of it. Interval, timeout, healthy threshold, unhealthy threshold, and — critically — the **path**.

Get the path wrong and you get one of two bad outcomes. Too shallow (a static file that always returns 200) and the load balancer happily routes traffic to an instance whose database connection is dead. Too deep (a check that queries five downstream services) and a single slow dependency causes your entire fleet to be marked unhealthy and removed from service — turning a partial degradation into a total outage.

**Deregistration delay** (connection draining, default 300 seconds) is what stops a deploy from dropping requests. When a target is removed, the load balancer stops sending *new* connections but lets existing ones finish. If you deregister without draining, every in-flight request dies.

**Cross-zone load balancing** distributes evenly across all AZs rather than evenly across zones. ALB does this always and doesn't charge for it. **NLB has it off by default**, and turning it on incurs cross-AZ data transfer charges (Volume 3, Volume 9).

---

