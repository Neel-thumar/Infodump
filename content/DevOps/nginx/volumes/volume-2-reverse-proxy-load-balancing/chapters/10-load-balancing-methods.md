## Load-Balancing Methods

When an upstream has multiple backends, nginx must decide which one handles each request. This decision is the **load-balancing method**.

### Round Robin (Default)

```nginx
upstream api_backends {
    server backend1:3001;
    server backend2:3001;
}
```

Requests are distributed evenly, one after another: backend-1, backend-2, backend-1, backend-2, ...

**When to use:** The default. Works well when backends are identical and requests are roughly equal in cost.

**When it's not ideal:** When some requests are much heavier than others (one backend gets an expensive query, the other gets a cheap one — the expensive backend falls behind while round-robin keeps sending traffic to both equally).

### Weighted Round Robin

```nginx
upstream api_backends {
    server backend1:3001 weight=3;
    server backend2:3001 weight=1;
}
```

Backend-1 gets 3 out of every 4 requests. Backend-2 gets 1 out of 4.

**When to use:** When backends have different capacities (one machine is more powerful than the other).

### Least Connections

```nginx
upstream api_backends {
    least_conn;
    server backend1:3001;
    server backend2:3001;
}
```

Each new request goes to the backend with the fewest active connections at that moment.

**When to use:** When requests have varying processing times. A backend that finishes fast will have fewer active connections and get more new requests. A backend that's slow on a heavy query won't get piled on.

**When to use over round-robin:** If your API endpoints have unpredictable response times (some return in 5ms, some in 5 seconds), least connections distributes load more fairly than round-robin.

### IP Hash

```nginx
upstream api_backends {
    ip_hash;
    server backend1:3001;
    server backend2:3001;
}
```

The client's IP address determines which backend they go to. The same client IP always hits the same backend (as long as it's healthy).

**When to use:** When the backend stores session state in memory (not in a shared database or Redis). This is called **sticky sessions** — the client "sticks" to one backend.

**When to avoid:** When clients share IPs (corporate NAT, mobile carrier NAT). All users behind the same IP go to the same backend, creating uneven load. Sticky sessions also complicate horizontal scaling — if you add a new backend, the hash redistribution changes where some clients land. If possible, move session state to a shared store (Redis, database) and use round-robin or least connections instead.

### Summary Table

| Method | Directive | Best for |
|---|---|---|
| Round robin | (default) | Equal backends, uniform request cost |
| Weighted | `weight=N` | Backends with different capacities |
| Least connections | `least_conn` | Varying request processing times |
| IP hash | `ip_hash` | Session affinity (sticky sessions) |

There are other methods (random, hash on arbitrary key), but these four cover the vast majority of production use cases.

---

