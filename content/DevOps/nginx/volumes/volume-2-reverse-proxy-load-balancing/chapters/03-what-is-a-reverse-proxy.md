## What Is a Reverse Proxy?

A **proxy** is something that acts on behalf of someone else.

A **forward proxy** acts on behalf of the *client*. Your company's web proxy, or a VPN, is a forward proxy — your browser sends requests to the proxy, and the proxy sends them to the internet. The server never sees the real client.

A **reverse proxy** acts on behalf of the *server*. The client sends requests to the reverse proxy (nginx), and nginx forwards them to the backend application server. The client never sees the real server.

```text
Forward proxy:
  Client ──> Proxy ──> Internet Server
  (proxy hides the client)

Reverse proxy:
  Client ──> nginx ──> Backend Application
  (nginx hides the backend)
```

In our analogy: the client is a visitor, nginx is the front desk, and the backend application is the back-office staff. The visitor never goes to the back office directly — the receptionist handles the handoff and brings the answer back.

### Why Use a Reverse Proxy?

The backend application *can* serve requests directly. So why add nginx in front?

| Benefit | What nginx does |
|---|---|
| Connection management | Holds thousands of slow client connections cheaply; sends fast internal requests to the backend |
| Static file serving | Serves CSS, JS, images without bothering the backend |
| TLS termination | Handles HTTPS so the backend deals only with plain HTTP |
| Load balancing | Distributes requests across multiple backend instances |
| Failover | Stops sending requests to a crashed backend |
| Caching | Returns cached responses without hitting the backend |
| Security | Hides backend IPs, adds rate limiting, filters bad requests |

The backend only needs to handle clean, fast, pre-filtered requests. Everything else is nginx's job.

---

