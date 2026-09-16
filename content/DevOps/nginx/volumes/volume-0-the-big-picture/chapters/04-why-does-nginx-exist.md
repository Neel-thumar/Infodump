## Why Does nginx Exist?

### The Problem: Too Many Visitors, Not Enough Doors

In the early 2000s, the internet was growing fast. Web servers at the time — primarily Apache — handled each connection by assigning it a dedicated process or thread. This worked fine for a few hundred connections. But when thousands or tens of thousands of users connected simultaneously, each one consumed memory and CPU for its own process/thread, even if most of them were just waiting — waiting for a slow network, waiting for the client to send the next request, waiting for nothing.

This was called the **C10K problem**: how do you handle 10,000 concurrent connections on a single server?

nginx was written by Igor Sysoev and first released in 2004 specifically to solve this problem. Instead of dedicating a process to each connection, nginx uses a different approach: a small number of **worker processes**, each of which can handle **thousands of connections at once** using an **event-driven loop**.

Think of it this way:

- **The old approach (Apache's traditional model):** Hire one receptionist per visitor. When you have 10,000 visitors, you need 10,000 receptionists, most of whom are standing around waiting.
- **nginx's approach:** Hire a few very efficient receptionists. Each one manages thousands of visitors at once by quickly checking in on whoever needs attention right now, instead of standing dedicated to one visitor doing nothing.

This is a simplified picture — Apache also evolved beyond pure process-per-connection — but the core architectural difference is real and explains why nginx became the dominant web server and reverse proxy for high-traffic sites.

### What nginx gives you that your application server doesn't

Your application server (Node.js, Gunicorn, Kestrel, Puma, etc.) *can* receive HTTP requests directly. So why put nginx in front?

| Concern | Application server alone | With nginx in front |
|---|---|---|
| Handling thousands of idle connections | Expensive — each holds a thread/process or goroutine | Cheap — nginx's event loop handles idle connections for almost no cost |
| Serving static files (CSS, JS, images) | Works but wastes application resources | nginx serves them directly from disk, extremely fast |
| TLS termination | Every app needs its own TLS setup | nginx handles TLS once, backends get plain HTTP |
| Load balancing across multiple app instances | You need a separate load balancer | nginx distributes requests across backends |
| Rate limiting and basic protection | You build it into the app (or add middleware) | nginx handles it before the request reaches the app |
| Graceful deploys | Restarting the app drops connections | nginx holds connections while you restart backends behind it |

In production, you almost always want something in front of your application servers. nginx is one of the most common choices for that role.

---

